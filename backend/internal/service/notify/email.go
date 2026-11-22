package notify

import (
	"bytes"
	"context"
	"crypto/tls"
	_ "embed"
	"fmt"
	"html/template"
	"log/slog"

	"github.com/google/uuid"
	"gopkg.in/gomail.v2"

	"github.com/MaximaRasskazov/Academic-debt-system/backend/internal/pgutil"
	"github.com/MaximaRasskazov/Academic-debt-system/backend/internal/repo"
)

// tmplBase — общий layout (шапка с градиентом, футер, блок "details").
// Каждый email-шаблон определяет "heading" и "content", которые
// подставляются в base через template-композицию (см. parseEmail).
//
//go:embed templates/base.html
var tmplBase string

//go:embed templates/retake_scheduled.html
var tmplRetakeScheduled string

//go:embed templates/retake_updated.html
var tmplRetakeUpdated string

//go:embed templates/retake_cancelled.html
var tmplRetakeCancelled string

//go:embed templates/retake_grade_received.html
var tmplRetakeGradeReceived string

//go:embed templates/retake_scheduled_teacher.html
var tmplRetakeScheduledTeacher string

//go:embed templates/retake_updated_teacher.html
var tmplRetakeUpdatedTeacher string

//go:embed templates/retake_cancelled_teacher.html
var tmplRetakeCancelledTeacher string

//go:embed templates/retake_participant_removed.html
var tmplRetakeParticipantRemoved string

//go:embed templates/retake_participant_removed_teacher.html
var tmplRetakeParticipantRemovedTeacher string

//go:embed templates/retake_change_approved.html
var tmplRetakeChangeApproved string

//go:embed templates/retake_change_rejected.html
var tmplRetakeChangeRejected string

//go:embed templates/retake_request_approved.html
var tmplRetakeRequestApproved string

//go:embed templates/retake_request_rejected.html
var tmplRetakeRequestRejected string

//go:embed templates/debt_created.html
var tmplDebtCreated string

//go:embed templates/teacher_request_approved.html
var tmplTeacherRequestApproved string

//go:embed templates/teacher_request_rejected.html
var tmplTeacherRequestRejected string

type emailDefinition struct {
	subject  string
	template *template.Template
}

var emailByKind map[string]emailDefinition

func init() {
	// parseEmail склеивает base-layout с частным шаблоном: сначала
	// парсим base (он несёт "base"/"details" и default-блоки), затем
	// дочитываем content — его define-блоки "heading"/"content"
	// перекрывают дефолтные. Рендерим через ExecuteTemplate("base").
	parseEmail := func(content string) *template.Template {
		return template.Must(template.Must(template.New("email").Parse(tmplBase)).Parse(content))
	}
	emailByKind = map[string]emailDefinition{
		KindRetakeScheduled:                 {subject: "Назначена пересдача", template: parseEmail(tmplRetakeScheduled)},
		KindRetakeUpdated:                   {subject: "Пересдача перенесена", template: parseEmail(tmplRetakeUpdated)},
		KindRetakeCancelled:                 {subject: "Пересдача отменена", template: parseEmail(tmplRetakeCancelled)},
		KindRetakeGradeReceived:             {subject: "Выставлена оценка за пересдачу", template: parseEmail(tmplRetakeGradeReceived)},
		KindRetakeScheduledTeacher:          {subject: "Вы назначены на пересдачу", template: parseEmail(tmplRetakeScheduledTeacher)},
		KindRetakeUpdatedTeacher:            {subject: "Пересдача перенесена", template: parseEmail(tmplRetakeUpdatedTeacher)},
		KindRetakeCancelledTeacher:          {subject: "Пересдача отменена", template: parseEmail(tmplRetakeCancelledTeacher)},
		KindRetakeParticipantRemoved:        {subject: "Вы сняты с пересдачи", template: parseEmail(tmplRetakeParticipantRemoved)},
		KindRetakeParticipantRemovedTeacher: {subject: "Вы сняты с приёма пересдачи", template: parseEmail(tmplRetakeParticipantRemovedTeacher)},
		KindRetakeChangeApproved:            {subject: "Заявка на перенос одобрена", template: parseEmail(tmplRetakeChangeApproved)},
		KindRetakeChangeRejected:            {subject: "Заявка на перенос отклонена", template: parseEmail(tmplRetakeChangeRejected)},
		KindRetakeRequestApproved:           {subject: "Заявка на пересдачу одобрена", template: parseEmail(tmplRetakeRequestApproved)},
		KindRetakeRequestRejected:           {subject: "Заявка на пересдачу отклонена", template: parseEmail(tmplRetakeRequestRejected)},
		KindDebtCreated:                     {subject: "Зафиксирована академическая задолженность", template: parseEmail(tmplDebtCreated)},
		KindTeacherRequestApproved:          {subject: "Заявка на роль преподавателя одобрена", template: parseEmail(tmplTeacherRequestApproved)},
		KindTeacherRequestRejected:          {subject: "Заявка на роль преподавателя отклонена", template: parseEmail(tmplTeacherRequestRejected)},
	}
}

const emailQueueSize = 100

// emailNotifier отправляет письма через SMTP асинхронно:
// основной путь (БД + WS) не блокируется на SMTP-соединении.
// Письма ставятся в буферизованный канал и обрабатываются воркером.
// При переполнении канала событие дропается с предупреждением в лог —
// запись в БД к этому моменту уже есть, история уведомления сохранена.
type emailNotifier struct {
	cfg   EmailConfig
	store *repo.Store
	queue chan Event
	done  chan struct{}
}

func newEmailNotifier(cfg EmailConfig, store *repo.Store) *emailNotifier {
	e := &emailNotifier{
		cfg:   cfg,
		store: store,
		queue: make(chan Event, emailQueueSize),
		done:  make(chan struct{}),
	}
	go e.worker()
	return e
}

// enqueue помещает событие в очередь. Не блокирует вызывающего.
// Если очередь переполнена — логирует и дропает (best-effort канал).
func (e *emailNotifier) enqueue(ev Event) {
	select {
	case e.queue <- ev:
	default:
		slog.Warn("notify: email queue full, dropping event",
			"user_id", ev.UserID, "kind", ev.Kind)
	}
}

// close дренирует очередь и останавливает воркер. Вызывается при
// graceful shutdown сервера — гарантирует отправку писем из буфера.
func (e *emailNotifier) close() {
	close(e.queue)
	<-e.done
}

// worker читает события из канала до его закрытия.
// Ошибки SMTP не прерывают воркер — только в лог.
func (e *emailNotifier) worker() {
	defer close(e.done)
	for ev := range e.queue {
		if err := e.send(context.Background(), ev); err != nil {
			slog.Warn("notify: email worker send failed",
				"user_id", ev.UserID, "kind", ev.Kind, "err", err)
		}
	}
}

func (e *emailNotifier) send(ctx context.Context, ev Event) error {
	if e.cfg.Host == "" {
		return nil // email не настроен — пропускаем канал
	}

	definition, ok := emailByKind[ev.Kind]
	if !ok {
		return nil // нет шаблона — этот тип события не требует email
	}

	userEmail, err := e.userEmail(ctx, ev.UserID)
	if err != nil {
		return fmt.Errorf("email: get user email: %w", err)
	}

	var body bytes.Buffer
	if err := definition.template.ExecuteTemplate(&body, "base", ev.Payload); err != nil {
		return fmt.Errorf("email: render %s: %w", ev.Kind, err)
	}

	m := gomail.NewMessage()
	m.SetHeader("From", e.cfg.From)
	m.SetHeader("To", userEmail)
	m.SetHeader("Subject", definition.subject)
	m.SetBody("text/html", body.String())

	d := gomail.NewDialer(e.cfg.Host, e.cfg.Port, e.cfg.Username, e.cfg.Password)
	// Для локального SMTP (mailpit, порт 1025) сертификат самоподписанный.
	// InsecureSkipVerify безопасен для dev/demo — в проде ставь реальный SMTP.
	if e.cfg.Username == "" {
		d.TLSConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("email: send to %s: %w", userEmail, err)
	}

	slog.Info("email sent", "to", userEmail, "kind", ev.Kind)
	return nil
}

func (e *emailNotifier) userEmail(ctx context.Context, userID uuid.UUID) (string, error) {
	u, err := e.store.GetUserByID(ctx, pgutil.PgUUID(userID))
	if err != nil {
		return "", err
	}
	return u.Email, nil
}

package emulator

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

const gradeSendTimeout = 30 * time.Second

// GradeSender sends a grade to the external system.
type GradeSender interface {
	PatchDebtGrade(ctx context.Context, debtExternalID string, grade Grade, comment *string, idempotencyKey string) error
}

// SendGradeAsync starts a best-effort write-back for a committed grade.
// It uses its own deadline so the send can finish after the request ends.
func SendGradeAsync(sender GradeSender, externalID *string, debtID string, grade int32, logScope string) {
	if sender == nil || externalID == nil {
		return
	}

	extID := *externalID
	payload := Grade{Type: "numeric", Value: int(grade)}
	key := fmt.Sprintf("debt-grade-%s-%d", extID, grade)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), gradeSendTimeout)
		defer cancel()
		if err := sender.PatchDebtGrade(ctx, extID, payload, nil, key); err != nil {
			slog.Warn(logScope+": не удалось отправить оценку в эмулятор (best-effort)",
				"debt_id", debtID, "external_id", extID, "err", err)
		}
	}()
}

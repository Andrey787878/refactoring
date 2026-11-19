import iconAppointed   from '../assets/icons/appointed.svg'
import iconChanged     from '../assets/icons/changed.svg'
import iconAppreciated from '../assets/icons/appreciated.svg'

const appointed = { img: iconAppointed, bg: 'rgba(110,114,200,.12)', label: 'appointed' }
const changed = { img: iconChanged, bg: 'rgba(59,63,224,.10)', label: 'changed' }
const cancelled = { img: null, bg: 'rgba(220,38,38,.08)', label: 'cancelled' }
const grade = { img: iconAppreciated, bg: 'rgba(16,185,129,.10)', label: 'grade' }
const fallback = { img: null, bg: 'rgba(107,114,128,.10)', label: 'bell' }

function scheduleBody(message, dateLabel, { when, where }) {
  return [message, when && `${dateLabel}: ${when}.`, where && `Место: ${where}.`]
    .filter(Boolean).join(' ')
}

const retakeUpdated = {
  meta: changed,
  title: 'Пересдача перенесена',
  body: details => scheduleBody('Детали пересдачи изменены.', 'Новое время', details),
}
const retakeCancelled = {
  meta: cancelled,
  title: 'Пересдача отменена',
  body: ({ reason }) => reason
    ? `Пересдача отменена деканатом. Причина: ${reason}.`
    : 'Пересдача была отменена деканатом.',
}

const notificationFormats = new Map([
  ['retake_scheduled', {
    meta: appointed,
    title: 'Назначена пересдача',
    body: details => scheduleBody('Вам назначена пересдача.', 'Дата', details),
  }],
  ['retake_scheduled_teacher', {
    meta: appointed,
    title: 'Вы назначены на пересдачу',
    body: details => scheduleBody('Вы назначены преподавателем на пересдачу.', 'Дата', details),
  }],
  ['retake_updated', retakeUpdated],
  ['retake_updated_teacher', retakeUpdated],
  ['retake_cancelled', retakeCancelled],
  ['retake_cancelled_teacher', retakeCancelled],
  ['retake_grade_received', {
    meta: grade,
    title: 'Выставлена оценка',
    body: ({ payload }) => payload.grade != null
      ? `По результатам пересдачи выставлена оценка: ${payload.grade}.`
      : 'По результатам пересдачи выставлена итоговая оценка.',
  }],
  ['retake_change_approved', {
    meta: changed,
    title: 'Изменение пересдачи одобрено',
    body: 'Деканат одобрил вашу заявку на изменение пересдачи. Изменения применены.',
  }],
  ['retake_change_rejected', {
    meta: cancelled,
    title: 'Изменение пересдачи отклонено',
    body: ({ reason }) => reason
      ? `Деканат отклонил вашу заявку на изменение пересдачи. Причина: ${reason}.`
      : 'Деканат отклонил вашу заявку на изменение пересдачи.',
  }],
  ['retake_request_approved', {
    meta: appointed,
    title: 'Заявка на пересдачу одобрена',
    body: 'Деканат одобрил вашу заявку на пересдачу. Пересдача создана.',
  }],
  ['retake_request_rejected', {
    meta: cancelled,
    title: 'Заявка на пересдачу отклонена',
    body: ({ reason }) => reason
      ? `Деканат отклонил вашу заявку на пересдачу. Причина: ${reason}.`
      : 'Деканат отклонил вашу заявку на пересдачу.',
  }],
  ['teacher_request_approved', {
    meta: appointed,
    title: 'Заявка на преподавателя одобрена',
    body: 'Ваша заявка на роль преподавателя одобрена деканатом.',
  }],
  ['teacher_request_rejected', {
    meta: cancelled,
    title: 'Заявка на преподавателя отклонена',
    body: ({ reason }) => reason
      ? `Ваша заявка на роль преподавателя отклонена. Причина: ${reason}.`
      : 'Ваша заявка на роль преподавателя отклонена деканатом.',
  }],
])

export function notifMeta(kind) {
  return { ...(notificationFormats.get(kind)?.meta ?? fallback) }
}

export function notifTitle(n) {
  if (n.title) return n.title
  return notificationFormats.get(n.kind ?? n.type)?.title ?? 'Уведомление'
}

function fmtDate(iso) {
  if (!iso) return ''
  // Бэк присылает "2026-05-31 17:00" без timezone — добавляем T чтобы
  // браузер не интерпретировал как UTC (иначе getHours даёт UTC+offset)
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T')
  const d = new Date(normalized)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    + ' в ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export function notifBody(n) {
  if (n.body) return n.body
  const payload = n.payload || {}
  const when = payload.scheduled_at ? fmtDate(payload.scheduled_at) : ''
  const where = [
    payload.building && `корп. ${payload.building}`,
    payload.room && `ауд. ${payload.room}`,
  ].filter(Boolean).join(', ')
  const reason = payload.decision_reason || ''
  const body = notificationFormats.get(n.kind ?? n.type)?.body
  return typeof body === 'function' ? body({ payload, when, where, reason }) : body ?? ''
}

export function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d} д назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

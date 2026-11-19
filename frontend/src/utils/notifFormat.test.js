import { describe, expect, it } from 'vitest'
import iconAppointed from '../assets/icons/appointed.svg'
import iconChanged from '../assets/icons/changed.svg'
import iconAppreciated from '../assets/icons/appreciated.svg'
import { notifBody, notifMeta, notifTitle } from './notifFormat'

const appointed = { img: iconAppointed, bg: 'rgba(110,114,200,.12)', label: 'appointed' }
const changed = { img: iconChanged, bg: 'rgba(59,63,224,.10)', label: 'changed' }
const cancelled = { img: null, bg: 'rgba(220,38,38,.08)', label: 'cancelled' }
const grade = { img: iconAppreciated, bg: 'rgba(16,185,129,.10)', label: 'grade' }
const fallback = { img: null, bg: 'rgba(107,114,128,.10)', label: 'bell' }

describe('оформление уведомлений', () => {
  it.each([
    ['retake_scheduled', appointed, 'Назначена пересдача', 'Вам назначена пересдача.'],
    ['retake_scheduled_teacher', appointed, 'Вы назначены на пересдачу', 'Вы назначены преподавателем на пересдачу.'],
    ['retake_updated', changed, 'Пересдача перенесена', 'Детали пересдачи изменены.'],
    ['retake_updated_teacher', changed, 'Пересдача перенесена', 'Детали пересдачи изменены.'],
    ['retake_cancelled', cancelled, 'Пересдача отменена', 'Пересдача была отменена деканатом.'],
    ['retake_cancelled_teacher', cancelled, 'Пересдача отменена', 'Пересдача была отменена деканатом.'],
    ['retake_grade_received', grade, 'Выставлена оценка', 'По результатам пересдачи выставлена итоговая оценка.'],
    ['retake_change_approved', changed, 'Изменение пересдачи одобрено', 'Деканат одобрил вашу заявку на изменение пересдачи. Изменения применены.'],
    ['retake_change_rejected', cancelled, 'Изменение пересдачи отклонено', 'Деканат отклонил вашу заявку на изменение пересдачи.'],
    ['retake_request_approved', appointed, 'Заявка на пересдачу одобрена', 'Деканат одобрил вашу заявку на пересдачу. Пересдача создана.'],
    ['retake_request_rejected', cancelled, 'Заявка на пересдачу отклонена', 'Деканат отклонил вашу заявку на пересдачу.'],
    ['teacher_request_approved', appointed, 'Заявка на преподавателя одобрена', 'Ваша заявка на роль преподавателя одобрена деканатом.'],
    ['teacher_request_rejected', cancelled, 'Заявка на преподавателя отклонена', 'Ваша заявка на роль преподавателя отклонена деканатом.'],
  ])('%s с пустыми данными', (kind, meta, title, body) => {
    expect(notifMeta(kind)).toEqual(meta)
    expect(notifTitle({ kind })).toBe(title)
    expect(notifBody({ kind })).toBe(body)
  })

  it.each([
    ['retake_scheduled', 'Вам назначена пересдача. Дата: 31 мая в 17:05. Место: корп. Б, ауд. 201.'],
    ['retake_scheduled_teacher', 'Вы назначены преподавателем на пересдачу. Дата: 31 мая в 17:05. Место: корп. Б, ауд. 201.'],
    ['retake_updated_teacher', 'Детали пересдачи изменены. Новое время: 31 мая в 17:05. Место: корп. Б, ауд. 201.'],
  ])('%s подставляет дату и место', (kind, text) => {
    const payload = { scheduled_at: '2026-05-31 17:05', building: 'Б', room: '201' }
    expect(notifBody({ kind, payload })).toBe(text)
  })

  it.each([
    ['retake_cancelled', 'Пересдача отменена деканатом.'],
    ['retake_change_rejected', 'Деканат отклонил вашу заявку на изменение пересдачи.'],
    ['retake_request_rejected', 'Деканат отклонил вашу заявку на пересдачу.'],
    ['teacher_request_rejected', 'Ваша заявка на роль преподавателя отклонена.'],
  ])('%s добавляет причину из данных', (kind, text) => {
    expect(notifBody({ kind, payload: { decision_reason: 'Нет аудитории' } }))
      .toBe(`${text} Причина: Нет аудитории.`)
  })

  it('сохраняет ноль как явно указанную оценку', () => {
    expect(notifBody({ kind: 'retake_grade_received', payload: { grade: 0 } }))
      .toBe('По результатам пересдачи выставлена оценка: 0.')
  })

  it('поддерживает старое поле type и отдаёт приоритет kind', () => {
    const legacy = { type: 'retake_cancelled' }
    expect(notifTitle(legacy)).toBe('Пересдача отменена')
    expect(notifBody(legacy)).toBe('Пересдача была отменена деканатом.')
    const notification = { ...legacy, kind: 'retake_updated' }
    expect(notifTitle(notification)).toBe('Пересдача перенесена')
    expect(notifBody(notification)).toBe('Детали пересдачи изменены.')
  })

  it('учитывает переданные заголовок и текст', () => {
    const notification = { kind: 'retake_cancelled', title: 'Готовый заголовок', body: 'Готовый текст' }
    expect(notifTitle(notification)).toBe('Готовый заголовок')
    expect(notifBody(notification)).toBe('Готовый текст')
  })

  it.each(['retake_participant_removed', 'constructor', undefined])(
    'возвращает запасное оформление для %s',
    kind => {
      expect(notifMeta(kind)).toEqual(fallback)
      expect(notifTitle({ kind })).toBe('Уведомление')
      expect(notifBody({ kind })).toBe('')
    },
  )

  it('изменение возвращённого значка не влияет на другие уведомления', () => {
    notifMeta('retake_scheduled').label = 'custom'
    expect(notifMeta('retake_scheduled')).toEqual(appointed)
    expect(notifMeta('retake_scheduled_teacher')).toEqual(appointed)
  })
})

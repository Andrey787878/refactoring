const STATUS_MAP = {
  in_progress: { label: 'Проводится', bg: 'rgba(245,158,11,.12)', color: '#d97706' },
  completed:   { label: 'Завершена',  bg: 'rgba(5,150,105,.1)',   color: '#059669' },
}

function fullName(s) { return [s.lastName, s.firstName, s.middleName].filter(Boolean).join(' ') }
function typeLabel(t) { return t === 'commission' ? 'С комиссией' : 'Обычная' }
function resultLabel(result, status) {
  if (result === 0) return 'Н/я'
  if (result !== null && result !== undefined) return String(result)
  return status === 'completed' ? 'Долг' : '—'
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function formatLong(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}
function formatShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export async function exportStatementExcel(retake, students) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  appendSheet(XLSX, wb, retake, students)
  XLSX.writeFile(wb, `Ведомость_${retake.subject}_${retake.date}.xlsx`)
}

export async function exportStatementsExcel(retakes) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()
  retakes.forEach((r, i) => {
    const name = r.subject.slice(0, 26).replace(/[*?:/\\[\]]/g, '_')
      + (r.subject.length > 26 ? `_${i + 1}` : '')
    appendSheet(XLSX, wb, r, r.students, name)
  })
  XLSX.writeFile(wb, 'Ведомость_все_пересдачи.xlsx')
}

function appendSheet(XLSX, wb, retake, students, sheetName) {
  const rows = [
    ['ВЕДОМОСТЬ ПЕРЕСДАЧИ'],
    [],
    ['Дисциплина:',      retake.subject],
    ['Дата:',            formatLong(retake.date)],
    ['Время:',           retake.time],
    ['Место:',           `Корпус ${retake.building}, аудитория ${retake.room}`],
    ['Тип пересдачи:',   typeLabel(retake.type)],
    ['Статус:',          STATUS_MAP[retake.status]?.label || retake.status],
    ['Преподаватель(и):', retake.teachers.join('; ')],
    [],
    ['№', 'ФИО студента', 'Группа', 'Результат'],
    ...students.map((s, i) => [i + 1, fullName(s), s.group, resultLabel(s.result, retake.status)]),
    [],
    ['Преподаватель:', retake.teachers[0] || ''],
    ['Дата составления:', formatShort(todayStr())],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols']   = [{ wch: 6 }, { wch: 36 }, { wch: 12 }, { wch: 10 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || retake.subject).slice(0, 31))
}

export async function exportStatementWord(retake, students) {
  const libs = await import('docx')
  const doc  = buildWordDoc(libs, [{ retake, students }])
  const blob = await libs.Packer.toBlob(doc)
  downloadBlob(blob, `Ведомость_${retake.subject}_${retake.date}.docx`)
}

export async function exportStatementsWord(retakes) {
  const libs  = await import('docx')
  const items = retakes.map(r => ({ retake: r, students: r.students }))
  const doc   = buildWordDoc(libs, items)
  const blob  = await libs.Packer.toBlob(doc)
  downloadBlob(blob, 'Ведомость_все_пересдачи.docx')
}

function buildWordDoc(libs, items) {
  const {
    Document, Paragraph, Table, TableRow, TableCell,
    TextRun, AlignmentType, WidthType,
  } = libs

  const PT  = n => n * 2
  const CM  = n => Math.round(n * 567)

  const brd = { style: 'single', size: 4, color: '000000' }
  const allBorders = { top: brd, bottom: brd, left: brd, right: brd }

  function p(text, opts = {}) {
    return new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      pageBreakBefore: !!opts.pageBreak,
      spacing: { before: CM(opts.before ?? 0), after: CM(opts.after ?? 0.18) },
      children: [new TextRun({
        text: String(text),
        bold:      !!opts.bold,
        size:      PT(opts.size ?? 12),
        font:      'Times New Roman',
        underline: opts.underline ? {} : undefined,
      })],
    })
  }

  function cell(text, opts = {}) {
    return new TableCell({
      columnSpan: opts.span,
      width: opts.w ? { size: opts.w, type: WidthType.PERCENTAGE } : undefined,
      shading: opts.shade ? { fill: 'EEEEEE' } : undefined,
      borders: allBorders,
      children: [new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({
          text:  String(text),
          bold:  !!opts.bold,
          size:  PT(opts.size ?? 11),
          font:  'Times New Roman',
        })],
      })],
    })
  }

  const children = []

  items.forEach(({ retake, students }, idx) => {
    if (idx > 0) children.push(p('', { pageBreak: true }))

    /* Шапка */
    children.push(
      p('ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ ОБРАЗОВАТЕЛЬНОЕ УЧРЕЖДЕНИЕ ВЫСШЕГО ОБРАЗОВАНИЯ', { align: AlignmentType.CENTER, size: 14 }),
      p('ЮГОРСКИЙ ГОСУДАРСТВЕННЫЙ УНИВЕРСИТЕТ', { align: AlignmentType.CENTER, size: 14, after: 0.3 }),
      p('ВЕДОМОСТЬ ПЕРЕСДАЧИ', { align: AlignmentType.CENTER, bold: true, size: 16, before: 0.3, after: 0.5 }),
    )

    /* Таблица с информацией о пересдаче */
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [
          cell('Дисциплина:', { bold: true, shade: true, w: 26 }),
          cell(retake.subject, { bold: true, span: 3 }),
        ]}),
        new TableRow({ children: [
          cell('Дата:', { bold: true, shade: true }),
          cell(formatLong(retake.date), { w: 28 }),
          cell('Время:', { bold: true, shade: true, w: 13 }),
          cell(retake.time, { w: 13 }),
        ]}),
        new TableRow({ children: [
          cell('Место проведения:', { bold: true, shade: true }),
          cell(`Корпус ${retake.building}, аудитория ${retake.room}`, { span: 3 }),
        ]}),
        new TableRow({ children: [
          cell('Тип пересдачи:', { bold: true, shade: true }),
          cell(typeLabel(retake.type)),
          cell('Статус:', { bold: true, shade: true }),
          cell(STATUS_MAP[retake.status]?.label || retake.status),
        ]}),
        new TableRow({ children: [
          cell('Преподаватель(и):', { bold: true, shade: true }),
          cell(retake.teachers.join(', '), { span: 3 }),
        ]}),
      ],
    }))

    /* Таблица студентов */
    children.push(p('Список студентов:', { bold: true, before: 0.45, after: 0.2 }))
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell('№',              { bold: true, align: AlignmentType.CENTER, w: 5,  shade: true }),
            cell('ФИО студента',   { bold: true,                              w: 43, shade: true }),
            cell('Группа',         { bold: true, align: AlignmentType.CENTER, w: 14, shade: true }),
            cell('Результат',      { bold: true, align: AlignmentType.CENTER, w: 13, shade: true }),
            cell('Подпись',        { bold: true, align: AlignmentType.CENTER, w: 25, shade: true }),
          ],
        }),
        ...students.map((s, i) => new TableRow({
          children: [
            cell(i + 1,              { align: AlignmentType.CENTER }),
            cell(fullName(s)),
            cell(s.group,            { align: AlignmentType.CENTER }),
            cell(resultLabel(s.result, retake.status), { align: AlignmentType.CENTER, bold: true }),
            cell(''),
          ],
        })),
      ],
    }))

    /* Подпись */
    children.push(
      p(`Преподаватель: ___________________________ / ${retake.teachers[0] || ''} /`, { before: 0.55 }),
      p(`Дата составления: ${formatShort(todayStr())}`, { before: 0.2 }),
    )
  })

  return new Document({
    styles: {
      default: { document: { run: { font: 'Times New Roman', size: PT(12) } } },
    },
    sections: [{
      properties: {
        page: { margin: { top: CM(2), right: CM(1.5), bottom: CM(2), left: CM(3) } },
      },
      children,
    }],
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

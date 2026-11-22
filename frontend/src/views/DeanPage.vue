<script setup>
import { ref, computed, onMounted } from 'vue'

import AppHeader from '../components/AppHeader.vue'
import AppSidebar from '../components/AppSidebar.vue'
import CalendarWidget from '../components/CalendarWidget.vue'
import UpcomingRetakes from '../components/UpcomingRetakes.vue'
import StatCard from '../components/StatCard.vue'
import EmptyPlate from '../components/EmptyPlate.vue'
import FilterSelect from '../components/FilterSelect.vue'
import DeanRetakeCreateForm from '../components/DeanRetakeCreateForm.vue'
import { debtsApi } from '../api/debts'
import { usersApi } from '../api/users'
import { retakesApi } from '../api/retakes'
import { disciplinesApi } from '../api/disciplines'
import { partsInTZ } from '../utils/datetime'

const sidebarOpen = ref(false)

// ── Stats ─────────────────────────────────────────────────────
const upcomingRetakes = ref([])
const stats = ref([
  { key: 'debts',     label: 'Академические долги', value: '—', accent: '#e63c5a' },
  { key: 'scheduled', label: 'Запланировано',       value: '—', accent: '#3b3fe0' },
  { key: 'progress',  label: 'Проводится сейчас',   value: '—', accent: '#f59e0b' },
  { key: 'done',      label: 'Завершено в месяце',  value: '—', accent: '#10b981' },
])

// Какая карточка раскрыта: 'debts' | 'scheduled' | null
const activePanel = ref(null)
function togglePanel(key) {
  if (key !== 'debts' && key !== 'scheduled') return
  activePanel.value = activePanel.value === key ? null : key
  if (activePanel.value === 'debts' && debtTableRows.value.length === 0) loadDebtTable()
}

// ── Debt summary table (панель декана) ────────────────────────
const debtTableLoading = ref(false)
// Только актуальные долги (open). Закрытые/отменённые не показываем.
const debtTableRows    = ref([])   // [{id, discipline, disciplineCode, student, group, teacher}]

// Фильтры: группа / преподаватель / предмет (выпадающие списки)
const filterGroup   = ref('')
const filterTeacher = ref('')
const filterDisc    = ref('')

const debtGroups   = computed(() => [...new Set(debtTableRows.value.map(r => r.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))
const debtTeachers = computed(() => [...new Set(debtTableRows.value.map(r => r.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))
const debtDiscs    = computed(() => [...new Set(debtTableRows.value.map(r => r.discipline).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))

const hasActiveFilters = computed(() => !!(filterGroup.value || filterTeacher.value || filterDisc.value))
function resetFilters() {
  filterGroup.value = ''
  filterTeacher.value = ''
  filterDisc.value = ''
}

const filteredDebtRows = computed(() =>
  debtTableRows.value.filter(r =>
    (!filterGroup.value   || r.group === filterGroup.value) &&
    (!filterTeacher.value || r.teacher === filterTeacher.value) &&
    (!filterDisc.value    || r.discipline === filterDisc.value)
  )
)

// Тянет все страницы списочного эндпойнта (limit/offset → {items,total}).
// Нужно, чтобы таблица и выгрузка содержали ВСЕ записи, а не первую страницу.
async function fetchAllPages(apiFn, extraParams = {}, pageSize = 500) {
  const all = []
  let offset = 0
  for (;;) {
    const res = await apiFn({ ...extraParams, limit: pageSize, offset })
    const items = res.data.items ?? res.data ?? []
    all.push(...items)
    const total = res.data.total
    if (items.length < pageSize || (typeof total === 'number' && all.length >= total)) break
    offset += pageSize
  }
  return all
}

async function loadDebtTable() {
  debtTableLoading.value = true
  try {
    const [debtsRes, usersRes, discsRes] = await Promise.allSettled([
      // pageSize 200 = максимум, который отдаёт бэк (/api/debts maxLimit).
      // Больший pageSize ломал бы догрузку: бэк вернул бы меньше, чем
      // запросили, и цикл остановился бы, не добрав остальные страницы.
      fetchAllPages(debtsApi.getAll, {}, 200),
      fetchAllPages(usersApi.getAll, {}, 1000),
      fetchAllPages(disciplinesApi.getAll),
    ])

    const userMap = {}
    if (usersRes.status === 'fulfilled') {
      for (const u of usersRes.value) {
        userMap[u.id] = {
          name: [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ') || u.email,
          group: u.group_name || '',
        }
      }
    }

    const discMapLocal = {}
    if (discsRes.status === 'fulfilled') {
      for (const d of discsRes.value) {
        discMapLocal[d.id] = { name: d.name, code: d.code }
      }
    }

    const rows = []
    if (debtsRes.status === 'fulfilled') {
      for (const d of debtsRes.value) {
        if (d.deleted_at) continue
        if (d.status !== 'open') continue   // только актуальные долги
        const disc    = discMapLocal[d.discipline_id] ?? { name: d.discipline_id, code: '' }
        const student = userMap[d.student_id] ?? { name: d.student_id, group: '' }
        const teacher = userMap[d.issued_by]  ?? { name: d.issued_by, group: '' }
        rows.push({
          id:             d.id,
          discipline:     disc.name,
          disciplineCode: disc.code,
          student:        student.name,
          group:          student.group,
          teacher:        teacher.name,
        })
      }
    }
    rows.sort((a, b) => a.discipline.localeCompare(b.discipline, 'ru') || a.student.localeCompare(b.student, 'ru'))
    debtTableRows.value = rows
  } finally {
    debtTableLoading.value = false
  }
}

// Подпись активных фильтров для шапки документа.
function activeFilterCaption() {
  const parts = []
  if (filterDisc.value)    parts.push(`Дисциплина: ${filterDisc.value}`)
  if (filterGroup.value)   parts.push(`Группа: ${filterGroup.value}`)
  if (filterTeacher.value) parts.push(`Преподаватель: ${filterTeacher.value}`)
  return parts.length ? parts.join('; ') : 'Все дисциплины, группы и преподаватели'
}

function todayLong() {
  return new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function doExportExcel() {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const aoa = [
    ['ЮГОРСКИЙ ГОСУДАРСТВЕННЫЙ УНИВЕРСИТЕТ'],
    ['СВЕДЕНИЯ ОБ АКАДЕМИЧЕСКИХ ЗАДОЛЖЕННОСТЯХ'],
    [],
    ['Выборка:', activeFilterCaption()],
    ['Дата формирования:', todayLong()],
    ['Всего записей:', filteredDebtRows.value.length],
    [],
    ['№', 'Дисциплина', 'Код', 'Студент', 'Группа', 'Преподаватель'],
    ...filteredDebtRows.value.map((r, i) => [i + 1, r.discipline, r.disciplineCode, r.student, r.group, r.teacher]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 5 }, { wch: 34 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 30 }]
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Задолженности')
  XLSX.writeFile(wb, `Академические_задолженности_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function doExportWord() {
  const libs = await import('docx')
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, AlignmentType, WidthType,
  } = libs

  const PT = n => n * 2
  const CM = n => Math.round(n * 567)
  const brd = { style: 'single', size: 4, color: '000000' }
  const allBorders = { top: brd, bottom: brd, left: brd, right: brd }

  const p = (text, o = {}) => new Paragraph({
    alignment: o.align ?? AlignmentType.LEFT,
    spacing: { before: CM(o.before ?? 0), after: CM(o.after ?? 0.18) },
    children: [new TextRun({ text: String(text), bold: !!o.bold, size: PT(o.size ?? 12), font: 'Times New Roman' })],
  })
  const cell = (text, o = {}) => new TableCell({
    width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
    shading: o.shade ? { fill: 'EEEEEE' } : undefined,
    borders: allBorders,
    children: [new Paragraph({
      alignment: o.align ?? AlignmentType.LEFT,
      children: [new TextRun({ text: String(text), bold: !!o.bold, size: PT(o.size ?? 11), font: 'Times New Roman' })],
    })],
  })

  const rows = filteredDebtRows.value
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('№',            { bold: true, align: AlignmentType.CENTER, w: 6,  shade: true }),
      cell('Дисциплина',   { bold: true, w: 30, shade: true }),
      cell('Студент',      { bold: true, w: 28, shade: true }),
      cell('Группа',       { bold: true, align: AlignmentType.CENTER, w: 12, shade: true }),
      cell('Преподаватель',{ bold: true, w: 24, shade: true }),
    ],
  })
  const bodyRows = rows.map((r, i) => new TableRow({
    children: [
      cell(i + 1, { align: AlignmentType.CENTER }),
      cell(r.disciplineCode ? `${r.discipline} (${r.disciplineCode})` : r.discipline),
      cell(r.student),
      cell(r.group || '—', { align: AlignmentType.CENTER }),
      cell(r.teacher),
    ],
  }))

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: PT(12) } } } },
    sections: [{
      properties: { page: { margin: { top: CM(2), right: CM(1.5), bottom: CM(2), left: CM(3) } } },
      children: [
        p('ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ ОБРАЗОВАТЕЛЬНОЕ УЧРЕЖДЕНИЕ ВЫСШЕГО ОБРАЗОВАНИЯ', { align: AlignmentType.CENTER, size: 13 }),
        p('ЮГОРСКИЙ ГОСУДАРСТВЕННЫЙ УНИВЕРСИТЕТ', { align: AlignmentType.CENTER, size: 13, after: 0.3 }),
        p('СВЕДЕНИЯ ОБ АКАДЕМИЧЕСКИХ ЗАДОЛЖЕННОСТЯХ', { align: AlignmentType.CENTER, bold: true, size: 16, before: 0.3, after: 0.4 }),
        p(`Выборка: ${activeFilterCaption()}`, { size: 11 }),
        p(`Дата формирования: ${todayLong()}`, { size: 11, after: 0.35 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...bodyRows] }),
        p(`Всего задолженностей: ${rows.length}`, { bold: true, before: 0.4 }),
        p('Декан: ___________________________ /________________/', { before: 0.7 }),
        p(`Дата составления: ${new Date().toLocaleDateString('ru-RU')}`, { before: 0.25 }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), {
    href: url, download: `Академические_задолженности_${new Date().toISOString().slice(0, 10)}.docx`,
  })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Запланированные пересдачи (вторая карточка) ───────────────
const scheduledRetakes = ref([])   // [{id, subject, dateLabel, timeLabel, building, room}]

// Shared with the create form and dashboard retake labels.
const disciplines = ref([])
const discMap = ref({})

async function loadDashboard() {
  const [summaryRes, retakesRes, scheduledRes, disciplinesRes] = await Promise.allSettled([
    debtsApi.getSummary(),
    retakesApi.getAll({ limit: 200 }),
    retakesApi.getAll({ status: 'scheduled', limit: 100 }),
    disciplinesApi.getAll({ limit: 200 }),
  ])

  if (disciplinesRes.status === 'fulfilled') {
    disciplines.value = disciplinesRes.value.data.items ?? []
    for (const d of disciplines.value) discMap.value[d.id] = d.name || d.code
  }

  let totalDebts = 0
  if (summaryRes.status === 'fulfilled')
    totalDebts = (summaryRes.value.data ?? []).reduce((s, r) => s + (r.open_count ?? 0), 0)

  let scheduledCount = 0, inProgress = 0, completedMonth = 0
  if (retakesRes.status === 'fulfilled') {
    const items = retakesRes.value.data.items ?? []
    scheduledCount = items.filter(r => r.status === 'scheduled').length
    inProgress = items.filter(r => r.status === 'in_progress').length
    const now = new Date()
    completedMonth = items.filter(r => {
      if (r.status !== 'completed') return false
      const d = new Date(r.completed_at ?? r.updated_at ?? r.created_at)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
  }

  stats.value = [
    { key: 'debts',     label: 'Академические долги', value: totalDebts,     accent: '#e63c5a' },
    { key: 'scheduled', label: 'Запланировано',       value: scheduledCount, accent: '#3b3fe0' },
    { key: 'progress',  label: 'Проводится сейчас',   value: inProgress,     accent: '#f59e0b' },
    { key: 'done',      label: 'Завершено в месяце',  value: completedMonth, accent: '#10b981' },
  ]

  if (scheduledRes.status === 'fulfilled') {
    const scheduledItems = (scheduledRes.value.data.items ?? [])
    upcomingRetakes.value = scheduledItems.map(r => {
      // Время вуза (Ханты, UTC+5), а не зона устройства.
      const p = partsInTZ(r.scheduled_at)
      return {
        id: r.id,
        subject: discMap.value[r.discipline_id] || 'Дисциплина',
        day: Number(p.day), month: Number(p.month), year: Number(p.year),
        time: `${p.hour}:${p.minute}`,
        building: r.building, room: r.room,
      }
    })
    // Список для панели «Запланировано» (с подписями даты/времени)
    scheduledRetakes.value = scheduledItems.map(r => {
      const p = partsInTZ(r.scheduled_at)
      return {
        id: r.id,
        subject: discMap.value[r.discipline_id] || 'Дисциплина',
        dateLabel: `${p.day}.${p.month}.${p.year}`,
        timeLabel: `${p.hour}:${p.minute}`,
        building: r.building, room: r.room,
      }
    })
  }
}

onMounted(async () => {
  await loadDashboard()
})
</script>

<template>
  <div class="dean-root">

    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="page-dean">

      <AppHeader @open-sidebar="sidebarOpen = true" />

      <main class="main">

        <!-- Левая колонка 70% -->
        <section class="col-left">

          <div class="stats-grid">
            <StatCard
              v-for="s in stats" :key="s.key"
              :label="s.label"
              :value="s.value"
              :clickable="s.key === 'debts' || s.key === 'scheduled'"
              :active="activePanel === s.key"
              @click="togglePanel(s.key)"
            />
          </div>

          <!-- Панель: Актуальные академические долги -->
          <Transition name="panel">
            <div v-if="activePanel === 'debts'" class="debt-table-card">
              <div class="debt-table-head">
                <h3 class="debt-table-title">Актуальные академические долги</h3>
                <div class="debt-table-actions">
                  <button class="btn-exp excel" @click="doExportExcel" :disabled="debtTableLoading || !filteredDebtRows.length">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                    </svg>
                    Excel
                  </button>
                  <button class="btn-exp word" @click="doExportWord" :disabled="debtTableLoading || !filteredDebtRows.length">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13l2 4 2-4 2 4"/>
                    </svg>
                    Word
                  </button>
                  <button class="debt-table-close" @click="activePanel = null">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>

              <!-- Фильтры -->
              <div class="filters-bar">
                <FilterSelect v-model="filterDisc" :options="debtDiscs" placeholder="Все предметы" />
                <FilterSelect v-model="filterGroup" :options="debtGroups" placeholder="Все группы" />
                <FilterSelect v-model="filterTeacher" :options="debtTeachers" placeholder="Все преподаватели" />
                <button class="btn-reset" :disabled="!hasActiveFilters" @click="resetFilters">Сбросить фильтры</button>
              </div>

              <div v-if="debtTableLoading" class="debt-table-state">
                <div class="spinner" /><span>Загрузка данных…</span>
              </div>
              <EmptyPlate
                v-else-if="filteredDebtRows.length === 0"
                icon="check"
                :text="hasActiveFilters ? 'По выбранным фильтрам долгов нет' : 'Актуальных долгов нет'"
              />
              <div v-else class="debt-table-wrap">
                <table class="debt-table">
                  <thead>
                    <tr>
                      <th>Дисциплина</th>
                      <th>Студент</th>
                      <th>Группа</th>
                      <th>Преподаватель</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in filteredDebtRows" :key="r.id">
                      <td>
                        <div class="td-disc-name">{{ r.discipline }}</div>
                        <div v-if="r.disciplineCode" class="td-disc-code">{{ r.disciplineCode }}</div>
                      </td>
                      <td>{{ r.student }}</td>
                      <td>{{ r.group || '—' }}</td>
                      <td>{{ r.teacher }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="!debtTableLoading && filteredDebtRows.length > 0" class="debt-table-foot">
                Показано {{ filteredDebtRows.length }} из {{ debtTableRows.length }} записей
              </div>
            </div>
          </Transition>

          <!-- Панель: Запланированные пересдачи -->
          <Transition name="panel">
            <div v-if="activePanel === 'scheduled'" class="debt-table-card">
              <div class="debt-table-head">
                <h3 class="debt-table-title">Запланированные пересдачи</h3>
                <button class="debt-table-close" @click="activePanel = null">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <EmptyPlate
                v-if="scheduledRetakes.length === 0"
                icon="calendar"
                text="Запланированных пересдач нет"
              />
              <ul v-else class="sched-list">
                <li v-for="r in scheduledRetakes" :key="r.id" class="sched-row">
                  <div class="sched-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <div class="sched-body">
                    <span class="sched-subject">{{ r.subject }}</span>
                    <span class="sched-meta">
                      {{ r.dateLabel }} · {{ r.timeLabel }}
                      <template v-if="r.building || r.room">· {{ r.building ? `корп. ${r.building}` : '' }}{{ r.room ? ` ауд. ${r.room}` : '' }}</template>
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </Transition>

          <DeanRetakeCreateForm :disciplines="disciplines" :refresh-dashboard="loadDashboard" />

        </section>

        <!-- Правая колонка 30% -->
        <section class="col-right">
          <CalendarWidget :retakes="upcomingRetakes" />
          <UpcomingRetakes :retakes="upcomingRetakes" />
        </section>

      </main>
    </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; }

.dean-root {
  --bg:        #f3f4f7;
  --card:      #ffffff;
  --ink:       #1a1d24;
  --ink-soft:  #6b7280;
  --line:      #d7d9e0;
  --brand:     #3b3fe0;
  --brand-ink: #2a2e9e;
  --radius:    10px;
  --shadow:    0 2px 8px rgba(20,22,60,.07);
  --ease:      cubic-bezier(.2,.7,.2,1);
  min-height: 100dvh;
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

.page-dean { min-height: 100dvh; background: var(--bg); display: flex; flex-direction: column; }

.main {
  flex: 1; display: grid; grid-template-columns: 7fr 3fr;
  gap: 24px; padding: 24px; align-items: start;
}

/* ── Stats ── */
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }

/* ── Panel transition ── */
.panel-enter-active { transition: opacity .2s var(--ease), transform .2s var(--ease); }
.panel-leave-active { transition: opacity .15s var(--ease), transform .15s var(--ease); }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateY(-8px); }

/* ── Debt table card ── */
.debt-table-card {
  background: var(--card); border-radius: var(--radius);
  box-shadow: var(--shadow); overflow: hidden;
  border: 1.5px solid rgba(59,63,224,.15); margin-bottom: 24px;
}
.debt-table-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--line);
  gap: 10px; flex-wrap: wrap;
}
.debt-table-title {
  font-family: 'Gerhaus', 'Inter', sans-serif;
  font-size: 14px; font-weight: 700; color: #3C38B6; margin: 0; white-space: nowrap;
}
.debt-table-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* ── Export buttons (как в ведомости) ── */
.btn-exp {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: 8px;
  font: 600 12px/1 'Inter', sans-serif; cursor: pointer; white-space: nowrap;
  background: #fff; transition: background .15s, border-color .15s;
}
.btn-exp svg { width: 14px; height: 14px; flex-shrink: 0; }
.btn-exp:disabled { opacity: .4; cursor: not-allowed; }
.btn-exp.excel { border: 1.5px solid #1a7340; color: #1a7340; }
.btn-exp.excel:hover:not(:disabled) { background: rgba(26,115,64,.07); }
.btn-exp.word  { border: 1.5px solid #1a56a0; color: #1a56a0; }
.btn-exp.word:hover:not(:disabled)  { background: rgba(26,86,160,.07); }

/* ── Фильтры ── */
.filters-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 20px; border-bottom: 1px solid var(--line); background: #fafbfc;
}
.btn-reset {
  height: 36px; padding: 0 14px; flex-shrink: 0;
  border: 1.5px solid var(--line); border-radius: 8px;
  background: #fff; font: 600 12px/1 'Inter', sans-serif; color: var(--ink-soft);
  cursor: pointer; white-space: nowrap;
  transition: border-color .15s, color .15s, background .15s;
}
.btn-reset:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); background: rgba(59,63,224,.04); }
.btn-reset:disabled { opacity: .4; cursor: not-allowed; }

.debt-table-close {
  width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
  background: none; border: none; cursor: pointer;
  display: grid; place-items: center; color: var(--ink-soft);
  transition: background .15s;
}
.debt-table-close:hover { background: var(--bg); color: var(--ink); }
.debt-table-close svg { width: 14px; height: 14px; }

.debt-table-state {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 32px; font: 13px/1 'Inter', sans-serif; color: var(--ink-soft);
}

.debt-table-wrap { overflow-x: auto; max-height: 480px; overflow-y: auto; }
.debt-table-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
.debt-table-wrap::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }

.debt-table { width: 100%; border-collapse: collapse; font: 13px/1.4 'Inter', sans-serif; }
.debt-table thead tr { position: sticky; top: 0; z-index: 2; }
.debt-table th {
  background: #f8f9fb; padding: 9px 14px;
  font: 600 12px/1 'Inter', sans-serif; color: var(--ink-soft);
  text-align: left; white-space: nowrap; border-bottom: 1px solid var(--line);
}
.debt-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); color: var(--ink); vertical-align: middle; text-align: left; }
.debt-table .td-disc-name, .debt-table .td-disc-code { text-align: left; }
.debt-table tbody tr:last-child td { border-bottom: none; }
.debt-table tbody tr:hover td { background: rgba(59,63,224,.025); }

.td-disc-name { font-weight: 500; }
.td-disc-code { font-size: 11px; color: var(--ink-soft); margin-top: 2px; }

.debt-table-foot {
  padding: 8px 20px; border-top: 1px solid var(--line);
  font: 11px/1 'Inter', sans-serif; color: var(--ink-soft); text-align: left;
}

/* ── Запланированные пересдачи ── */
.sched-list { list-style: none; margin: 0; padding: 0; max-height: 480px; overflow-y: auto; }
.sched-list::-webkit-scrollbar { width: 4px; }
.sched-list::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }
.sched-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 20px; border-bottom: 1px solid var(--line);
  transition: background .12s;
}
.sched-row:last-child { border-bottom: none; }
.sched-row:hover { background: rgba(59,63,224,.025); }
.sched-icon {
  width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
  background: rgba(59,63,224,.08); color: var(--brand);
  display: grid; place-items: center;
}
.sched-icon svg { width: 18px; height: 18px; }
.sched-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; text-align: left; }
.sched-subject { font: 500 13px/1.4 'Inter', sans-serif; color: var(--ink); }
.sched-meta { font: 12px/1.4 'Inter', sans-serif; color: var(--ink-soft); }

/* ── Responsive ── */
@media (max-width: 1280px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 960px) {
  .main { grid-template-columns: 1fr; }
  .col-right { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
}
@media (max-width: 600px) {
  .main { padding: 16px; gap: 16px; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .col-right { grid-template-columns: 1fr; }
}
</style>

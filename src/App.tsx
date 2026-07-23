import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import { AlertTriangle, ArrowLeft, BarChart3, CalendarDays, Check, ChevronRight, CirclePlus, CreditCard, Database, Download, Home, Info, List, Moon, Pencil, Search, Settings, Sun, Trash2, Upload, WalletCards, X } from 'lucide-react'
import type { InstallmentItem, InstallmentPayment, ItemFormData, RecurringExpense, Tab } from './types'
import { calculatePaidCount, emptyForm, formatAmountInput, formatWon, formFromItem, installmentScheduleChanged, itemFromForm, localDate, formatMonthKey, monthKey, monthPaid, monthScheduled, myRemainingAmount, myShare, nextPayment, paidAmount, paymentDisplayStatus, paymentStatusLabel, progress, recurringActiveInMonth, remainingAmount, shiftMonthKey, splitShares, todayKey, validateItemForm } from './utils'
import { sampleItems } from './sample'
import { RecurringView } from './Recurring'
import { BACKUP_META_KEY, DATA_KEY, loadStoredItems, loadStoredRecurring, ONBOARDING_KEY, parseBackup, RECURRING_KEY, SETTINGS_KEY, type ParsedBackup } from './storage'

const DARK_KEY = SETTINGS_KEY
const defaultSplitNames = ['나', '참여자 2']
const categories = ['전자기기', '생활가전', '가구', '자동차', '여행', '교육', '병원', '쇼핑', '기타']
type AppModal = 'form' | 'detail' | 'split' | 'ending' | 'add-choice' | 'import-preview' | null
type InstallmentSort = 'next' | 'my-desc' | 'my-asc' | 'total-desc' | 'total-asc' | 'end' | 'remaining-desc' | 'remaining-asc' | 'progress-desc' | 'recent'
const INSTALLMENT_SORT_KEY = 'expense-note-installment-sort'
const tabOrder: Tab[] = ['home', 'list', 'recurring', 'stats', 'settings']
const installmentSorts: InstallmentSort[] = ['next', 'my-desc', 'my-asc', 'total-desc', 'total-asc', 'end', 'remaining-desc', 'remaining-asc', 'progress-desc', 'recent']

interface BackupMeta {
  lastBackupAt: string | null
  dirty: boolean
}

function loadInstallmentSort(): InstallmentSort {
  const stored = localStorage.getItem(INSTALLMENT_SORT_KEY) as InstallmentSort | null
  return stored && installmentSorts.includes(stored) ? stored : 'next'
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(DARK_KEY) || '{}')
    return {
      dark: saved.dark || false,
      splitNames: Array.isArray(saved.splitNames) ? defaultSplitNames.map((name, index) => saved.splitNames[index] || name) : defaultSplitNames,
    }
  } catch {
    return { dark: false, splitNames: defaultSplitNames }
  }
}

function loadBackupMeta(): BackupMeta {
  try {
    const saved = JSON.parse(localStorage.getItem(BACKUP_META_KEY) || '{}')
    return { lastBackupAt: typeof saved.lastBackupAt === 'string' ? saved.lastBackupAt : null, dirty: saved.dirty === true }
  } catch {
    return { lastBackupAt: null, dirty: false }
  }
}

export default function App() {
  const hadStoredData = useRef(localStorage.getItem(DATA_KEY) !== null || localStorage.getItem(RECURRING_KEY) !== null)
  const [items, setItems] = useState<InstallmentItem[]>(loadStoredItems)
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>(loadStoredRecurring)
  const [recurringAddSignal, setRecurringAddSignal] = useState(0)
  const [pendingRecurringAdd, setPendingRecurringAdd] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [selectedMonth, setSelectedMonth] = useState(monthKey())
  const [dark, setDark] = useState(() => loadSettings().dark)
  const [splitNames, setSplitNames] = useState<string[]>(() => loadSettings().splitNames)
  const [modal, setModal] = useState<AppModal>(null)
  const [selected, setSelected] = useState<InstallmentItem | null>(null)
  const [form, setForm] = useState<ItemFormData>(emptyForm)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'active' | 'completed' | 'split' | 'all'>('active')
  const [installmentSort, setInstallmentSort] = useState<InstallmentSort>(loadInstallmentSort)
  const [backupMeta, setBackupMeta] = useState<BackupMeta>(loadBackupMeta)
  const [pendingImport, setPendingImport] = useState<ParsedBackup | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(() => !hadStoredData.current && !localStorage.getItem(ONBOARDING_KEY))
  const swipeStart = useRef<{ x: number; y: number; time: number; blocked: boolean } | null>(null)
  const lastPersistedData = useRef({ items: JSON.stringify(items), recurring: JSON.stringify(recurringExpenses) })
  const skipDirtyOnce = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const serialized = { items: JSON.stringify(items), recurring: JSON.stringify(recurringExpenses) }
    localStorage.setItem(DATA_KEY, serialized.items)
    localStorage.setItem(RECURRING_KEY, serialized.recurring)
    const changed = serialized.items !== lastPersistedData.current.items || serialized.recurring !== lastPersistedData.current.recurring
    lastPersistedData.current = serialized
    if (!changed) return
    if (skipDirtyOnce.current) {
      skipDirtyOnce.current = false
      return
    }
    const next = { ...backupMeta, dirty: true }
    setBackupMeta(next)
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(next))
  }, [items, recurringExpenses])
  useEffect(() => { localStorage.setItem(INSTALLMENT_SORT_KEY, installmentSort) }, [installmentSort])
  useEffect(() => {
    if (tab === 'recurring' && pendingRecurringAdd) {
      setRecurringAddSignal(value => value + 1)
      setPendingRecurringAdd(false)
    }
  }, [tab, pendingRecurringAdd])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(DARK_KEY, JSON.stringify({ dark, splitNames }))
  }, [dark, splitNames])
  useEffect(() => {
    if (!modal) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [modal])
  useEffect(() => {
    window.history.replaceState({ installmentTracker: true, tab: 'home', modal: null }, '', '#home')
    const appModals = new Set(['form', 'detail', 'split', 'ending', 'add-choice', 'import-preview'])
    const handleBack = (event: PopStateEvent) => {
      const state = event.state
      if (!state?.installmentTracker) return
      setTab(state.tab || 'home')
      setModal(appModals.has(state.modal) ? state.modal : null)
      if (state.modal !== 'import-preview') setPendingImport(null)
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  const active = items.filter(item => item.status === 'active')
  const remaining = active.reduce((sum, item) => sum + remainingAmount(item), 0)
  const endingItems = items.filter(item => item.payments.at(-1)?.scheduledDate.startsWith(selectedMonth))
  const monthOptions = useMemo(() => {
    const values = new Set<string>([selectedMonth, monthKey()])
    for (let offset = -12; offset <= 24; offset += 1) values.add(shiftMonthKey(monthKey(), offset))
    items.forEach(item => item.payments.forEach(payment => values.add(payment.scheduledDate.slice(0, 7))))
    recurringExpenses.forEach(expense => expense.activePeriods.forEach(period => { values.add(period.startMonth); if (period.endMonth) values.add(period.endMonth) }))
    return [...values].sort()
  }, [items, recurringExpenses, selectedMonth])
  const visible = items.filter(item => (filter === 'all' || (filter === 'split' ? item.splitPayment : item.status === filter)) && [item.title, item.paymentMethod, item.merchant, item.memo, item.category].join(' ').toLowerCase().includes(search.toLowerCase()))

  function pushView(nextTab: Tab, nextModal: AppModal, hash: string) {
    window.history.pushState({ installmentTracker: true, tab: nextTab, modal: nextModal }, '', hash)
  }
  function selectTab(nextTab: Tab) {
    if (nextTab === tab && !modal) return
    pushView(nextTab, null, `#${nextTab}`)
    setModal(null)
    setTab(nextTab)
  }
  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (modal || event.touches.length !== 1) { swipeStart.current = null; return }
    const touch = event.touches[0]
    const target = event.target instanceof Element ? event.target : null
    const blockedTarget = !!target?.closest('input, textarea, select, [contenteditable="true"], [data-swipe-ignore], .recharts-wrapper')
    const edgeGesture = touch.clientX < 28 || touch.clientX > window.innerWidth - 28
    swipeStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now(), blocked: blockedTarget || edgeGesture }
  }
  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || start.blocked || event.changedTouches.length !== 1 || modal) return
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Date.now() - start.time > 900 || Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return
    const nextIndex = tabOrder.indexOf(tab) + (deltaX < 0 ? 1 : -1)
    if (nextIndex >= 0 && nextIndex < tabOrder.length) selectTab(tabOrder[nextIndex])
  }

  function closeView() {
    if (window.history.state?.installmentTracker) window.history.back()
    else setModal(null)
  }
  function openAddChoice() {
    pushView(tab, 'add-choice', '#add-choice')
    setModal('add-choice')
  }
  function openAdd(replaceHistory = false) {
    const next = emptyForm()
    next.splitParticipants = splitNames.slice(0, 2)
    if (replaceHistory) window.history.replaceState({ installmentTracker: true, tab, modal: 'form' }, '', '#add')
    else pushView(tab, 'form', '#add')
    setSelected(null)
    setForm(next)
    setModal('form')
  }
  function openRecurringAdd() {
    window.history.replaceState({ installmentTracker: true, tab: 'recurring', modal: null }, '', '#recurring')
    setModal(null)
    setTab('recurring')
    setPendingRecurringAdd(true)
  }
  function openDetail(item: InstallmentItem) {
    pushView(tab, 'detail', `#detail-${item.id}`)
    setSelected(item)
    setModal('detail')
  }
  function openEdit(item: InstallmentItem) {
    pushView(tab, 'form', `#edit-${item.id}`)
    setSelected(item)
    setForm(formFromItem(item))
    setModal('form')
  }
  function save(event: React.FormEvent) {
    event.preventDefault()
    const errors = validateItemForm(form)
    if (errors.length) { alert(errors.join('\n')); return }
    if (selected && installmentScheduleChanged(form, selected) && !confirm('총액·개월 수·첫 결제일이 변경되어 전체 회차 일정이 다시 계산됩니다.\n기존 납부 완료 회차와 납부일은 가능한 범위에서 보존합니다. 계속하시겠습니까?')) return
    const next = itemFromForm(form, selected || undefined)
    setItems(previous => selected ? previous.map(item => item.id === selected.id ? next : item) : [next, ...previous])
    window.history.replaceState({ installmentTracker: true, tab, modal: 'detail' }, '', `#detail-${next.id}`)
    setSelected(next)
    setModal('detail')
  }
  function updateItem(updated: InstallmentItem) {
    setItems(previous => previous.map(item => item.id === updated.id ? updated : item))
    setSelected(updated)
  }
  function markPayment(item: InstallmentItem, paymentId: string) {
    const target = item.payments.find(payment => payment.id === paymentId)
    if (!target || target.status === 'paid') return
    if (paymentDisplayStatus(target) === 'upcoming' && !confirm(`${localDate(target.scheduledDate)} 예정 회차입니다. 미래 회차를 납부 완료로 처리하시겠습니까?`)) return
    const payments = item.payments.map(payment => payment.id === paymentId ? { ...payment, status: 'paid' as const, paidAt: new Date().toISOString() } : { ...payment })
    const paidCount = payments.filter(payment => payment.status === 'paid').length
    const status = paidCount === item.installmentMonths ? 'completed' as const : 'active' as const
    updateItem({ ...item, payments, paidCount, status, updatedAt: new Date().toISOString(), ...(status === 'completed' ? { completedAt: new Date().toISOString() } : { completedAt: undefined }) })
  }
  function markNext(item: InstallmentItem) {
    const payment = nextPayment(item)
    if (payment) markPayment(item, payment.id)
  }
  function undoPayment(item: InstallmentItem) {
    const payment = [...item.payments].reverse().find(candidate => candidate.status === 'paid')
    if (!payment) return
    const payments = item.payments.map(candidate => candidate.id === payment.id ? { ...candidate, status: 'scheduled' as const, paidAt: undefined } : { ...candidate })
    const paidCount = payments.filter(candidate => candidate.status === 'paid').length
    updateItem({ ...item, payments, paidCount, status: 'active', updatedAt: new Date().toISOString(), completedAt: undefined })
  }
  function updateSplitName(index: number, value: string) {
    setSplitNames(previous => previous.map((name, currentIndex) => currentIndex === index ? value : name))
  }
  function applySplitNamesToExisting() {
    if (!confirm('기존 할부와 고정지출의 1·2번 참여자 이름도 현재 기본 이름으로 일괄 변경하시겠습니까?\n과거 정산 화면의 이름도 함께 바뀝니다.')) return
    setItems(previous => previous.map(item => item.splitPayment ? { ...item, splitParticipants: item.splitParticipants.map((name, index) => splitNames[index] || name), updatedAt: new Date().toISOString() } : item))
    setRecurringExpenses(previous => previous.map(expense => expense.splitPayment ? { ...expense, splitParticipants: expense.splitParticipants.map((name, index) => splitNames[index] || name), updatedAt: new Date().toISOString() } : expense))
  }
  function deleteItem(item: InstallmentItem) {
    if (confirm('이 할부 내역을 삭제하시겠습니까?\n삭제한 데이터는 복구할 수 없습니다.')) {
      setItems(previous => previous.filter(candidate => candidate.id !== item.id))
      window.history.back()
    }
  }
  function downloadBackup(reason: 'manual' | 'pre-import' | 'pre-reset' = 'manual') {
    const exportedAt = new Date().toISOString()
    const blob = new Blob([JSON.stringify({ version: 3, exportedAt, items, recurringExpenses, settings: { dark, splitNames } }, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `installment-tracker-${reason === 'manual' ? 'backup' : reason}-${exportedAt.slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    const next = { lastBackupAt: exportedAt, dirty: false }
    setBackupMeta(next)
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(next))
  }
  function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseBackup(String(reader.result))
        setPendingImport(parsed)
        pushView(tab, 'import-preview', '#import-preview')
        setModal('import-preview')
      } catch (error) {
        alert(error instanceof Error ? error.message : '올바른 지출노트 백업 파일이 아닙니다.')
      }
    }
    reader.onerror = () => alert('백업 파일을 읽지 못했습니다.')
    reader.readAsText(file)
  }
  function applyImport() {
    if (!pendingImport) return
    if (items.length || recurringExpenses.length) downloadBackup('pre-import')
    skipDirtyOnce.current = true
    setItems(pendingImport.items)
    setRecurringExpenses(pendingImport.recurringExpenses)
    if (pendingImport.settings.splitNames?.length) setSplitNames(defaultSplitNames.map((name, index) => pendingImport.settings.splitNames?.[index] || name))
    if (typeof pendingImport.settings.dark === 'boolean') setDark(pendingImport.settings.dark)
    const nextMeta = { lastBackupAt: pendingImport.exportedAt || new Date().toISOString(), dirty: false }
    setBackupMeta(nextMeta)
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(nextMeta))
    localStorage.setItem(ONBOARDING_KEY, 'done')
    setShowOnboarding(false)
    setPendingImport(null)
    window.history.replaceState({ installmentTracker: true, tab: 'home', modal: null }, '', '#home')
    setModal(null)
    setTab('home')
  }
  function clearData() {
    if (!confirm('할부와 고정지출 기록을 모두 삭제합니다.\n다크 모드와 나눠 내기 기본 이름은 유지됩니다.\n초기화 전에 자동 백업 파일을 다운로드합니다. 계속하시겠습니까?')) return
    if (items.length || recurringExpenses.length) downloadBackup('pre-reset')
    setItems([])
    setRecurringExpenses([])
    alert('기록을 초기화했습니다. 방금 다운로드한 백업 파일로 복원할 수 있습니다.')
  }
  function removeSamples() {
    if (confirm('체험용 예제 할부를 모두 삭제하시겠습니까?')) setItems(previous => previous.filter(item => !item.isSample))
  }
  function finishOnboarding(mode: 'empty' | 'sample') {
    if (mode === 'sample') setItems(sampleItems())
    localStorage.setItem(ONBOARDING_KEY, 'done')
    setShowOnboarding(false)
  }

  return <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { swipeStart.current = null }} className="mx-auto min-h-screen max-w-[480px] touch-pan-y overflow-x-hidden bg-[#f8f7fb] shadow-2xl dark:bg-[#15141b] dark:text-white">
    <main className="safe-bottom min-h-screen">
      {showOnboarding
        ? <OnboardingView onEmpty={() => finishOnboarding('empty')} onSample={() => finishOnboarding('sample')} onImport={() => fileRef.current?.click()}/>
        : <>
          {tab === 'home' && <HomeView items={items} recurringExpenses={recurringExpenses} selectedMonth={selectedMonth} monthOptions={monthOptions} setSelectedMonth={setSelectedMonth} remaining={remaining} onOpen={openDetail} onAdd={openAdd} onOpenSplit={() => { pushView(tab, 'split', '#split'); setModal('split') }} onOpenEnding={() => { pushView(tab, 'ending', '#ending'); setModal('ending') }} onPay={markPayment} onRemoveSamples={removeSamples}/>}
          {tab === 'list' && <ListView items={visible} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} sort={installmentSort} setSort={setInstallmentSort} onOpen={openDetail} onPay={markPayment}/>}
          {tab === 'recurring' && <RecurringView expenses={recurringExpenses} setExpenses={setRecurringExpenses} addSignal={recurringAddSignal} participantDefaults={splitNames}/>}
          {tab === 'stats' && <StatsView items={items} recurringExpenses={recurringExpenses} remaining={remaining} selectedMonth={selectedMonth} monthOptions={monthOptions} setSelectedMonth={setSelectedMonth}/>}
          {tab === 'settings' && <SettingsView dark={dark} setDark={setDark} splitNames={splitNames} updateSplitName={updateSplitName} applySplitNames={applySplitNamesToExisting} backupMeta={backupMeta} exportData={() => downloadBackup()} importClick={() => fileRef.current?.click()} clear={clearData}/>}
        </>}
    </main>
    <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importData}/>
    {!showOnboarding && <><Nav tab={tab} setTab={selectTab}/><button data-swipe-ignore onClick={openAddChoice} aria-label="지출 추가" className="fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full border-4 border-[#f8f7fb] bg-[#0284c7] text-white shadow-xl dark:border-[#15141b] sm:right-[calc(50%-220px)]"><CirclePlus size={27}/></button></>}
    {modal === 'add-choice' && <AddChoiceModal onClose={closeView} onInstallment={() => openAdd(true)} onRecurring={openRecurringAdd}/>}
    {modal === 'form' && <FormModal form={form} setForm={setForm} onClose={closeView} onSave={save} editingItem={selected} participantDefaults={splitNames}/>}
    {modal === 'split' && <SplitMonthlyModal items={items} recurringExpenses={recurringExpenses} initialMonth={selectedMonth} onClose={closeView}/>}
    {modal === 'ending' && <EndingInstallmentsModal items={endingItems} month={selectedMonth} onClose={closeView} onOpen={openDetail}/>}
    {modal === 'detail' && selected && <DetailModal item={selected} onClose={closeView} onEdit={() => openEdit(selected)} onPay={paymentId => markPayment(selected, paymentId)} onPayNext={() => markNext(selected)} onUndo={() => undoPayment(selected)} onDelete={() => deleteItem(selected)}/>}
    {modal === 'import-preview' && pendingImport && <ImportPreviewModal backup={pendingImport} hasCurrentData={items.length + recurringExpenses.length > 0} onClose={closeView} onApply={applyImport} onBackup={() => downloadBackup()}/>}
  </div>
}

function Header({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) { return <header className="flex items-end justify-between px-5 pb-5 pt-8"><div>{eyebrow && <p className="mb-1 text-sm font-semibold text-[#0284c7]">{eyebrow}</p>}<h1 className="text-[28px] font-extrabold tracking-[-1.2px]">{title}</h1></div>{action}</header> }

function MonthSelector({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <div data-swipe-ignore className="px-5 pb-4"><div className="flex items-center gap-2 rounded-2xl bg-white p-2 dark:bg-[#211f29]"><button onClick={() => onChange(shiftMonthKey(value, -1))} aria-label="이전 달" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-gray-500"><ArrowLeft size={18}/></button><select value={value} onChange={event => onChange(event.target.value)} aria-label="조회할 월" className="h-10 min-w-0 flex-1 rounded-xl border-0 bg-[#f8f7fb] px-3 text-center font-extrabold outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#15141b]">{options.map(month => <option key={month} value={month}>{formatMonthKey(month)}</option>)}</select><button onClick={() => onChange(shiftMonthKey(value, 1))} aria-label="다음 달" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-gray-500"><ChevronRight size={18}/></button></div></div>
}

function HomeView({ items, recurringExpenses, selectedMonth, monthOptions, setSelectedMonth, remaining, onOpen, onAdd, onOpenSplit, onOpenEnding, onPay, onRemoveSamples }: { items: InstallmentItem[]; recurringExpenses: RecurringExpense[]; selectedMonth: string; monthOptions: string[]; setSelectedMonth: (value: string) => void; remaining: number; onOpen: (item: InstallmentItem) => void; onAdd: () => void; onOpenSplit: () => void; onOpenEnding: () => void; onPay: (item: InstallmentItem, paymentId: string) => void; onRemoveSamples: () => void }) {
  const monthRows = items.flatMap(item => item.payments.filter(payment => payment.scheduledDate.startsWith(selectedMonth)).map(payment => ({ item, payment })))
  const monthItems = items.filter(item => item.payments.some(payment => payment.scheduledDate.startsWith(selectedMonth)))
  const recurringForMonth = recurringExpenses.filter(expense => recurringActiveInMonth(expense, selectedMonth))
  const installmentTotal = monthRows.reduce((sum, row) => sum + row.payment.amount, 0)
  const recurringTotal = recurringForMonth.reduce((sum, expense) => sum + expense.amount, 0)
  const totalMonthlyExpense = installmentTotal + recurringTotal
  const installmentMyTotal = monthRows.reduce((sum, row) => sum + myShare(row.item, row.payment.amount), 0)
  const recurringMyTotal = recurringForMonth.reduce((sum, expense) => sum + (expense.splitPayment ? splitShares(expense.amount, expense.splitParticipants)[0].amount : expense.amount), 0)
  const personalMonthlyExpense = installmentMyTotal + recurringMyTotal
  const sharedReimbursement = totalMonthlyExpense - personalMonthlyExpense
  const paid = monthRows.filter(row => row.payment.status === 'paid').reduce((sum, row) => sum + row.payment.amount, 0)
  const unpaid = monthRows.filter(row => row.payment.status === 'scheduled').reduce((sum, row) => sum + row.payment.amount, 0)
  const overdue = monthRows.filter(row => paymentDisplayStatus(row.payment) === 'overdue')
  const overdueAmount = overdue.reduce((sum, row) => sum + row.payment.amount, 0)
  const todayRows = items.flatMap(item => item.payments.filter(payment => paymentDisplayStatus(payment) === 'today').map(payment => ({ item, payment })))
  const allOverdueRows = items.flatMap(item => item.payments.filter(payment => paymentDisplayStatus(payment) === 'overdue').map(payment => ({ item, payment })))
  const splitPayments = monthRows.filter(row => row.item.splitPayment)
  const splitRecurring = recurringForMonth.filter(expense => expense.splitPayment)
  const splitTotal = splitPayments.reduce((sum, row) => sum + row.payment.amount, 0) + splitRecurring.reduce((sum, expense) => sum + expense.amount, 0)
  const splitMine = splitPayments.reduce((sum, row) => sum + myShare(row.item, row.payment.amount), 0) + splitRecurring.reduce((sum, expense) => sum + splitShares(expense.amount, expense.splitParticipants)[0].amount, 0)
  const endingInMonth = items.filter(item => item.payments.at(-1)?.scheduledDate.startsWith(selectedMonth)).length
  const activeCount = items.filter(item => item.status === 'active').length
  const sampleCount = items.filter(item => item.isSample).length
  const monthNumber = Number(selectedMonth.slice(5, 7))
  const isPast = selectedMonth < monthKey()
  return <>
    <Header eyebrow="월별 지출 관리" title="지출노트"/>
    <MonthSelector value={selectedMonth} options={monthOptions} onChange={setSelectedMonth}/>
    <section className="px-5">
      {sampleCount > 0 && <div className="mb-3 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/20 dark:bg-amber-500/10"><div><b className="text-amber-700 dark:text-amber-300">체험 데이터 {sampleCount}건</b><p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-200/70">예제이며 실제 기록이 아닙니다.</p></div><button onClick={onRemoveSamples} className="min-h-11 rounded-xl px-3 text-xs font-bold text-amber-700 dark:text-amber-300">일괄 삭제</button></div>}
      {(todayRows.length > 0 || allOverdueRows.length > 0) && <div className="mb-3 rounded-[22px] border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20}/><div className="min-w-0"><p className="font-extrabold text-amber-800 dark:text-amber-200">납부 상태를 확인해 주세요</p><p className="mt-1 text-xs leading-5 text-amber-700/80 dark:text-amber-200/70">오늘 결제 {todayRows.length}건 · 결제일 경과 {allOverdueRows.length}건</p><p className="text-[11px] leading-4 text-amber-700/70 dark:text-amber-200/60">날짜가 지나도 자동으로 납부 완료 처리하지 않습니다.</p></div></div></div>}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#38bdf8] p-5 text-white shadow-xl shadow-sky-200/60 dark:shadow-none"><div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[24px] border-white/10"/><p className="text-sm font-semibold text-white/75">{monthNumber}월 {isPast ? '지출 기록' : '예상 지출'}</p><p className="mt-1 text-xs text-white/65">{monthNumber}월 최종 내 부담액</p><p className="mt-0.5 text-[30px] font-extrabold tracking-tight">{formatWon(personalMonthlyExpense)}</p><div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4"><div><p className="text-xs text-white/65">전체 결제 예정액</p><p className="mt-1 font-bold">{formatWon(totalMonthlyExpense)}</p></div><div><p className="text-xs text-white/65">다른 참여자에게 받을 금액</p><p className="mt-1 font-bold">{formatWon(sharedReimbursement)}</p></div></div><p className="mt-3 text-xs text-white/65">내 부담 기준 · 할부 {formatWon(installmentMyTotal)} · 고정지출 {formatWon(recurringMyTotal)}</p></div>
      <div className="mt-3 rounded-[24px] bg-white p-5 dark:bg-[#211f29]"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[#0284c7]">{monthNumber}월 할부 납부액</p><p className="mt-1 text-2xl font-extrabold">{formatWon(installmentTotal)}</p></div><Info size={18} className="text-gray-300"/></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10"><p className="text-xs text-gray-500">이미 납부 완료</p><b>{formatWon(paid)}</b></div><div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10"><p className="text-xs text-gray-500">아직 미납부</p><b>{formatWon(unpaid)}</b></div></div>{overdue.length > 0 && <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10"><span className="text-xs font-bold text-amber-700 dark:text-amber-300">결제일 경과 · 확인 필요</span><b className="text-amber-700 dark:text-amber-300">{formatWon(overdueAmount)}</b></div>}<details className="mt-3 text-xs text-gray-400"><summary className="min-h-11 cursor-pointer py-3 font-bold">금액 계산 기준 보기</summary><p className="leading-5">전체 결제 예정액은 할부 예정액과 활성 고정지출의 합계입니다. 최종 내 부담액은 나눠 내기에서 다른 참여자의 몫을 제외한 금액입니다. 고정지출은 실제 납부가 아닌 월 예상 금액입니다.</p></details></div>
      <div className="mt-3 grid grid-cols-2 gap-3"><Summary icon={<Database size={19}/>} label={monthNumber + '월 고정지출 예상'} value={formatWon(recurringTotal)}/><Summary icon={<CalendarDays size={19}/>} label={isPast ? monthNumber + '월 종료 할부' : monthNumber + '월 종료 예정'} value={endingInMonth + '건'} onClick={onOpenEnding}/></div>
      <button onClick={onOpenSplit} className="mt-3 min-h-20 w-full rounded-[22px] border border-sky-100 bg-sky-50 p-4 text-left dark:border-sky-500/10 dark:bg-sky-500/10"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-xs font-bold text-[#0284c7]">{monthNumber}월 나눠 내기 · 정산 보기</p><p className="mt-1 text-lg font-extrabold">내 부담 {formatWon(splitMine)}</p></div><div className="flex shrink-0 items-center gap-2 text-right"><div><p className="text-xs text-gray-400">전체 결제액</p><p className="mt-1 text-sm font-bold">{formatWon(splitTotal)}</p></div><ChevronRight size={18} className="text-sky-400"/></div></div></button>
      <div className="mt-3 grid grid-cols-2 gap-3"><Summary icon={<WalletCards size={19}/>} label="현재 전체 남은 할부" value={formatWon(remaining)}/><Summary icon={<CreditCard size={19}/>} label="현재 진행 중 할부" value={activeCount + '건'}/></div>
    </section>
    <section className="mt-7"><div className="mb-3 flex items-center justify-between px-5"><h2 className="text-lg font-extrabold">{monthNumber}월 할부 내역</h2><span className="text-xs font-semibold text-gray-400">결제일 순</span></div><div className="space-y-3 px-5">{monthItems.length ? [...monthItems].sort((a, b) => (a.payments.find(payment => payment.scheduledDate.startsWith(selectedMonth))?.scheduledDate || '').localeCompare(b.payments.find(payment => payment.scheduledDate.startsWith(selectedMonth))?.scheduledDate || '')).map(item => <ItemCard key={item.id} item={item} paymentMonth={selectedMonth} onClick={() => onOpen(item)} onPay={paymentId => onPay(item, paymentId)}/>) : <Empty onAdd={onAdd} message="선택한 월의 할부 내역이 없어요"/>}</div></section>
  </>
}

function Summary({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick?: () => void }) {
  const content = <><div className="mb-3 flex items-center justify-between text-[#0284c7]">{icon}{onClick && <ChevronRight size={17} className="text-sky-300"/>}</div><p className="text-xs text-gray-400">{label}</p><p className="mt-1 truncate text-base font-extrabold">{value}</p></>
  return onClick ? <button onClick={onClick} className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left transition active:scale-[.98] dark:border-white/5 dark:bg-[#211f29]">{content}</button> : <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/5 dark:bg-[#211f29]">{content}</div>
}

function ItemCard({ item, onClick, paymentMonth, onPay }: { item: InstallmentItem; onClick: () => void; paymentMonth?: string; onPay?: (paymentId: string) => void }) {
  const monthPayment = paymentMonth ? item.payments.find(payment => payment.scheduledDate.startsWith(paymentMonth)) : undefined
  const payment = monthPayment || nextPayment(item)
  const amount = payment?.amount || item.payments[0]?.amount || 0
  const meta = [item.paymentMethod, item.merchant, item.category].filter(Boolean).join(' · ')
  const progressValue = monthPayment ? Math.round(((monthPayment.status === 'paid' ? monthPayment.sequence : monthPayment.sequence - 1) / item.installmentMonths) * 100) : progress(item)
  const countLabel = monthPayment ? monthPayment.sequence + ' / ' + item.installmentMonths + '회' : item.paidCount + ' / ' + item.installmentMonths + '회'
  const displayStatus = payment ? paymentDisplayStatus(payment) : 'paid'
  const statusClass = displayStatus === 'paid' ? 'text-emerald-600' : displayStatus === 'overdue' ? 'text-amber-600' : displayStatus === 'today' ? 'text-[#0284c7]' : 'text-gray-400'
  const borderClass = displayStatus === 'overdue' ? 'border-amber-200 dark:border-amber-500/20' : displayStatus === 'today' ? 'border-sky-200 dark:border-sky-500/20' : 'border-gray-100 dark:border-white/5'
  return <div className={'w-full rounded-[22px] border bg-white p-4 dark:bg-[#211f29] ' + borderClass}><button onClick={onClick} className="w-full text-left transition active:scale-[.99]"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-extrabold">{item.title}</p>{item.isSample && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-600 dark:bg-amber-500/10">체험 데이터</span>}{item.splitPayment && <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-[#0284c7] dark:bg-sky-500/10">{item.splitParticipants.length}명 나눠 내기</span>}</div><p className="mt-1 truncate text-xs text-gray-400">{meta || '정보 없음'}</p></div><ChevronRight size={18} className="shrink-0 text-gray-300"/></div><div className="mt-4 flex items-end justify-between gap-2"><div className="min-w-0"><p className="text-xs text-gray-400">{item.splitPayment ? '내 부담 금액' : '회차 납부 금액'}</p><p className="mt-0.5 text-lg font-extrabold">{formatWon(myShare(item, amount))}</p>{item.splitPayment && <p className="mt-1 text-[11px] text-gray-400">전체 {formatWon(amount)}</p>}</div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-[#0284c7]">{countLabel}</p><p className={'mt-1 max-w-[132px] text-[11px] font-bold ' + statusClass}>{payment ? localDate(payment.scheduledDate) + ' · ' + paymentStatusLabel(payment) : '납부 완료'}</p></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"><div className="h-full rounded-full bg-[#0284c7]" style={{ width: Math.max(0, progressValue) + '%' }}/></div></button>{payment && payment.status === 'scheduled' && onPay && displayStatus !== 'upcoming' && <button onClick={() => onPay(payment.id)} className={'mt-3 min-h-11 w-full rounded-xl text-sm font-bold ' + (displayStatus === 'overdue' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-sky-50 text-[#0284c7] dark:bg-sky-500/10')}>{displayStatus === 'overdue' ? '확인 후 납부 완료 처리' : '오늘 회차 납부 완료'}</button>}</div>
}

function Empty({ onAdd, message = '등록된 할부가 없어요' }: { onAdd: () => void; message?: string }) {
  return <div className="rounded-[22px] border border-dashed border-gray-200 py-12 text-center dark:border-white/10"><CreditCard className="mx-auto text-gray-300" size={32}/><p className="mt-3 text-sm font-bold text-gray-400">{message}</p><button onClick={onAdd} className="mt-3 min-h-11 px-3 text-sm font-bold text-[#0284c7]">할부 등록하기</button></div>
}

function installmentPaymentAmount(item: InstallmentItem) {
  return nextPayment(item)?.amount || item.payments.at(-1)?.amount || 0
}

function ListView({ items, search, setSearch, filter, setFilter, sort, setSort, onOpen, onPay }: { items: InstallmentItem[]; search: string; setSearch: (value: string) => void; filter: 'active' | 'completed' | 'split' | 'all'; setFilter: (value: 'active' | 'completed' | 'split' | 'all') => void; sort: InstallmentSort; setSort: (value: InstallmentSort) => void; onOpen: (item: InstallmentItem) => void; onPay: (item: InstallmentItem, paymentId: string) => void }) {
  const sorted = useMemo(() => [...items].sort((a, b) => {
    const aAmount = installmentPaymentAmount(a)
    const bAmount = installmentPaymentAmount(b)
    if (sort === 'my-desc') return myShare(b, bAmount) - myShare(a, aAmount)
    if (sort === 'my-asc') return myShare(a, aAmount) - myShare(b, bAmount)
    if (sort === 'total-desc') return bAmount - aAmount
    if (sort === 'total-asc') return aAmount - bAmount
    if (sort === 'end') return (a.payments.at(-1)?.scheduledDate || '').localeCompare(b.payments.at(-1)?.scheduledDate || '')
    if (sort === 'remaining-desc') return remainingAmount(b) - remainingAmount(a)
    if (sort === 'remaining-asc') return remainingAmount(a) - remainingAmount(b)
    if (sort === 'progress-desc') return progress(b) - progress(a)
    if (sort === 'recent') return b.createdAt.localeCompare(a.createdAt)
    return (nextPayment(a)?.scheduledDate || a.payments.at(-1)?.scheduledDate || '').localeCompare(nextPayment(b)?.scheduledDate || b.payments.at(-1)?.scheduledDate || '')
  }), [items, sort])

  return <>
    <Header eyebrow="내역 관리" title="모든 할부"/>
    <div className="px-5">
      <div className="flex h-12 items-center gap-2 rounded-2xl bg-white px-4 dark:bg-[#211f29]"><Search size={18} className="text-gray-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="품목, 카드사, 구매처 검색" className="w-full bg-transparent text-sm outline-none"/></div>
      <div data-swipe-ignore className="hide-scroll mt-3 flex gap-2 overflow-x-auto">{(['active', 'split', 'completed', 'all'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${filter === value ? 'bg-[#0284c7] text-white' : 'bg-white text-gray-500 dark:bg-[#211f29]'}`}>{value === 'active' ? '진행 중' : value === 'split' ? '나눠 내기' : value === 'completed' ? '완료' : '전체'}</button>)}</div>
      <div className="mt-3"><select data-swipe-ignore value={sort} onChange={event => setSort(event.target.value as InstallmentSort)} aria-label="할부 정렬" className="h-11 w-full rounded-xl border-0 bg-white px-3 font-bold text-gray-600 outline-none dark:bg-[#211f29] dark:text-gray-200"><option value="next">결제일 빠른 순</option><option value="my-desc">내 월 부담액 높은 순</option><option value="my-asc">내 월 부담액 낮은 순</option><option value="total-desc">전체 월 납부액 높은 순</option><option value="total-asc">전체 월 납부액 낮은 순</option><option value="end">종료 빠른 순</option><option value="remaining-desc">남은 금액 높은 순</option><option value="remaining-asc">남은 금액 낮은 순</option><option value="progress-desc">진행률 높은 순</option><option value="recent">최근 등록 순</option></select></div>
      <div className="mt-5 space-y-3">{sorted.length ? sorted.map(item => <ItemCard key={item.id} item={item} onClick={() => onOpen(item)} onPay={paymentId => onPay(item, paymentId)}/>) : <p className="py-16 text-center text-sm text-gray-400">조건에 맞는 내역이 없어요.</p>}</div>
    </div>
  </>
}

function StatsView({ items, recurringExpenses, remaining, selectedMonth, monthOptions, setSelectedMonth }: { items: InstallmentItem[]; recurringExpenses: RecurringExpense[]; remaining: number; selectedMonth: string; monthOptions: string[]; setSelectedMonth: (value: string) => void }) {
  const installmentTotal = monthScheduled(items, selectedMonth)
  const recurringForMonth = recurringExpenses.filter(expense => recurringActiveInMonth(expense, selectedMonth))
  const recurringTotal = recurringForMonth.reduce((sum, expense) => sum + expense.amount, 0)
  const combinedTotal = installmentTotal + recurringTotal
  const installmentMy = items.reduce((sum, item) => sum + item.payments.filter(payment => payment.scheduledDate.startsWith(selectedMonth)).reduce((paymentSum, payment) => paymentSum + myShare(item, payment.amount), 0), 0)
  const recurringMy = recurringForMonth.reduce((sum, expense) => sum + (expense.splitPayment ? splitShares(expense.amount, expense.splitParticipants)[0].amount : expense.amount), 0)
  const personalCombined = installmentMy + recurringMy
  const reimbursement = combinedTotal - personalCombined
  const recurringCategory = Object.entries(recurringForMonth.reduce<Record<string, number>>((result, expense) => { result[expense.category] = (result[expense.category] || 0) + expense.amount; return result }, {})).sort((a, b) => b[1] - a[1])
  const data = useMemo(() => Array.from({ length: 6 }, (_, index) => { const key = shiftMonthKey(selectedMonth, index); return { name: `${Number(key.slice(5, 7))}월`, amount: monthScheduled(items, key) } }), [items, selectedMonth])
  const category = Object.entries(items.filter(item => item.status === 'active').reduce<Record<string, number>>((result, item) => { result[item.category] = (result[item.category] || 0) + remainingAmount(item); return result }, {})).sort((a, b) => b[1] - a[1])
  return <><Header eyebrow={`${formatMonthKey(selectedMonth)} 소비 흐름`} title="지출 통계"/><MonthSelector value={selectedMonth} options={monthOptions} onChange={setSelectedMonth}/><div className="space-y-4 px-5"><div className="grid grid-cols-2 gap-3"><Summary icon={<WalletCards size={19}/>} label="현재 전체 남은 할부" value={formatWon(remaining)}/><Summary icon={<CreditCard size={19}/>} label="선택 월 할부 납부액" value={formatWon(installmentTotal)}/></div><div className="grid grid-cols-2 gap-3"><Summary icon={<Database size={19}/>} label="선택 월 고정지출 예상" value={formatWon(recurringTotal)}/><Summary icon={<CreditCard size={19}/>} label="선택 월 전체 예정액" value={formatWon(combinedTotal)}/></div><div className="grid grid-cols-2 gap-3"><Summary icon={<WalletCards size={19}/>} label="선택 월 최종 내 부담" value={formatWon(personalCombined)}/><Summary icon={<CreditCard size={19}/>} label="선택 월 받을 금액" value={formatWon(reimbursement)}/></div><div className="rounded-[24px] bg-white p-5 dark:bg-[#211f29]"><h2 className="font-extrabold">선택 월 · 할부 vs 고정지출</h2><p className="mt-1 text-xs text-gray-400">{Number(selectedMonth.slice(5, 7))}월 지출 비율</p><div className="mt-5 flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"><div className="bg-[#0284c7]" style={{ width: `${combinedTotal ? installmentTotal / combinedTotal * 100 : 0}%` }}/><div className="bg-[#7dd3fc]" style={{ width: `${combinedTotal ? recurringTotal / combinedTotal * 100 : 0}%` }}/></div><div className="mt-3 flex justify-between text-xs"><span>할부 <b>{formatWon(installmentTotal)}</b></span><span>고정지출 <b>{formatWon(recurringTotal)}</b></span></div></div><div className="rounded-[24px] bg-white p-5 dark:bg-[#211f29]"><h2 className="font-extrabold">선택 월 · 카테고리별 고정지출</h2><div className="mt-4 space-y-4">{recurringCategory.map(([name, value]) => <div key={name}><div className="mb-1.5 flex justify-between text-sm"><span>{name}</span><b>{formatWon(value)}</b></div><div className="h-2 rounded-full bg-gray-100 dark:bg-white/10"><div className="h-full rounded-full bg-[#38bdf8]" style={{ width: `${recurringTotal ? value / recurringTotal * 100 : 0}%` }}/></div></div>)}{!recurringCategory.length && <p className="text-sm text-gray-400">선택한 월의 고정지출이 없어요.</p>}</div></div><div className="rounded-[24px] bg-white p-5 dark:bg-[#211f29]"><p className="text-sm text-gray-400">현재 전체 남은 할부 금액</p><p className="mt-1 text-2xl font-extrabold">{formatWon(remaining)}</p><h2 className="mt-6 font-extrabold">향후 6개월 할부 예정액</h2><p className="mt-1 text-xs text-gray-400">고정지출은 포함하지 않습니다.</p><div className="mt-3 h-44"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0284c7" stopOpacity={.35}/><stop offset="100%" stopColor="#0284c7" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#999' }}/><Tooltip formatter={value => formatWon(Number(value))}/><Area type="monotone" dataKey="amount" stroke="#0284c7" strokeWidth={3} fill="url(#fill)"/></AreaChart></ResponsiveContainer></div></div><div className="rounded-[24px] bg-white p-5 dark:bg-[#211f29]"><h2 className="font-extrabold">현재 전체 · 카테고리별 할부 잔액</h2><div className="mt-4 space-y-4">{category.map(([name, value]) => <div key={name}><div className="mb-1.5 flex justify-between text-sm"><span>{name}</span><b>{formatWon(value)}</b></div><div className="h-2 rounded-full bg-gray-100 dark:bg-white/10"><div className="h-full rounded-full bg-[#0ea5e9]" style={{ width: `${remaining ? value / remaining * 100 : 0}%` }}/></div></div>)}{!category.length && <p className="text-sm text-gray-400">표시할 데이터가 없어요.</p>}</div></div></div></>
}

function SettingsView({ dark, setDark, splitNames, updateSplitName, applySplitNames, backupMeta, exportData, importClick, clear }: { dark: boolean; setDark: (value: boolean) => void; splitNames: string[]; updateSplitName: (index: number, value: string) => void; applySplitNames: () => void; backupMeta: BackupMeta; exportData: () => void; importClick: () => void; clear: () => void }) {
  const duplicateNames = splitNames.some((name, index) => name.trim() && splitNames.findIndex(candidate => candidate.trim() === name.trim()) !== index)
  const backupLabel = backupMeta.lastBackupAt ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backupMeta.lastBackupAt)) : '아직 백업하지 않았어요'
  return <><Header eyebrow="환경 설정" title="설정"/><div className="space-y-3 px-5">
    <Setting icon={dark ? <Moon/> : <Sun/>} title="다크 모드" desc="어두운 화면으로 눈의 피로를 줄여요" right={<button onClick={() => setDark(!dark)} aria-label={dark ? '다크 모드 끄기' : '다크 모드 켜기'} className={'grid h-11 w-14 place-items-center rounded-full ' + (dark ? 'bg-[#0284c7]' : 'bg-gray-200')}><span className={'block h-5 w-5 rounded-full bg-white transition ' + (dark ? 'translate-x-3' : '-translate-x-3')}/></button>}/>
    <div className="rounded-[20px] bg-white p-4 dark:bg-[#211f29]"><div className="mb-4"><p className="font-extrabold">나눠 내기 기본 이름</p><p className="mt-1 text-xs leading-5 text-gray-400">변경한 이름은 새 항목의 기본값으로만 사용됩니다. 기존 기록은 자동으로 바뀌지 않습니다.</p></div><div className="space-y-3">{splitNames.map((name, index) => <label key={index} className="block"><span className="mb-1 block text-xs font-bold text-gray-400">{index === 0 ? '1번 · 내 이름' : index + 1 + '번 · 참여자'}</span><input value={name} onChange={event => updateSplitName(index, event.target.value)} onBlur={() => { if (!name.trim()) updateSplitName(index, index === 0 ? '나' : '참여자 2') }} className="h-11 w-full rounded-xl border-0 bg-[#f8f7fb] px-3 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#15141b]"/></label>)}</div>{duplicateNames && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">참여자 이름이 중복되었습니다. 정산 구분을 위해 서로 다르게 입력해 주세요.</p>}<button onClick={applySplitNames} disabled={duplicateNames} className="mt-4 min-h-11 w-full rounded-xl bg-gray-100 px-3 text-xs font-bold text-gray-600 disabled:opacity-40 dark:bg-white/10 dark:text-gray-300">현재 이름을 기존 기록에도 적용</button><p className="mt-2 text-[11px] leading-4 text-gray-400">적용하면 과거 정산 화면의 1·2번 참여자 이름도 변경됩니다. 실행 전 다시 확인합니다.</p></div>
    <div className={'rounded-[20px] border p-4 ' + (backupMeta.dirty || !backupMeta.lastBackupAt ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10' : 'border-emerald-100 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10')}><div className="flex items-start gap-3"><Download className={backupMeta.dirty || !backupMeta.lastBackupAt ? 'text-amber-600' : 'text-emerald-600'} size={20}/><div><p className="font-extrabold">{backupMeta.dirty || !backupMeta.lastBackupAt ? '백업을 권장해요' : '최근 백업 이후 변경 없음'}</p><p className="mt-1 text-xs text-gray-500">마지막 백업: {backupLabel}</p>{backupMeta.dirty && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">백업 이후 데이터가 변경되었습니다.</p>}</div></div></div>
    <Setting icon={<Upload/>} title="데이터 내보내기" desc="할부·고정지출·설정을 version 3 JSON으로 백업해요" onClick={exportData}/>
    <Setting icon={<Download/>} title="데이터 불러오기" desc="파일 정보를 먼저 검토한 뒤 현재 기록을 교체해요" onClick={importClick}/>
    <Setting icon={<Trash2/>} title="모든 기록 초기화" desc="할부와 고정지출만 삭제하고 화면 설정은 유지해요" onClick={clear} danger/>
    <div className="pt-8 text-center text-xs leading-5 text-gray-400">지출노트 2.1.0<br/>데이터는 이 기기의 브라우저에만 저장됩니다.</div>
  </div></>
}
function Setting({icon,title,desc,right,onClick,danger}:{icon:React.ReactNode;title:string;desc:string;right?:React.ReactNode;onClick?:()=>void;danger?:boolean}) { return <button onClick={onClick} className="flex min-h-[76px] w-full items-center gap-3 rounded-[20px] bg-white p-4 text-left dark:bg-[#211f29]"><span className={`grid h-10 w-10 place-items-center rounded-xl ${danger?'bg-red-50 text-red-500 dark:bg-red-500/10':'bg-sky-50 text-[#0284c7] dark:bg-sky-500/10'}`}>{icon}</span><span className="min-w-0 flex-1"><b className={danger?'text-red-500':''}>{title}</b><span className="mt-1 block text-xs text-gray-400">{desc}</span></span>{right||<ChevronRight size={18} className="text-gray-300"/>}</button> }

function Nav({tab,setTab}:{tab:Tab;setTab:(t:Tab)=>void}) { const nav=[['home','홈',Home],['list','할부',List],['recurring','고정지출',Database],['stats','통계',BarChart3],['settings','설정',Settings]] as const; return <nav data-swipe-ignore className="fixed bottom-0 left-1/2 z-30 flex h-[76px] w-full max-w-[480px] -translate-x-1/2 items-center justify-around border-t border-gray-100 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-white/5 dark:bg-[#211f29]/95">{nav.map(([key,label,Icon])=><button key={key} onClick={()=>setTab(key)} className={`flex h-14 min-w-[54px] flex-col items-center justify-center gap-1 text-[10px] font-bold ${tab===key?'text-[#0284c7]':'text-gray-400'}`}><Icon size={21}/><span>{label}</span></button>)}</nav> }

function ModalShell({children,onClose}:{children:React.ReactNode;onClose:()=>void}) { return <div data-swipe-ignore className="fixed inset-0 z-50 overscroll-none bg-black/35 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="absolute inset-x-0 bottom-0 mx-auto max-h-[94dvh] max-w-[480px] overscroll-contain overflow-y-auto scroll-pb-32 rounded-t-[30px] bg-[#f8f7fb] pb-[env(safe-area-inset-bottom)] dark:bg-[#15141b]"><button onClick={onClose} aria-label="닫기" className="absolute right-5 top-5 z-10 grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm dark:bg-[#292731]"><X size={19}/></button>{children}</div></div> }
function OnboardingView({ onEmpty, onSample, onImport }: { onEmpty: () => void; onSample: () => void; onImport: () => void }) {
  return <div className="flex min-h-screen flex-col justify-center px-5 py-10"><div className="mx-auto w-full max-w-sm"><div className="grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#0284c7] to-[#38bdf8] text-white shadow-lg shadow-sky-200 dark:shadow-none"><WalletCards size={30}/></div><p className="mt-6 text-sm font-bold text-[#0284c7]">안전하게 시작하기</p><h1 className="mt-1 text-3xl font-extrabold">지출노트</h1><p className="mt-3 text-sm leading-6 text-gray-500">할부 납부 일정과 고정지출, 나눠 내기 부담액을 한곳에서 관리하세요. 데이터는 이 기기에만 저장됩니다.</p><div className="mt-8 space-y-3"><button onClick={onEmpty} className="min-h-14 w-full rounded-2xl bg-[#0284c7] font-extrabold text-white">새로 시작하기</button><button onClick={onSample} className="min-h-14 w-full rounded-2xl bg-white font-extrabold dark:bg-[#211f29]">예제 데이터로 둘러보기</button><button onClick={onImport} className="min-h-14 w-full rounded-2xl border border-gray-200 font-extrabold dark:border-white/10">백업 파일 불러오기</button></div><p className="mt-5 text-center text-xs leading-5 text-gray-400">예제 데이터는 체험용으로 표시되며 언제든 일괄 삭제할 수 있습니다.</p></div></div>
}

function ImportPreviewModal({ backup, hasCurrentData, onClose, onApply, onBackup }: { backup: ParsedBackup; hasCurrentData: boolean; onClose: () => void; onApply: () => void; onBackup: () => void }) {
  const exported = backup.exportedAt ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.exportedAt)) : '생성일 정보 없음'
  return <ModalShell onClose={onClose}><div className="px-5 pb-8 pt-7"><p className="text-sm font-bold text-[#0284c7]">불러오기 전 검토</p><h2 className="mt-1 pr-12 text-2xl font-extrabold">백업 파일 정보</h2><div className="mt-6 rounded-[22px] bg-white p-4 dark:bg-[#211f29]"><div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-gray-400">백업 형식</p><b>version {backup.version}</b></div><div><p className="text-xs text-gray-400">생성일</p><b className="text-sm">{exported}</b></div><div><p className="text-xs text-gray-400">할부</p><b>{backup.items.length}건</b></div><div><p className="text-xs text-gray-400">고정지출</p><b>{backup.recurringExpenses.length}건</b></div></div></div><div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><b>현재 기록이 백업 파일 내용으로 교체됩니다.</b><p className="mt-1 text-xs">{hasCurrentData ? '실행 직전에 현재 데이터를 자동으로 다운로드합니다.' : '현재 저장된 기록이 없어 자동 백업은 생략됩니다.'}</p></div>{hasCurrentData && <button onClick={onBackup} className="mt-4 min-h-12 w-full rounded-2xl bg-white font-bold dark:bg-[#211f29]">현재 데이터만 먼저 백업</button>}<button onClick={onApply} className="mt-3 min-h-14 w-full rounded-2xl bg-[#0284c7] font-extrabold text-white">검토한 내용으로 교체</button></div></ModalShell>
}
function AddChoiceModal({ onClose, onInstallment, onRecurring }: { onClose: () => void; onInstallment: () => void; onRecurring: () => void }) {
  return <ModalShell onClose={onClose}><div className="px-5 pb-8 pt-7">
    <p className="text-sm font-bold text-[#0284c7]">새 지출 등록</p>
    <h2 className="mt-1 pr-12 text-2xl font-extrabold">무엇을 추가할까요?</h2>
    <div className="mt-6 space-y-3">
      <button onClick={onInstallment} className="flex w-full items-center gap-4 rounded-[22px] bg-white p-5 text-left transition active:scale-[.98] dark:bg-[#211f29]"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-[#0284c7] dark:bg-sky-500/10"><CreditCard size={23}/></span><span className="min-w-0 flex-1"><b className="text-lg">할부 추가</b><span className="mt-1 block text-xs text-gray-400">할부 금액과 납부 회차를 기록해요.</span></span><ChevronRight size={19} className="text-gray-300"/></button>
      <button onClick={onRecurring} className="flex w-full items-center gap-4 rounded-[22px] bg-white p-5 text-left transition active:scale-[.98] dark:bg-[#211f29]"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-[#0284c7] dark:bg-sky-500/10"><Database size={23}/></span><span className="min-w-0 flex-1"><b className="text-lg">고정지출 추가</b><span className="mt-1 block text-xs text-gray-400">매월 반복되는 지출을 기록해요.</span></span><ChevronRight size={19} className="text-gray-300"/></button>
    </div>
  </div></ModalShell>
}

function FormModal({ form, setForm, onClose, onSave, editingItem, participantDefaults }: { form: ItemFormData; setForm: (form: ItemFormData) => void; onClose: () => void; onSave: (event: React.FormEvent) => void; editingItem: InstallmentItem | null; participantDefaults: string[] }) {
  const [errors, setErrors] = useState<string[]>([])
  const field = (key: keyof ItemFormData, value: string) => setForm({ ...form, [key]: value })
  const elapsedCount = calculatePaidCount(form.firstPaymentDate, Number(form.installmentMonths))
  const monthOptions = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '24', '36', '48', '60']
  const customMonth = !monthOptions.includes(form.installmentMonths)
  const scheduleChanged = !!editingItem && installmentScheduleChanged(form, editingItem)
  const names = form.splitParticipants.map(name => name.trim())
  const duplicateNames = form.splitPayment && new Set(names.filter(Boolean)).size !== names.filter(Boolean).length
  const submit = (event: React.FormEvent) => {
    const nextErrors = validateItemForm(form)
    setErrors(nextErrors)
    if (nextErrors.length) { event.preventDefault(); return }
    onSave(event)
  }
  return <ModalShell onClose={onClose}><form onSubmit={submit} className="px-5 pb-8 pt-7"><p className="text-sm font-bold text-[#0284c7]">{editingItem ? '정보 변경' : '새로운 기록'}</p><h2 className="mt-1 text-2xl font-extrabold">{editingItem ? '할부 수정' : '할부 등록'}</h2>
    {errors.length > 0 && <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"><b>입력 내용을 확인해 주세요</b><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    <div className="mt-6 space-y-4"><Input label="품목명 *" value={form.title} onChange={value => field('title', value)} placeholder="예: 노트북" required/><div><label className="mb-2 block text-sm font-bold">총 결제 금액 *</label><input inputMode="numeric" value={formatAmountInput(form.totalAmount)} onChange={event => field('totalAmount', event.target.value.replace(/\D/g, ''))} placeholder="0" required className="h-12 w-full rounded-2xl border-0 bg-white px-4 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#211f29]"/>{Number(form.totalAmount) > 0 && <p className="mt-2 text-xs text-gray-400">{formatWon(Number(form.totalAmount))}</p>}</div>
      <div><label className="mb-2 block text-sm font-bold">할부 개월 수 *</label><select value={customMonth ? 'custom' : form.installmentMonths} onChange={event => field('installmentMonths', event.target.value === 'custom' ? '' : event.target.value)} className="h-12 w-full rounded-2xl border-0 bg-white px-4 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#211f29]" required><option value="" disabled>개월 수를 선택하세요</option>{monthOptions.map(value => <option key={value} value={value}>{value}개월</option>)}<option value="custom">직접 입력</option></select>{customMonth && <input type="number" min="1" max="120" value={form.installmentMonths} onChange={event => field('installmentMonths', event.target.value)} placeholder="1~120개월" className="mt-2 h-12 w-full rounded-2xl border-0 bg-white px-4 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#211f29]" required/>}</div>
      <Input label="첫 결제일 *" type="date" value={form.firstPaymentDate} onChange={value => field('firstPaymentDate', value)} required/>
      <div className="rounded-2xl bg-sky-50 p-4 dark:bg-sky-500/10"><div className="flex items-center justify-between gap-2"><span className="text-sm text-gray-600 dark:text-gray-300">오늘 이전 결제일</span><b className="text-[#0284c7]">{elapsedCount}회</b></div><p className="mt-2 text-xs leading-5 text-gray-500">경과 회차 안내일 뿐 자동으로 납부 완료 처리하지 않습니다. 실제 완료한 회차만 아래에 입력하세요.</p></div>
      <div><label className="mb-2 block text-sm font-bold">실제 납부 완료 회차</label><input type="number" min="0" max={form.installmentMonths || undefined} value={form.paidCount} onChange={event => field('paidCount', event.target.value)} className="h-12 w-full rounded-2xl border-0 bg-white px-4 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#211f29]"/></div>
      {scheduleChanged && <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><b>일정 정보가 변경되었습니다.</b><p className="mt-1 text-xs">저장 시 전체 회차를 다시 계산하며, 기존 납부 완료 회차와 납부일은 가능한 범위에서 보존합니다.</p></div>}
      <div className="rounded-2xl bg-gray-100 p-4 text-xs leading-5 text-gray-500 dark:bg-white/5"><b>예상 금액 안내</b><p className="mt-1">회차 금액은 총액을 개월 수로 단순 분할한 예상치이며 카드사 청구액과 다를 수 있습니다. 나머지는 마지막 회차에 반영됩니다.</p></div>
      <div className="rounded-[22px] bg-white p-4 dark:bg-[#211f29]"><div className="flex items-center justify-between"><div><p className="font-extrabold">나눠 내기</p><p className="mt-1 text-xs text-gray-400">여러 사람이 월 납부액을 균등하게 나눠요.</p></div><button type="button" aria-label={form.splitPayment ? '나눠 내기 끄기' : '나눠 내기 켜기'} onClick={() => setForm({ ...form, splitPayment: !form.splitPayment })} className={'grid h-11 w-14 place-items-center rounded-full ' + (form.splitPayment ? 'bg-[#0284c7]' : 'bg-gray-200 dark:bg-white/10')}><span className={'block h-5 w-5 rounded-full bg-white transition ' + (form.splitPayment ? 'translate-x-3' : '-translate-x-3')}/></button></div>{form.splitPayment && <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5"><label className="mb-2 block text-sm font-bold">참여 인원</label><select value={form.splitParticipants.length} onChange={event => { const count = Number(event.target.value); setForm({ ...form, splitParticipants: Array.from({ length: count }, (_, index) => form.splitParticipants[index] || participantDefaults[index] || '참여자 ' + (index + 1)) }) }} className="h-12 w-full rounded-2xl border-0 bg-[#f8f7fb] px-4 outline-none dark:bg-[#15141b]">{Array.from({ length: 7 }, (_, index) => index + 2).map(count => <option key={count} value={count}>{count}명</option>)}</select><div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">{form.splitParticipants.map((name, index) => <label key={index} className="min-w-0"><span className="mb-1 block text-[10px] font-bold text-gray-400">{index === 0 ? '내 이름' : index + 1 + '번 참여자'}</span><input value={name} onChange={event => { const next = [...form.splitParticipants]; next[index] = event.target.value; setForm({ ...form, splitParticipants: next }) }} className="h-11 w-full rounded-xl border-0 bg-[#f8f7fb] px-3 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#15141b]"/></label>)}</div>{duplicateNames && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">참여자 이름은 서로 다르게 입력해 주세요.</p>}<div className="mt-4 rounded-2xl bg-sky-50 p-3 text-sm dark:bg-sky-500/10"><p className="mb-2 text-xs font-bold text-[#0284c7]">회차 예상 분담액</p>{splitShares(Math.floor((Number(form.totalAmount) || 0) / (Number(form.installmentMonths) || 1)), form.splitParticipants).map((share, index) => <div key={index} className="flex justify-between py-1"><span className="truncate">{share.name}</span><b>{formatWon(share.amount)}</b></div>)}<p className="mt-2 text-[11px] leading-4 text-gray-500">균등 분할 후 남는 1원 단위 금액은 첫 번째 참여자에게 반영됩니다.</p></div></div>}</div>
      <Input label="카드사 또는 결제수단" value={form.paymentMethod} onChange={value => field('paymentMethod', value)} placeholder="예: 삼성카드"/><Input label="구매처" value={form.merchant} onChange={value => field('merchant', value)} placeholder="예: 공식 온라인몰"/><div><label className="mb-2 block text-sm font-bold">카테고리</label><select value={form.category} onChange={event => field('category', event.target.value)} className="h-12 w-full rounded-2xl border-0 bg-white px-4 outline-none dark:bg-[#211f29]">{categories.map(category => <option key={category}>{category}</option>)}</select></div><div><label className="mb-2 block text-sm font-bold">메모</label><textarea value={form.memo} onChange={event => field('memo', event.target.value)} rows={3} className="w-full resize-none rounded-2xl border-0 bg-white p-4 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#211f29]" placeholder="기억할 내용을 적어두세요"/></div>
    </div><button className="mt-6 min-h-14 w-full rounded-2xl bg-[#0284c7] font-extrabold text-white shadow-lg shadow-sky-200 dark:shadow-none">{editingItem ? '수정 내용 저장' : '할부 등록하기'}</button>
  </form></ModalShell>
}
function Input({ label, value, onChange, type = 'text', placeholder, required, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; min?: string }) {
  return <div><label className="mb-2 block text-sm font-bold">{label}</label><input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} min={min} className="h-12 w-full rounded-2xl border-0 bg-white px-4 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#211f29]"/></div>
}

function EndingInstallmentsModal({ items, month, onClose, onOpen }: { items: InstallmentItem[]; month: string; onClose: () => void; onOpen: (item: InstallmentItem) => void }) {
  const monthNumber = Number(month.slice(5, 7))
  const isPast = month < monthKey()
  const total = items.reduce((sum, item) => sum + (item.payments.at(-1)?.amount || 0), 0)
  const sorted = [...items].sort((a, b) => (a.payments.at(-1)?.scheduledDate || '').localeCompare(b.payments.at(-1)?.scheduledDate || ''))
  return <ModalShell onClose={onClose}><div className="px-5 pb-8 pt-7">
    <p className="text-sm font-bold text-[#0284c7]">{formatMonthKey(month)}</p>
    <h2 className="mt-1 pr-12 text-2xl font-extrabold">{isPast ? '종료된 할부' : '종료 예정 할부'}</h2>
    <div className="mt-5 rounded-[24px] bg-gradient-to-br from-[#0284c7] to-[#38bdf8] p-5 text-white"><p className="text-xs text-white/70">{monthNumber}월 마지막 회차</p><div className="mt-1 flex items-end justify-between"><p className="text-3xl font-extrabold">{items.length}건</p><div className="text-right"><p className="text-xs text-white/70">마지막 회차 합계</p><p className="mt-1 font-extrabold">{formatWon(total)}</p></div></div></div>
    <h3 className="mt-7 font-extrabold">할부 목록</h3>
    <div className="mt-3 space-y-3">{sorted.length ? sorted.map(item => <ItemCard key={item.id} item={item} paymentMonth={month} onClick={() => onOpen(item)}/>) : <div className="rounded-[22px] border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400 dark:border-white/10">선택한 월에 종료되는 할부가 없어요.</div>}</div>
  </div></ModalShell>
}

function SplitMonthlyModal({items,recurringExpenses,initialMonth,onClose}:{items:InstallmentItem[];recurringExpenses:RecurringExpense[];initialMonth:string;onClose:()=>void}) {
  const [month,setMonth]=useState(initialMonth)
  const rows=useMemo(()=>items.filter(item=>item.splitPayment).flatMap(item=>{const payment=item.payments.find(payment=>payment.scheduledDate.startsWith(month));return payment?[{item,payment,shares:splitShares(payment.amount,item.splitParticipants)}]:[]}),[items,month])
  const recurringRows=useMemo(()=>recurringExpenses.filter(expense=>recurringActiveInMonth(expense,month)&&expense.splitPayment).map(expense=>({expense,shares:splitShares(expense.amount,expense.splitParticipants)})),[recurringExpenses,month])
  const totals=[...rows.flatMap(row=>row.shares),...recurringRows.flatMap(row=>row.shares)].reduce<Record<string,number>>((result,share)=>{result[share.name]=(result[share.name]||0)+share.amount;return result},{})
  const totalAmount=rows.reduce((sum,row)=>sum+row.payment.amount,0)+recurringRows.reduce((sum,row)=>sum+row.expense.amount,0)
  const monthLabel=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long'}).format(new Date(`${month}-01T00:00:00`))
  const moveMonth=(offset:number)=>{const [year,value]=month.split('-').map(Number);const date=new Date(year,value-1+offset,1);setMonth(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`)}
  return <ModalShell onClose={onClose}><div className="px-5 pb-8 pt-7"><p className="text-sm font-bold text-[#0284c7]">한 달 정산</p><h2 className="mt-1 text-2xl font-extrabold">나눠 내기 모아보기</h2><div className="mt-5 flex items-center justify-between rounded-2xl bg-white p-2 dark:bg-[#211f29]"><button onClick={()=>moveMonth(-1)} aria-label="이전 달" className="grid h-11 w-11 place-items-center rounded-xl text-gray-500"><ArrowLeft size={18}/></button><b>{monthLabel}</b><button onClick={()=>moveMonth(1)} aria-label="다음 달" className="grid h-11 w-11 place-items-center rounded-xl text-gray-500"><ChevronRight size={18}/></button></div><div className="mt-3 rounded-[24px] bg-gradient-to-br from-[#0284c7] to-[#38bdf8] p-5 text-white"><p className="text-xs text-white/70">{Number(month.slice(5,7))}월 나눠 내기 전체</p><p className="mt-1 text-2xl font-extrabold">{formatWon(totalAmount)}</p><p className="mt-2 text-xs text-white/70">{rows.length+recurringRows.length}건의 할부·고정지출을 한 번에 정리했어요.</p></div>{Object.keys(totals).length>0&&<div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(totals).map(([name,amount],index)=><div key={name} className={`rounded-2xl p-4 ${index===0?'bg-sky-50 dark:bg-sky-500/10':'bg-white dark:bg-[#211f29]'}`}><p className="truncate text-xs text-gray-400">{name}{index===0?' · 나':''}</p><p className="mt-1 text-lg font-extrabold">{formatWon(amount)}</p></div>)}</div>}<h3 className="mt-7 font-extrabold">항목별 분담 내역</h3><div className="mt-3 space-y-3">{rows.map(row=><div key={row.item.id} className="rounded-[20px] bg-white p-4 dark:bg-[#211f29]"><div className="flex items-start justify-between"><div><p className="font-extrabold">{row.item.title}</p><p className="mt-1 text-xs text-gray-400">{row.payment.scheduledDate.replaceAll('-','.')} · {row.payment.sequence}회차</p></div><div className="text-right"><p className="font-extrabold">{formatWon(row.payment.amount)}</p><p className={`mt-1 text-[11px] ${row.payment.status==='paid'?'text-green-500':'text-gray-400'}`}>{paymentStatusLabel(row.payment)}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{row.shares.map(share=><span key={share.name} className="rounded-full bg-[#f8f7fb] px-3 py-1.5 text-xs dark:bg-[#15141b]"><b>{share.name}</b> {formatWon(share.amount)}</span>)}</div></div>)}{recurringRows.map(row=><div key={row.expense.id} className="rounded-[20px] bg-white p-4 dark:bg-[#211f29]"><div className="flex items-start justify-between"><div><p className="font-extrabold">{row.expense.title}</p><p className="mt-1 text-xs text-gray-400">매월 {row.expense.paymentDay}일 · 고정지출</p></div><div className="text-right"><p className="font-extrabold">{formatWon(row.expense.amount)}</p><p className="mt-1 text-[11px] text-[#0284c7]">매월 반복</p></div></div><div className="mt-3 flex flex-wrap gap-2">{row.shares.map(share=><span key={share.name} className="rounded-full bg-[#f8f7fb] px-3 py-1.5 text-xs dark:bg-[#15141b]"><b>{share.name}</b> {formatWon(share.amount)}</span>)}</div></div>)}{!rows.length&&!recurringRows.length&&<div className="rounded-[20px] border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400 dark:border-white/10">선택한 월의 나눠 내기 내역이 없어요.</div>}</div></div></ModalShell>
}
function DetailModal({ item, onClose, onEdit, onPay, onPayNext, onUndo, onDelete }: { item: InstallmentItem; onClose: () => void; onEdit: () => void; onPay: (paymentId: string) => void; onPayNext: () => void; onUndo: () => void; onDelete: () => void }) {
  const next = nextPayment(item)
  const currentAmount = next?.amount || item.payments.at(-1)?.amount || 0
  const meta = [item.paymentMethod, item.merchant, item.category].filter(Boolean).join(' · ')
  return <ModalShell onClose={onClose}><div className="px-5 pb-8 pt-7"><p className="text-sm font-bold text-[#0284c7]">{item.status === 'active' ? '진행 중' : '납부 완료'}{item.splitPayment && ' · ' + item.splitParticipants.length + '명 나눠 내기'}</p><h2 className="mt-1 pr-12 text-2xl font-extrabold">{item.title}</h2><p className="mt-1 text-sm text-gray-400">{meta || '정보 없음'}</p>
    <div className="mt-5 rounded-[24px] bg-[#211f2d] p-5 text-white dark:bg-[#292731]"><p className="text-xs text-white/60">현재 남은 할부 금액</p><p className="mt-1 text-2xl font-extrabold">{formatWon(remainingAmount(item))}</p>{item.splitPayment && <p className="mt-1 text-sm font-bold text-[#7dd3fc]">{item.splitParticipants[0] || '내 이름'}의 남은 부담 {formatWon(myRemainingAmount(item))}</p>}<div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#38bdf8]" style={{ width: progress(item) + '%' }}/></div><div className="mt-2 flex justify-between text-xs text-white/60"><span>{item.paidCount}회 납부 완료</span><span>{progress(item)}%</span></div></div>
    <div className="mt-4 grid grid-cols-2 gap-3"><Summary icon={<CalendarDays size={19}/>} label="다음 미완료 결제일" value={next ? localDate(next.scheduledDate) : '완료'}/><Summary icon={<CreditCard size={19}/>} label="회차 예상 금액" value={formatWon(currentAmount)}/></div>
    <div className="mt-3 rounded-2xl bg-gray-100 p-3 text-[11px] leading-5 text-gray-500 dark:bg-white/5">회차 금액은 단순 분할한 예상치이며 카드사 실제 청구액과 다를 수 있습니다.</div>
    {item.splitPayment && <div className="mt-3 rounded-[22px] bg-white p-4 dark:bg-[#211f29]"><p className="mb-3 text-sm font-extrabold">이번 회차 분담액</p><div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">{splitShares(currentAmount, item.splitParticipants).map((share, index) => <div key={index} className={index === 0 ? 'rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10' : 'rounded-xl bg-[#f8f7fb] p-3 dark:bg-[#15141b]'}><p className="truncate text-xs text-gray-400">{share.name}{index === 0 ? ' · 나' : ''}</p><p className="mt-1 font-extrabold">{formatWon(share.amount)}</p></div>)}</div><p className="mt-3 text-[11px] leading-4 text-gray-400">균등 분할 후 남는 1원 단위 금액은 첫 번째 참여자에게 반영됩니다.</p></div>}
    <div className="mt-6 flex gap-2">{item.status === 'active' && next && <button onClick={onPayNext} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#0284c7] font-bold text-white"><Check size={18}/>{paymentDisplayStatus(next) === 'overdue' ? '경과 회차 납부 확인' : paymentDisplayStatus(next) === 'today' ? '오늘 회차 납부' : '다음 회차 납부'}</button>}<button onClick={onEdit} aria-label="할부 수정" className="grid h-12 w-12 place-items-center rounded-2xl bg-white dark:bg-[#211f29]"><Pencil size={18}/></button></div>
    {item.paidCount > 0 && <button onClick={onUndo} className="mt-2 min-h-11 w-full text-sm font-bold text-gray-400">이전 납부 취소</button>}
    {item.memo && <div className="mt-5 rounded-[20px] bg-white p-4 dark:bg-[#211f29]"><p className="text-xs font-bold text-gray-400">메모</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.memo}</p></div>}
    <h3 className="mt-7 font-extrabold">회차별 납부 내역</h3><div className="mt-3 overflow-hidden rounded-[20px] bg-white dark:bg-[#211f29]">{item.payments.map(payment => { const display = paymentDisplayStatus(payment); const color = display === 'paid' ? 'text-emerald-600' : display === 'overdue' ? 'text-amber-600' : display === 'today' ? 'text-[#0284c7]' : 'text-gray-400'; return <div key={payment.id} className={'border-b px-4 py-3 last:border-0 dark:border-white/5 ' + (display === 'overdue' ? 'bg-amber-50/60 dark:bg-amber-500/5' : '')}><div className="flex min-h-11 items-center gap-3"><span className={'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ' + (display === 'paid' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15' : display === 'overdue' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15' : 'bg-gray-100 text-gray-400 dark:bg-white/10')}>{display === 'paid' ? <Check size={14}/> : payment.sequence}</span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{payment.sequence}회차</p><p className="text-xs text-gray-400">{payment.scheduledDate.replaceAll('-', '.')}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold">{formatWon(payment.amount)}</p><p className={'text-[11px] font-bold ' + color}>{paymentStatusLabel(payment)}</p></div></div>{item.splitPayment && <p className="mt-1 pl-11 text-[10px] text-[#0284c7]">{splitShares(payment.amount, item.splitParticipants).map(share => share.name + ' ' + formatWon(share.amount)).join(' · ')}</p>}{payment.status === 'scheduled' && display !== 'upcoming' && <button onClick={() => onPay(payment.id)} className={'mt-2 min-h-11 w-full rounded-xl text-xs font-bold ' + (display === 'overdue' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-sky-50 text-[#0284c7] dark:bg-sky-500/10')}>이 회차 납부 완료 처리</button>}</div> })}</div>
    <div className="mt-4 rounded-2xl bg-sky-50 p-4 text-xs leading-5 text-gray-600 dark:bg-sky-500/10 dark:text-gray-300"><b className="text-[#0284c7]">상태 안내</b><p className="mt-1">납부 완료는 직접 확인한 회차입니다. 오늘 결제는 결제일이 오늘인 미완료 회차이며, 결제일 경과는 날짜가 지났지만 아직 완료 확인하지 않은 회차입니다.</p></div>
    <button onClick={onDelete} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-red-500"><Trash2 size={17}/>이 내역 삭제</button>
  </div></ModalShell>
}
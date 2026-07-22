import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, CreditCard, Pencil, Power, Search, Trash2, X } from 'lucide-react'
import type { RecurringActivePeriod, RecurringExpense, RecurringExpenseFormData } from './types'
import { formatMonthKey, formatWon, monthKey, recurringActiveInMonth, shiftMonthKey, splitShares } from './utils'

export const recurringCategories = ['주거', '공과금', '통신', '보험', '구독', '운동', '저축', '대출', '교통', '교육', '기타']
type RecurringSort = 'day' | 'my-desc' | 'my-asc' | 'total-desc' | 'total-asc' | 'category' | 'recent'
const RECURRING_SORT_KEY = 'expense-note-recurring-sort'
const recurringSorts: RecurringSort[] = ['day', 'my-desc', 'my-asc', 'total-desc', 'total-asc', 'category', 'recent']

function loadRecurringSort(): RecurringSort {
  const stored = localStorage.getItem(RECURRING_SORT_KEY) as RecurringSort | null
  return stored && recurringSorts.includes(stored) ? stored : 'day'
}

function recurringMyAmount(expense: RecurringExpense) {
  return expense.splitPayment ? splitShares(expense.amount, expense.splitParticipants)[0].amount : expense.amount
}

const blank = (): RecurringExpenseFormData => ({
  title: '', amount: '', paymentDay: '1', paymentMethod: '', category: '주거', memo: '',
  enabled: true, splitPayment: false, splitParticipants: ['나', '참여자 2'], startMonth: monthKey(),
})

function latestPeriod(expense: RecurringExpense) {
  return expense.activePeriods.at(-1)
}

const formOf = (expense: RecurringExpense): RecurringExpenseFormData => ({
  title: expense.title,
  amount: String(expense.amount),
  paymentDay: String(expense.paymentDay),
  paymentMethod: expense.paymentMethod,
  category: expense.category,
  memo: expense.memo,
  enabled: expense.enabled,
  splitPayment: expense.splitPayment || false,
  splitParticipants: expense.splitParticipants?.length >= 2 ? expense.splitParticipants : ['나', '참여자 2'],
  startMonth: latestPeriod(expense)?.startMonth || monthKey(),
})

function make(form: RecurringExpenseFormData, existing?: RecurringExpense): RecurringExpense {
  const now = new Date().toISOString()
  let activePeriods: RecurringActivePeriod[] = existing?.activePeriods.map(period => ({ ...period })) || []
  if (!existing) {
    activePeriods = [{ startMonth: form.startMonth, endMonth: null }]
  } else if (existing.enabled) {
    const openIndex = activePeriods.findIndex(period => period.endMonth === null)
    if (openIndex >= 0) activePeriods[openIndex].startMonth = form.startMonth
  }
  return {
    id: existing?.id ?? crypto.randomUUID(),
    title: form.title.trim(),
    amount: Number(form.amount),
    paymentDay: Math.min(31, Math.max(1, Number(form.paymentDay))),
    paymentMethod: form.paymentMethod.trim(),
    category: form.category,
    memo: form.memo.trim(),
    repeatType: 'monthly',
    enabled: existing?.enabled ?? true,
    splitPayment: form.splitPayment,
    splitParticipants: form.splitPayment ? form.splitParticipants.map((name, index) => name.trim() || `참여자 ${index + 1}`) : [],
    activePeriods,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function Shell({ children, close }: { children: React.ReactNode; close: () => void }) {
  return <div data-swipe-ignore className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm"><div className="absolute inset-x-0 bottom-0 mx-auto max-h-[94vh] max-w-[480px] overflow-y-auto rounded-t-[30px] bg-[#f8f7fb] dark:bg-[#15141b]"><button onClick={close} className="absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-full bg-white dark:bg-[#292731]"><X size={19}/></button>{children}</div></div>
}

function Field({ label, value, set, type = 'text', min, max }: { label: string; value: string; set: (value: string) => void; type?: string; min?: string; max?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span><input required type={type} min={min} max={max} value={value} onChange={event => set(event.target.value)} className="h-12 w-full rounded-2xl border-0 bg-white px-4 outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#211f29]"/></label>
}

function Editor({ form, setForm, selected, save, close, participantDefaults }: { form: RecurringExpenseFormData; setForm: (form: RecurringExpenseFormData) => void; selected: RecurringExpense | null; save: (event: React.FormEvent) => void; close: () => void; participantDefaults: string[] }) {
  const set = (key: keyof RecurringExpenseFormData, value: string | boolean) => setForm({ ...form, [key]: value })
  return <Shell close={close}><form onSubmit={save} className="px-5 pb-8 pt-7">
    <p className="text-sm font-bold text-[#0284c7]">매월 반복 지출</p>
    <h2 className="mt-1 text-2xl font-extrabold">{selected ? '고정지출 수정' : '고정지출 등록'}</h2>
    <div className="mt-6 space-y-4">
      <Field label="항목명 *" value={form.title} set={value => set('title', value)}/>
      <Field label="금액 *" value={form.amount} set={value => set('amount', value)} type="number" min="0"/>
      <Field label="매월 결제일 *" value={form.paymentDay} set={value => set('paymentDay', value)} type="number" min="1" max="31"/>
      {(!selected || selected.enabled) && <div><Field label="적용 시작월 *" value={form.startMonth} set={value => set('startMonth', value)} type="month"/><p className="mt-2 text-xs text-gray-400">선택한 월부터 월별 지출에 포함됩니다.</p></div>}
      <label className="block"><span className="mb-2 block text-sm font-bold">카테고리</span><select value={form.category} onChange={event => set('category', event.target.value)} className="h-12 w-full rounded-2xl border-0 bg-white px-4 dark:bg-[#211f29]">{recurringCategories.map(category => <option key={category}>{category}</option>)}</select></label>
      <Field label="결제수단" value={form.paymentMethod} set={value => set('paymentMethod', value)}/>
      <label className="block"><span className="mb-2 block text-sm font-bold">메모</span><textarea value={form.memo} onChange={event => set('memo', event.target.value)} rows={3} className="w-full rounded-2xl border-0 bg-white p-4 dark:bg-[#211f29]"/></label>
      <div className="rounded-[20px] bg-white p-4 dark:bg-[#211f29]">
        <div className="flex items-center justify-between"><div><b>나눠 내기</b><p className="mt-1 text-xs text-gray-400">월 고정지출을 균등하게 나눠요.</p></div><button type="button" onClick={() => set('splitPayment', !form.splitPayment)} className={`h-7 w-12 rounded-full p-1 ${form.splitPayment ? 'bg-[#0284c7]' : 'bg-gray-200'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${form.splitPayment ? 'translate-x-5' : ''}`}/></button></div>
        {form.splitPayment && <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5">
          <label className="mb-2 block text-sm font-bold">참여 인원</label>
          <select value={form.splitParticipants.length} onChange={event => { const count = Number(event.target.value); setForm({ ...form, splitParticipants: Array.from({ length: count }, (_, index) => form.splitParticipants[index] || participantDefaults[index] || `참여자 ${index + 1}`) }) }} className="h-11 w-full rounded-xl border-0 bg-[#f8f7fb] px-3 dark:bg-[#15141b]">{Array.from({ length: 7 }, (_, index) => index + 2).map(count => <option key={count} value={count}>{count}명</option>)}</select>
          <div className="mt-3 grid grid-cols-2 gap-2">{form.splitParticipants.map((name, index) => <label key={index}><span className="mb-1 block text-[10px] font-bold text-gray-400">{index === 0 ? '내 이름' : `${index + 1}번 참여자`}</span><input value={name} onChange={event => { const names = [...form.splitParticipants]; names[index] = event.target.value; setForm({ ...form, splitParticipants: names }) }} className="h-10 w-full rounded-xl border-0 bg-[#f8f7fb] px-3 text-sm dark:bg-[#15141b]"/></label>)}</div>
          <div className="mt-3 rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-500/10">{splitShares(Number(form.amount) || 0, form.splitParticipants).map((share, index) => <div key={index} className="flex justify-between py-1"><span>{share.name}</span><b>{formatWon(share.amount)}</b></div>)}</div>
        </div>}
      </div>
    </div>
    <button className="mt-6 h-14 w-full rounded-2xl bg-[#0284c7] font-extrabold text-white">{selected ? '수정 내용 저장' : '고정지출 등록하기'}</button>
  </form></Shell>
}

function PeriodEditor({ expense, mode, value, setValue, save, close }: { expense: RecurringExpense; mode: 'enable' | 'disable'; value: string; setValue: (value: string) => void; save: (event: React.FormEvent) => void; close: () => void }) {
  const openPeriod = expense.activePeriods.find(period => period.endMonth === null)
  return <Shell close={close}><form onSubmit={save} className="px-5 pb-8 pt-7">
    <p className="text-sm font-bold text-[#0284c7]">사용 기간 설정</p>
    <h2 className="mt-1 pr-12 text-2xl font-extrabold">{mode === 'disable' ? '사용 종료' : '다시 사용'}</h2>
    <p className="mt-3 text-sm leading-6 text-gray-500">{mode === 'disable' ? '마지막으로 지출에 포함할 월을 선택하세요. 늦게 OFF했어도 실제 종료월을 지정할 수 있어요.' : '다시 지출에 포함할 시작월을 선택하세요.'}</p>
    <div className="mt-6"><Field label={mode === 'disable' ? '마지막 적용월' : '다시 적용할 시작월'} value={value} set={setValue} type="month" min={mode === 'disable' ? openPeriod?.startMonth : undefined} max={monthKey()}/></div>
    <button className="mt-6 h-14 w-full rounded-2xl bg-[#0284c7] font-extrabold text-white">{mode === 'disable' ? '이 월까지 포함하고 OFF' : '이 월부터 다시 ON'}</button>
  </form></Shell>
}

function periodText(period: RecurringActivePeriod) {
  return `${formatMonthKey(period.startMonth)} ~ ${period.endMonth ? formatMonthKey(period.endMonth) : '사용 중'}`
}

export function RecurringView({ expenses, setExpenses, addSignal, participantDefaults }: { expenses: RecurringExpense[]; setExpenses: React.Dispatch<React.SetStateAction<RecurringExpense[]>>; addSignal: number; participantDefaults: string[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('전체')
  const [sort, setSort] = useState<RecurringSort>(loadRecurringSort)
  const [modal, setModal] = useState<'edit' | 'detail' | 'period' | null>(null)
  const [selected, setSelected] = useState<RecurringExpense | null>(null)
  const [form, setForm] = useState(blank)
  const [periodMode, setPeriodMode] = useState<'enable' | 'disable'>('disable')
  const [periodMonth, setPeriodMonth] = useState(monthKey())
  const lastAddSignal = useRef(addSignal)

  const add = () => {
    const next = blank()
    next.splitParticipants = participantDefaults.slice(0, 2)
    setSelected(null)
    setForm(next)
    setModal('edit')
  }
  useEffect(() => {
    if (addSignal !== lastAddSignal.current) add()
    lastAddSignal.current = addSignal
  }, [addSignal])
  useEffect(() => { localStorage.setItem(RECURRING_SORT_KEY, sort) }, [sort])

  const rows = useMemo(() => expenses.filter(expense =>
    [expense.title, expense.category, expense.memo, expense.paymentMethod].join(' ').toLowerCase().includes(query.toLowerCase()) &&
    (status === 'all' || (status === 'enabled' ? expense.enabled : !expense.enabled)) &&
    (category === '전체' || expense.category === category)
  ).sort((a, b) => {
    if (sort === 'my-desc') return recurringMyAmount(b) - recurringMyAmount(a)
    if (sort === 'my-asc') return recurringMyAmount(a) - recurringMyAmount(b)
    if (sort === 'total-desc') return b.amount - a.amount
    if (sort === 'total-asc') return a.amount - b.amount
    if (sort === 'category') return a.category.localeCompare(b.category, 'ko') || a.paymentDay - b.paymentDay
    if (sort === 'recent') return b.createdAt.localeCompare(a.createdAt)
    return a.paymentDay - b.paymentDay
  }), [expenses, query, status, category, sort])

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const next = make(form, selected || undefined)
    setExpenses(previous => selected ? previous.map(expense => expense.id === selected.id ? next : expense) : [next, ...previous])
    setSelected(next)
    setModal('detail')
  }

  const beginToggle = () => {
    if (!selected) return
    setPeriodMode(selected.enabled ? 'disable' : 'enable')
    setPeriodMonth(monthKey())
    setModal('period')
  }

  const savePeriod = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) return
    let activePeriods = selected.activePeriods.map(period => ({ ...period }))
    if (periodMode === 'disable') {
      const openIndex = activePeriods.findIndex(period => period.endMonth === null)
      if (openIndex < 0 || periodMonth < activePeriods[openIndex].startMonth) return
      activePeriods[openIndex].endMonth = periodMonth
    } else {
      const previousIndex = activePeriods.reduce((found, period, index) => period.startMonth <= periodMonth ? index : found, -1)
      const previous = previousIndex >= 0 ? activePeriods[previousIndex] : undefined
      if (previous && (!previous.endMonth || shiftMonthKey(previous.endMonth, 1) >= periodMonth)) {
        previous.endMonth = null
        activePeriods = activePeriods.slice(0, previousIndex + 1)
      } else {
        activePeriods.push({ startMonth: periodMonth, endMonth: null })
        activePeriods.sort((a, b) => a.startMonth.localeCompare(b.startMonth))
      }
    }
    const next = { ...selected, enabled: periodMode === 'enable', activePeriods, updatedAt: new Date().toISOString() }
    setExpenses(previous => previous.map(expense => expense.id === next.id ? next : expense))
    setSelected(next)
    setModal('detail')
  }

  const remove = () => {
    if (selected && confirm('이 고정지출을 삭제하시겠습니까?')) {
      setExpenses(previous => previous.filter(expense => expense.id !== selected.id))
      setModal(null)
    }
  }

  const currentTotal = expenses.filter(expense => recurringActiveInMonth(expense, monthKey())).reduce((sum, expense) => sum + expense.amount, 0)

  return <>
    <header className="px-5 pb-5 pt-8"><div><p className="mb-1 text-sm font-semibold text-[#0284c7]">매월 반복 관리</p><h1 className="text-[28px] font-extrabold">고정지출</h1></div></header>
    <div className="px-5">
      <div className="rounded-[24px] bg-gradient-to-br from-[#0284c7] to-[#38bdf8] p-5 text-white"><p className="text-xs text-white/70">현재 활성 고정지출</p><p className="mt-1 text-3xl font-extrabold">{formatWon(currentTotal)}</p></div>
      <div className="mt-4 flex h-12 items-center gap-2 rounded-2xl bg-white px-4 dark:bg-[#211f29]"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="항목명, 카테고리, 메모, 결제수단 검색" className="w-full bg-transparent text-sm outline-none"/></div>
      <div data-swipe-ignore className="mt-3 flex gap-2">{['all', 'enabled', 'disabled'].map(value => <button key={value} onClick={() => setStatus(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${status === value ? 'bg-[#0284c7] text-white' : 'bg-white text-gray-500'}`}>{value === 'all' ? '전체' : value === 'enabled' ? '활성' : '비활성'}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2"><select value={category} onChange={event => setCategory(event.target.value)} className="h-11 rounded-xl border-0 bg-white px-3 dark:bg-[#211f29]"><option>전체</option>{recurringCategories.map(value => <option key={value}>{value}</option>)}</select><select data-swipe-ignore value={sort} onChange={event => setSort(event.target.value as RecurringSort)} className="h-11 rounded-xl border-0 bg-white px-3 dark:bg-[#211f29]"><option value="day">결제일 빠른 순</option><option value="my-desc">내 부담액 높은 순</option><option value="my-asc">내 부담액 낮은 순</option><option value="total-desc">전체 금액 높은 순</option><option value="total-asc">전체 금액 낮은 순</option><option value="category">카테고리순</option><option value="recent">최근 등록 순</option></select></div>
      <div className="mt-5 space-y-3">{rows.map(expense => <button key={expense.id} onClick={() => { setSelected(expense); setModal('detail') }} className={`w-full rounded-[22px] border bg-white p-4 text-left dark:bg-[#211f29] ${expense.enabled ? 'border-gray-100' : 'border-dashed opacity-60'}`}>
        <div className="flex justify-between"><div><div className="flex flex-wrap items-center gap-2"><b>{expense.title}</b>{expense.splitPayment && <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-[#0284c7]">{expense.splitParticipants.length}명 나눠 내기</span>}<span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-[#0284c7]">{expense.enabled ? 'ON' : 'OFF'}</span></div><p className="mt-1 text-xs text-gray-400">{[expense.category, expense.paymentMethod].filter(Boolean).join(' · ')}</p></div><ChevronRight size={18}/></div>
        <div className="mt-4 flex justify-between"><div><p className="text-xs text-gray-400">{expense.splitPayment ? '각자 부담 금액' : '월 고정지출'}</p><p className="text-lg font-extrabold">{formatWon(expense.splitPayment ? splitShares(expense.amount, expense.splitParticipants)[0].amount : expense.amount)}</p>{expense.splitPayment && <p className="text-[11px] text-gray-400">전체 {formatWon(expense.amount)}</p>}</div><div className="text-right"><p className="text-xs font-bold text-[#0284c7]">매월 {expense.paymentDay}일</p><p className="mt-1 text-[10px] text-gray-400">{latestPeriod(expense) ? periodText(latestPeriod(expense)!) : '사용 기간 없음'}</p></div></div>
      </button>)}{!rows.length && <div className="py-14 text-center text-gray-400"><CreditCard className="mx-auto"/><p className="mt-3 text-sm font-bold">고정지출이 없어요.</p></div>}</div>
    </div>
    {modal === 'edit' && <Editor form={form} setForm={setForm} selected={selected} save={save} close={() => setModal(null)} participantDefaults={participantDefaults}/>} 
    {modal === 'period' && selected && <PeriodEditor expense={selected} mode={periodMode} value={periodMonth} setValue={setPeriodMonth} save={savePeriod} close={() => setModal('detail')}/>} 
    {modal === 'detail' && selected && <Shell close={() => setModal(null)}><div className="px-5 pb-8 pt-7">
      <p className="text-sm font-bold text-[#0284c7]">{selected.enabled ? '사용 중 · 매월 반복' : '사용 안 함'}</p><h2 className="mt-1 text-2xl font-extrabold">{selected.title}</h2>
      <div className="mt-5 rounded-[24px] bg-[#211f2d] p-5 text-white"><p className="text-xs text-white/60">월 고정지출</p><p className="mt-1 text-3xl font-extrabold">{formatWon(selected.amount)}</p><p className="mt-4 text-sm text-white/70">매월 {selected.paymentDay}일 · {selected.category}</p></div>
      {selected.splitPayment && <div className="mt-3 rounded-2xl bg-white p-4 dark:bg-[#211f29]"><p className="mb-3 text-sm font-extrabold">월 분담액</p><div className="grid grid-cols-2 gap-2">{splitShares(selected.amount, selected.splitParticipants).map((share, index) => <div key={index} className={`rounded-xl p-3 ${index === 0 ? 'bg-sky-50 dark:bg-sky-500/10' : 'bg-[#f8f7fb] dark:bg-[#15141b]'}`}><p className="text-xs text-gray-400">{share.name}{index === 0 ? ' · 나' : ''}</p><b>{formatWon(share.amount)}</b></div>)}</div></div>}
      <div className="mt-3 rounded-2xl bg-white p-4 dark:bg-[#211f29]"><p className="text-sm font-extrabold">사용 기간</p><div className="mt-3 space-y-2">{selected.activePeriods.length ? selected.activePeriods.map((period, index) => <div key={`${period.startMonth}-${index}`} className="flex items-center justify-between rounded-xl bg-[#f8f7fb] px-3 py-2 text-xs dark:bg-[#15141b]"><span>{periodText(period)}</span><b className={period.endMonth ? 'text-gray-400' : 'text-[#0284c7]'}>{period.endMonth ? '종료' : 'ON'}</b></div>) : <p className="text-xs text-gray-400">기록된 사용 기간이 없어요.</p>}</div></div>
      {selected.memo && <div className="mt-4 rounded-2xl bg-white p-4 dark:bg-[#211f29]"><b className="text-xs text-gray-400">메모</b><p className="mt-2 text-sm">{selected.memo}</p></div>}
      <div className="mt-5 flex gap-2"><button onClick={beginToggle} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-200 font-bold dark:bg-white/10"><Power size={17}/>{selected.enabled ? '사용 중지' : '다시 사용'}</button><button onClick={() => { setForm(formOf(selected)); setModal('edit') }} className="grid h-12 w-12 place-items-center rounded-2xl bg-white dark:bg-[#211f29]"><Pencil size={18}/></button></div>
      <button onClick={remove} className="mt-5 flex h-12 w-full items-center justify-center gap-2 text-sm font-bold text-red-500"><Trash2 size={17}/>삭제</button>
    </div></Shell>}
  </>
}

import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, CreditCard, Split, WalletCards } from 'lucide-react'
import type { InstallmentItem } from './types'
import { formatWon } from './utils'
import { overduePaymentRows } from './overdue-utils'

type SplitFilter = 'all' | 'normal' | 'split'
type PeriodFilter = 'all' | 'within-7' | '8-30' | 'over-30'
type OverdueSort = 'oldest' | 'recent' | 'amount-desc' | 'amount-asc'

export function OverdueScreen({ items, onClose, onMarkPaid }: { items: InstallmentItem[]; onClose: () => void; onMarkPaid: (keys: ReadonlySet<string>) => void }) {
  const rows = useMemo(() => overduePaymentRows(items), [items])
  const [itemId, setItemId] = useState('all')
  const [method, setMethod] = useState('all')
  const [split, setSplit] = useState<SplitFilter>('all')
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const [sort, setSort] = useState<OverdueSort>('oldest')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const itemOptions = useMemo(() => [...new Map(rows.map(row => [row.item.id, row.item.title])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko')), [rows])
  const methodOptions = useMemo(() => [...new Set(rows.map(row => row.item.paymentMethod.trim()))].sort((a, b) => a.localeCompare(b, 'ko')), [rows])
  const filtered = useMemo(() => rows.filter(row => {
    if (itemId !== 'all' && row.item.id !== itemId) return false
    if (method !== 'all' && row.item.paymentMethod !== method) return false
    if (split === 'normal' && row.item.splitPayment) return false
    if (split === 'split' && !row.item.splitPayment) return false
    if (period === 'within-7' && row.daysOverdue > 7) return false
    if (period === '8-30' && (row.daysOverdue < 8 || row.daysOverdue > 30)) return false
    if (period === 'over-30' && row.daysOverdue <= 30) return false
    return true
  }).sort((a, b) => {
    if (sort === 'recent') return b.payment.scheduledDate.localeCompare(a.payment.scheduledDate)
    if (sort === 'amount-desc') return b.payment.amount - a.payment.amount
    if (sort === 'amount-asc') return a.payment.amount - b.payment.amount
    return a.payment.scheduledDate.localeCompare(b.payment.scheduledDate)
  }), [rows, itemId, method, split, period, sort])

  const selectedRows = rows.filter(row => selected.has(row.key))
  const selectedAmount = selectedRows.reduce((sum, row) => sum + row.payment.amount, 0)
  const selectedMine = selectedRows.reduce((sum, row) => sum + row.myAmount, 0)
  const totalAmount = rows.reduce((sum, row) => sum + row.payment.amount, 0)
  const oldestDate = rows.length ? rows.reduce((oldest, row) => row.payment.scheduledDate < oldest ? row.payment.scheduledDate : oldest, rows[0].payment.scheduledDate) : null
  const allVisibleSelected = filtered.length > 0 && filtered.every(row => selected.has(row.key))

  const resetSelection = () => setSelected(new Set())
  const updateFilter = <T,>(setter: (value: T) => void, value: T) => { setter(value); resetSelection() }
  const toggle = (key: string) => setSelected(previous => {
    const next = new Set(previous)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map(row => row.key)))
  const confirmPaid = () => {
    if (!selectedRows.length) return
    const message = `선택한 ${selectedRows.length}건, 총 ${formatWon(selectedAmount)}을 납부 완료로 변경할까요?\n나눠 내기를 반영한 내 부담액은 ${formatWon(selectedMine)}입니다.`
    if (!confirm(message)) return
    onMarkPaid(selected)
    resetSelection()
  }

  return <div data-swipe-ignore className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm">
    <div className="relative mx-auto flex h-[100dvh] max-w-[480px] flex-col overflow-hidden bg-[#f8f7fb] dark:bg-[#15141b] dark:text-white">
      <header className="shrink-0 border-b border-gray-100 bg-[#f8f7fb]/95 px-4 pb-4 pt-[calc(12px+env(safe-area-inset-top))] backdrop-blur dark:border-white/5 dark:bg-[#15141b]/95">
        <div className="flex items-center gap-2"><button onClick={onClose} aria-label="이전 화면" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white dark:bg-[#211f29]"><ArrowLeft size={20}/></button><div className="min-w-0"><p className="text-xs font-bold text-amber-600">결제일 경과 · 확인 필요</p><h1 className="truncate text-2xl font-extrabold">미납 내역</h1></div></div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[190px] pt-4">
        {rows.length === 0 ? <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-[26px] border border-dashed border-gray-200 bg-white px-6 text-center dark:border-white/10 dark:bg-[#211f29]"><Check className="text-emerald-500" size={34}/><p className="mt-4 font-extrabold">현재 미납된 결제 내역이 없어요.</p><p className="mt-1 text-xs leading-5 text-gray-400">결제일이 지난 미완료 회차가 생기면 이곳에 표시됩니다.</p></div> : <>
          <section className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            <Summary icon={<AlertTriangle size={17}/>} label="전체 미납" value={`${rows.length}건`}/>
            <Summary icon={<WalletCards size={17}/>} label="전체 금액" value={formatWon(totalAmount)}/>
            <Summary icon={<CreditCard size={17}/>} label="가장 오래된 날" value={oldestDate?.replaceAll('-', '.') || '-'}/>
          </section>

          <section className="mt-4 rounded-[22px] bg-white p-4 dark:bg-[#211f29]">
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <Select label="할부" value={itemId} onChange={value => updateFilter(setItemId, value)}><option value="all">전체 할부</option>{itemOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</Select>
              <Select label="카드사·결제수단" value={method} onChange={value => updateFilter(setMethod, value)}><option value="all">전체 결제수단</option>{methodOptions.map(value => <option key={value || 'empty'} value={value}>{value || '미입력'}</option>)}</Select>
              <Select label="결제 유형" value={split} onChange={value => updateFilter(setSplit, value as SplitFilter)}><option value="all">전체 유형</option><option value="normal">일반 결제</option><option value="split">나눠 내기</option></Select>
              <Select label="미납 기간" value={period} onChange={value => updateFilter(setPeriod, value as PeriodFilter)}><option value="all">전체 기간</option><option value="within-7">7일 이내</option><option value="8-30">8~30일</option><option value="over-30">30일 초과</option></Select>
            </div>
            <Select label="정렬" value={sort} onChange={value => { setSort(value as OverdueSort); resetSelection() }} className="mt-2"><option value="oldest">오래된 미납순</option><option value="recent">최근 결제일순</option><option value="amount-desc">미납 금액 높은 순</option><option value="amount-asc">미납 금액 낮은 순</option></Select>
          </section>

          <div className="mt-4 flex min-h-11 items-center justify-between gap-2"><p className="text-sm font-extrabold">조회 결과 {filtered.length}건</p><button onClick={toggleAll} disabled={!filtered.length} className="min-h-11 rounded-xl px-3 text-xs font-bold text-[#0284c7] disabled:text-gray-300">{allVisibleSelected ? '전체 선택 해제' : '현재 결과 전체 선택'}</button></div>
          <section className="space-y-3">{filtered.map(row => {
            const checked = selected.has(row.key)
            return <label key={row.key} className={`block cursor-pointer rounded-[22px] border bg-white p-4 transition dark:bg-[#211f29] ${checked ? 'border-[#0284c7] ring-2 ring-sky-100 dark:ring-sky-500/10' : 'border-gray-100 dark:border-white/5'}`}>
              <div className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={() => toggle(row.key)} aria-label={`${row.item.title} ${row.payment.sequence}회차 선택`} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0284c7]"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 break-words font-extrabold">{row.item.title}</p>{row.item.splitPayment && <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-[#0284c7] dark:bg-sky-500/10"><Split size={11} className="mr-1 inline"/>나눠 내기</span>}</div><p className="mt-1 break-words text-xs text-gray-400">{row.item.paymentMethod || '결제수단 미입력'} · {row.payment.sequence}/{row.item.installmentMonths}회차</p></div></div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10"><p className="text-[11px] text-amber-700 dark:text-amber-300">원래 결제일</p><b>{row.payment.scheduledDate.replaceAll('-', '.')}</b><p className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">{row.daysOverdue}일 경과</p></div><div className="rounded-xl bg-[#f8f7fb] p-3 text-right dark:bg-[#15141b]"><p className="text-[11px] text-gray-400">카드사 납부액</p><b>{formatWon(row.payment.amount)}</b>{row.item.splitPayment && <p className="mt-1 text-[11px] font-bold text-[#0284c7]">내 부담 {formatWon(row.myAmount)}</p>}</div></div>
            </label>
          })}{filtered.length === 0 && <div className="rounded-[22px] border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400 dark:border-white/10 dark:bg-[#211f29]">선택한 조건에 맞는 미납 내역이 없어요.</div>}</section>
        </>}
      </main>

      <div className="absolute inset-x-0 bottom-0 border-t border-gray-100 bg-white/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-white/5 dark:bg-[#211f29]/95">
        <div className="mb-2 flex items-start justify-between gap-3 text-xs"><div><b>선택 {selectedRows.length}건</b><p className="mt-0.5 text-gray-400">내 부담 {formatWon(selectedMine)}</p></div><div className="text-right"><span className="text-gray-400">카드사 납부액</span><p className="font-extrabold">{formatWon(selectedAmount)}</p></div></div>
        <button onClick={confirmPaid} disabled={!selectedRows.length} className="min-h-12 w-full rounded-2xl bg-[#0284c7] px-4 font-extrabold text-white disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-white/10">선택 항목 납부 완료</button>
      </div>
    </div>
  </div>
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl bg-white p-3 dark:bg-[#211f29]"><span className="text-amber-600">{icon}</span><p className="mt-2 text-[10px] text-gray-400">{label}</p><p className="mt-0.5 break-words text-sm font-extrabold">{value}</p></div>
}

function Select({ label, value, onChange, children, className = '' }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 ${className}`}><span className="mb-1 block text-[10px] font-bold text-gray-400">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border-0 bg-[#f8f7fb] px-3 text-sm outline-none focus:ring-2 focus:ring-[#0284c7] dark:bg-[#15141b]">{children}</select></label>
}

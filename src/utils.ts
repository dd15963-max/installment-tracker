import type { InstallmentItem, InstallmentPayment, ItemFormData, RecurringExpense } from './types'

export const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })
export const formatWon = (value: number) => won.format(value)
export const localDate = (iso: string) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(`${iso}T00:00:00`))
export const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export type PaymentDisplayStatus = 'paid' | 'today' | 'overdue' | 'upcoming'
export function paymentDisplayStatus(payment: InstallmentPayment, today = todayKey()): PaymentDisplayStatus {
  if (payment.status === 'paid') return 'paid'
  if (payment.scheduledDate === today) return 'today'
  return payment.scheduledDate < today ? 'overdue' : 'upcoming'
}
export const paymentStatusLabel = (payment: InstallmentPayment, today = todayKey()) => {
  const status = paymentDisplayStatus(payment, today)
  return status === 'paid' ? '납부 완료' : status === 'today' ? '오늘 결제' : status === 'overdue' ? '결제일 경과 · 확인 필요' : '납부 예정'
}

const pad = (value: number) => String(value).padStart(2, '0')

export function addMonthsClamped(dateString: string, months: number) {
  const [year, month, day] = dateString.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(Math.min(day, lastDay))}`
}

export function calculatePaidCount(firstDate: string, months: number, today = new Date()) {
  if (!firstDate || !Number.isFinite(months) || months < 1) return 0
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  let count = 0
  for (let index = 0; index < months; index += 1) {
    if (addMonthsClamped(firstDate, index) < todayKey) count += 1
  }
  return Math.min(count, months)
}

export function createPayments(total: number, months: number, firstDate: string, paidCount = 0): InstallmentPayment[] {
  const basic = Math.floor(total / months)
  return Array.from({ length: months }, (_, index) => ({
    id: crypto.randomUUID(),
    sequence: index + 1,
    scheduledDate: addMonthsClamped(firstDate, index),
    amount: index === months - 1 ? total - basic * (months - 1) : basic,
    status: index < paidCount ? 'paid' : 'scheduled',
    ...(index < paidCount ? { paidAt: new Date().toISOString() } : {}),
  }))
}

export function itemFromForm(form: ItemFormData, existing?: InstallmentItem): InstallmentItem {
  const total = Number(form.totalAmount.replace(/,/g, ''))
  const months = Number(form.installmentMonths)
  const paidCount = Math.min(Number(form.paidCount || 0), months)
  const now = new Date().toISOString()
  const scheduleChanged = !existing || installmentScheduleChanged(form, existing)
  const paidCountChanged = !!existing && paidCount !== existing.paidCount
  let payments: InstallmentPayment[]
  if (existing && !scheduleChanged && !paidCountChanged) {
    payments = existing.payments.map(payment => ({ ...payment }))
  } else {
    const base = scheduleChanged ? createPayments(total, months, form.firstPaymentDate, 0) : existing!.payments.map(payment => ({ ...payment }))
    payments = base.map((payment, index) => {
      if (index >= paidCount) {
        const { paidAt: _paidAt, ...scheduledPayment } = payment
        return { ...scheduledPayment, status: 'scheduled' as const }
      }
      const previous = existing?.payments.find(candidate => candidate.sequence === payment.sequence)
      return { ...payment, status: 'paid' as const, paidAt: previous?.paidAt || new Date().toISOString() }
    })
  }
  return {
    id: existing?.id ?? crypto.randomUUID(),
    title: form.title.trim(), totalAmount: total, installmentMonths: months,
    firstPaymentDate: form.firstPaymentDate, paymentMethod: form.paymentMethod.trim(),
    merchant: form.merchant.trim(), category: form.category, memo: form.memo.trim(),
    splitPayment: form.splitPayment, splitParticipants: form.splitPayment ? form.splitParticipants.map((name, index) => name.trim() || String.fromCharCode(65 + index)) : [],
    paidCount, status: paidCount === months ? 'completed' : 'active',
    createdAt: existing?.createdAt ?? now, updatedAt: now,
    ...(existing?.isSample ? { isSample: true } : {}),
    ...(paidCount === months ? { completedAt: existing?.completedAt || now } : {}), payments,
  }
}

export function installmentScheduleChanged(form: ItemFormData, item: InstallmentItem) {
  return Number(form.totalAmount.replace(/,/g, '')) !== item.totalAmount ||
    Number(form.installmentMonths) !== item.installmentMonths ||
    form.firstPaymentDate !== item.firstPaymentDate
}

export function validateItemForm(form: ItemFormData) {
  const errors: string[] = []
  const total = Number(form.totalAmount.replace(/,/g, ''))
  const months = Number(form.installmentMonths)
  const paidCount = Number(form.paidCount || 0)
  if (!form.title.trim()) errors.push('품목명을 입력해 주세요.')
  if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(total)) errors.push('총 결제 금액은 1원 이상의 정수로 입력해 주세요.')
  if (!Number.isInteger(months) || months < 1 || months > 120) errors.push('할부 개월 수는 1~120개월 사이로 입력해 주세요.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.firstPaymentDate) || Number.isNaN(new Date(`${form.firstPaymentDate}T00:00:00`).getTime())) errors.push('올바른 첫 결제일을 선택해 주세요.')
  if (!Number.isInteger(paidCount) || paidCount < 0 || (Number.isInteger(months) && paidCount > months)) errors.push('납부 완료 회차를 확인해 주세요.')
  if (form.splitPayment) {
    const names = form.splitParticipants.map(name => name.trim())
    if (names.length < 2 || names.some(name => !name)) errors.push('나눠 내기 참여자 이름을 모두 입력해 주세요.')
    if (new Set(names).size !== names.length) errors.push('참여자 이름은 서로 다르게 입력해 주세요.')
  }
  return errors
}

export function formatAmountInput(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits ? Number(digits).toLocaleString('ko-KR') : ''
}

export const paidAmount = (item: InstallmentItem) => item.payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0)
export const remainingAmount = (item: InstallmentItem) => item.totalAmount - paidAmount(item)
export const nextPayment = (item: InstallmentItem) => item.payments.find(p => p.status === 'scheduled')
export const progress = (item: InstallmentItem) => Math.round((item.paidCount / item.installmentMonths) * 100)
export function splitShares(amount: number, participants: string[]) {
  const names = participants.length >= 2 ? participants : ['A', 'B']
  const basic = Math.floor(amount / names.length)
  return names.map((name, index) => ({ name, amount: basic + (index === 0 ? amount - basic * names.length : 0) }))
}
export const myShare = (item: InstallmentItem, amount: number) => item.splitPayment ? splitShares(amount, item.splitParticipants)[0].amount : amount
export const myRemainingAmount = (item: InstallmentItem) => item.payments.filter(p => p.status === 'scheduled').reduce((sum, p) => sum + myShare(item, p.amount), 0)

export function monthKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}` }
export function shiftMonthKey(key: string, offset: number) {
  const [year, month] = key.split('-').map(Number)
  return monthKey(new Date(year, month - 1 + offset, 1))
}
export function formatMonthKey(key: string) {
  const [year, month] = key.split('-').map(Number)
  return `${year}년 ${month}월`
}
export function recurringActiveInMonth(expense: RecurringExpense, key: string) {
  return expense.activePeriods.some(period => period.startMonth <= key && (!period.endMonth || period.endMonth >= key))
}
export function monthScheduled(items: InstallmentItem[], key = monthKey()) {
  return items.flatMap(i => i.payments).filter(p => p.scheduledDate.startsWith(key)).reduce((sum, p) => sum + p.amount, 0)
}
export function monthPaid(items: InstallmentItem[], key = monthKey()) {
  return items.flatMap(i => i.payments).filter(p => p.scheduledDate.startsWith(key) && p.status === 'paid').reduce((sum, p) => sum + p.amount, 0)
}

export const emptyForm = (): ItemFormData => ({
  title: '', totalAmount: '', installmentMonths: '12', firstPaymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: '', merchant: '', category: '전자기기', memo: '', paidCount: '0', splitPayment: false, splitParticipants: ['A', 'B'],
})

export function formFromItem(item: InstallmentItem): ItemFormData {
  return { title: item.title, totalAmount: String(item.totalAmount), installmentMonths: String(item.installmentMonths), firstPaymentDate: item.firstPaymentDate, paymentMethod: item.paymentMethod, merchant: item.merchant, category: item.category, memo: item.memo, paidCount: String(item.paidCount), splitPayment: item.splitPayment || false, splitParticipants: item.splitParticipants?.length >= 2 ? item.splitParticipants : ['A', 'B'] }
}


import type { InstallmentItem, InstallmentPayment, ItemFormData } from './types'

export const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })
export const formatWon = (value: number) => won.format(value)
export const localDate = (iso: string) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(`${iso}T00:00:00`))

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
  const payments = createPayments(total, months, form.firstPaymentDate, paidCount)
  return {
    id: existing?.id ?? crypto.randomUUID(),
    title: form.title.trim(), totalAmount: total, installmentMonths: months,
    firstPaymentDate: form.firstPaymentDate, paymentMethod: form.paymentMethod.trim(),
    merchant: form.merchant.trim(), category: form.category, memo: form.memo.trim(),
    splitPayment: form.splitPayment, splitParticipants: form.splitPayment ? form.splitParticipants.map((name, index) => name.trim() || String.fromCharCode(65 + index)) : [],
    paidCount, status: paidCount === months ? 'completed' : 'active',
    createdAt: existing?.createdAt ?? now, updatedAt: now,
    ...(paidCount === months ? { completedAt: now } : {}), payments,
  }
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


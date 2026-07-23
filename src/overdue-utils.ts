import type { InstallmentItem } from './types'
import { myShare, paymentDisplayStatus, todayKey } from './utils'

export const paymentSelectionKey = (itemId: string, paymentId: string) => `${itemId}:${paymentId}`

export function overdueDays(scheduledDate: string, today = todayKey()) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.max(0, Math.floor((toUtc(today) - toUtc(scheduledDate)) / 86_400_000))
}

export function overduePaymentRows(items: InstallmentItem[], today = todayKey()) {
  return items.flatMap(item => item.payments
    .filter(payment => paymentDisplayStatus(payment, today) === 'overdue')
    .map(payment => ({
      key: paymentSelectionKey(item.id, payment.id),
      item,
      payment,
      daysOverdue: overdueDays(payment.scheduledDate, today),
      myAmount: myShare(item, payment.amount),
    })))
}

export function markPaymentsPaid(items: InstallmentItem[], selectedKeys: ReadonlySet<string>, paidAt: string) {
  if (!selectedKeys.size) return items
  return items.map(item => {
    let changed = false
    const payments = item.payments.map(payment => {
      const selected = selectedKeys.has(paymentSelectionKey(item.id, payment.id))
      if (!selected || payment.status === 'paid') return payment
      changed = true
      return { ...payment, status: 'paid' as const, paidAt }
    })
    if (!changed) return item
    const paidCount = payments.filter(payment => payment.status === 'paid').length
    const completed = paidCount === item.installmentMonths
    return {
      ...item,
      payments,
      paidCount,
      status: completed ? 'completed' as const : 'active' as const,
      updatedAt: paidAt,
      ...(completed ? { completedAt: item.completedAt || paidAt } : { completedAt: undefined }),
    }
  })
}

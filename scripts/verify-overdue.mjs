import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
  const overdue = await server.ssrLoadModule('/src/overdue-utils.ts')

  const item = {
    id: 'item-1',
    title: '테스트 할부',
    totalAmount: 3001,
    installmentMonths: 3,
    firstPaymentDate: '2026-07-01',
    paymentMethod: '테스트 카드',
    merchant: '',
    category: '기타',
    memo: '',
    splitPayment: true,
    splitParticipants: ['나', '참여자'],
    paidCount: 0,
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    payments: [
      { id: 'p1', sequence: 1, scheduledDate: '2026-07-01', amount: 1000, status: 'scheduled' },
      { id: 'p2', sequence: 2, scheduledDate: '2026-07-20', amount: 1000, status: 'scheduled' },
      { id: 'p3', sequence: 3, scheduledDate: '2026-07-23', amount: 1001, status: 'scheduled' },
    ],
  }

  const rows = overdue.overduePaymentRows([item], '2026-07-23')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(row => row.payment.id), ['p1', 'p2'])
  assert.deepEqual(rows.map(row => row.daysOverdue), [22, 3])
  assert.equal(rows[0].myAmount, 500)
  assert.equal(rows[1].myAmount, 500)
  assert.equal(rows.some(row => row.payment.id === 'p3'), false)

  const processedAt = '2026-07-23T03:00:00.000Z'
  const middleOnly = overdue.markPaymentsPaid([item], new Set([overdue.paymentSelectionKey(item.id, 'p2')]), processedAt)[0]
  assert.equal(item.payments[1].status, 'scheduled')
  assert.equal(middleOnly.payments[0].status, 'scheduled')
  assert.equal(middleOnly.payments[1].status, 'paid')
  assert.equal(middleOnly.payments[1].paidAt, processedAt)
  assert.equal(middleOnly.payments[2].status, 'scheduled')
  assert.equal(middleOnly.paidCount, 1)
  assert.equal(middleOnly.status, 'active')
  assert.equal(middleOnly.completedAt, undefined)

  const allPaid = overdue.markPaymentsPaid([middleOnly], new Set([
    overdue.paymentSelectionKey(item.id, 'p1'),
    overdue.paymentSelectionKey(item.id, 'p3'),
  ]), processedAt)[0]
  assert.equal(allPaid.payments.every(payment => payment.status === 'paid'), true)
  assert.equal(allPaid.paidCount, 3)
  assert.equal(allPaid.status, 'completed')
  assert.equal(allPaid.completedAt, processedAt)

  const oldPaid = { ...item, payments: item.payments.map(payment => payment.id === 'p1' ? { ...payment, status: 'paid', paidAt: processedAt } : payment) }
  assert.deepEqual(overdue.overduePaymentRows([oldPaid], '2026-07-23').map(row => row.payment.id), ['p2'])

  console.log('overdue verification passed')
} finally {
  await server.close()
}

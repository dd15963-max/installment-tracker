import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
  const utils = await server.ssrLoadModule('/src/utils.ts')
  const storage = await server.ssrLoadModule('/src/storage.ts')

  const basePayment = { id: 'p1', sequence: 1, scheduledDate: '2026-07-22', amount: 1000, status: 'scheduled' }
  assert.equal(utils.paymentDisplayStatus(basePayment, '2026-07-22'), 'today')
  assert.equal(utils.paymentDisplayStatus({ ...basePayment, scheduledDate: '2026-07-21' }, '2026-07-22'), 'overdue')
  assert.equal(utils.paymentDisplayStatus({ ...basePayment, scheduledDate: '2026-07-23' }, '2026-07-22'), 'upcoming')
  assert.equal(utils.paymentDisplayStatus({ ...basePayment, status: 'paid' }, '2026-07-22'), 'paid')

  const shares = utils.splitShares(1001, ['나', '참여자'])
  assert.equal(shares.reduce((sum, share) => sum + share.amount, 0), 1001)
  assert.equal(shares[0].amount, 501)
  assert.equal(shares[1].amount, 500)

  const existing = {
    id: 'item-1',
    title: '기존 할부',
    totalAmount: 3000,
    installmentMonths: 3,
    firstPaymentDate: '2026-05-15',
    paymentMethod: '카드',
    merchant: '구매처',
    category: '기타',
    memo: '',
    splitPayment: false,
    splitParticipants: [],
    paidCount: 1,
    status: 'active',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    payments: [
      { id: 'pay-1', sequence: 1, scheduledDate: '2026-05-15', amount: 1000, status: 'paid', paidAt: '2026-05-15T02:00:00.000Z' },
      { id: 'pay-2', sequence: 2, scheduledDate: '2026-06-15', amount: 1000, status: 'scheduled' },
      { id: 'pay-3', sequence: 3, scheduledDate: '2026-07-15', amount: 1000, status: 'scheduled' },
    ],
  }
  const metadataForm = {
    title: '이름만 변경',
    totalAmount: '3000',
    installmentMonths: '3',
    firstPaymentDate: '2026-05-15',
    paymentMethod: '새 카드',
    merchant: '구매처',
    category: '기타',
    memo: '메모',
    paidCount: '1',
    splitPayment: false,
    splitParticipants: [],
  }
  const metadataUpdated = utils.itemFromForm(metadataForm, existing)
  assert.deepEqual(metadataUpdated.payments, existing.payments)
  assert.equal(metadataUpdated.payments[0].paidAt, existing.payments[0].paidAt)

  const scheduleUpdated = utils.itemFromForm({ ...metadataForm, firstPaymentDate: '2026-05-20' }, existing)
  assert.equal(scheduleUpdated.payments[0].scheduledDate, '2026-05-20')
  assert.equal(scheduleUpdated.payments[0].paidAt, existing.payments[0].paidAt)

  const backupText = await readFile(new URL('../installment-tracker-import-2026-07-21.json', import.meta.url), 'utf8')
  const backup = storage.parseBackup(backupText)
  assert.ok(backup.version >= 1 && backup.version <= 3)
  assert.ok(Array.isArray(backup.items))
  assert.ok(Array.isArray(backup.recurringExpenses))

  const legacy = storage.parseBackup(JSON.stringify([existing]))
  assert.equal(legacy.version, 1)
  assert.equal(legacy.items.length, 1)
  assert.throws(() => storage.parseBackup(JSON.stringify({ version: 3, items: [{ title: '' }] })))

  console.log('stage1 verification passed')
} finally {
  await server.close()
}

import type { InstallmentItem } from './types'
import { createPayments } from './utils'

const make = (title: string, total: number, months: number, date: string, paid: number, paymentMethod: string, category: string): InstallmentItem => ({
  id: crypto.randomUUID(), title, totalAmount: total, installmentMonths: months, firstPaymentDate: date,
  paymentMethod, merchant: '', category, memo: '', splitPayment: false, splitParticipants: [], paidCount: paid, status: paid === months ? 'completed' : 'active', isSample: true,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), payments: createPayments(total, months, date, paid),
})

export const sampleItems = () => [
  make('갤럭시 탭 S11 Ultra', 999000, 12, '2026-02-25', 5, '삼성카드', '전자기기'),
  make('거실 소파', 720000, 6, '2026-05-12', 2, '현대카드', '가구'),
  make('제주도 항공권', 360000, 3, '2026-06-21', 1, '신한카드', '여행'),
]


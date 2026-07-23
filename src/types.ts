export type PaymentStatus = 'scheduled' | 'paid'
export type ItemStatus = 'active' | 'completed'

export interface InstallmentPayment {
  id: string
  sequence: number
  scheduledDate: string
  amount: number
  status: PaymentStatus
  paidAt?: string
}

export interface InstallmentItem {
  id: string
  title: string
  totalAmount: number
  installmentMonths: number
  firstPaymentDate: string
  paymentMethod: string
  merchant: string
  category: string
  memo: string
  splitPayment: boolean
  splitParticipants: string[]
  paidCount: number
  status: ItemStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  isSample?: boolean
  payments: InstallmentPayment[]
}

export interface ItemFormData {
  title: string
  totalAmount: string
  installmentMonths: string
  firstPaymentDate: string
  paymentMethod: string
  merchant: string
  category: string
  memo: string
  paidCount: string
  splitPayment: boolean
  splitParticipants: string[]
}

export interface RecurringActivePeriod {
  startMonth: string
  endMonth: string | null
}

export interface RecurringExpense {
  id: string
  title: string
  amount: number
  paymentDay: number
  paymentMethod: string
  category: string
  memo: string
  repeatType: 'monthly'
  enabled: boolean
  splitPayment: boolean
  splitParticipants: string[]
  activePeriods: RecurringActivePeriod[]
  createdAt: string
  updatedAt: string
}

export interface RecurringExpenseFormData {
  title: string
  amount: string
  paymentDay: string
  paymentMethod: string
  category: string
  memo: string
  enabled: boolean
  splitPayment: boolean
  splitParticipants: string[]
  startMonth: string
}

export type Tab = 'home' | 'list' | 'recurring' | 'stats' | 'settings'


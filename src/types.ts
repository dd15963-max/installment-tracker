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
  paidCount: number
  status: ItemStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
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
}

export type Tab = 'home' | 'list' | 'stats' | 'settings'

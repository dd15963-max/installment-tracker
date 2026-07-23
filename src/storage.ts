import type { InstallmentItem, InstallmentPayment, RecurringActivePeriod, RecurringExpense } from './types'
import { monthKey } from './utils'

export const DATA_KEY = 'installment-tracker-data'
export const RECURRING_KEY = 'recurring-expenses'
export const SETTINGS_KEY = 'installment-tracker-settings'
export const BACKUP_META_KEY = 'expense-note-backup-meta-v1'
export const ONBOARDING_KEY = 'expense-note-onboarding-v1'

export interface BackupSettings {
  dark?: boolean
  splitNames?: string[]
}

export interface ParsedBackup {
  version: number
  exportedAt: string | null
  items: InstallmentItem[]
  recurringExpenses: RecurringExpense[]
  settings: BackupSettings
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const stringValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())

function migratePayment(value: unknown, index: number): InstallmentPayment {
  if (!record(value)) throw new Error(`${index + 1}번째 납부 회차 형식이 올바르지 않습니다.`)
  const sequence = Number(value.sequence)
  const amount = Number(value.amount)
  if (!Number.isInteger(sequence) || sequence < 1 || !validDate(value.scheduledDate) || !Number.isFinite(amount) || amount < 0 || !['paid', 'scheduled'].includes(String(value.status))) {
    throw new Error(`${index + 1}번째 납부 회차에 잘못된 값이 있습니다.`)
  }
  return {
    id: stringValue(value.id) || crypto.randomUUID(),
    sequence,
    scheduledDate: String(value.scheduledDate),
    amount,
    status: value.status as 'paid' | 'scheduled',
    ...(typeof value.paidAt === 'string' ? { paidAt: value.paidAt } : {}),
  }
}

function migrateItem(value: unknown, index: number): InstallmentItem {
  if (!record(value)) throw new Error(`${index + 1}번째 할부 항목 형식이 올바르지 않습니다.`)
  const title = stringValue(value.title).trim()
  const totalAmount = Number(value.totalAmount)
  const installmentMonths = Number(value.installmentMonths)
  if (!title || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(installmentMonths) || installmentMonths < 1 || installmentMonths > 120 || !validDate(value.firstPaymentDate) || !Array.isArray(value.payments)) {
    throw new Error(`${index + 1}번째 할부 항목의 필수 값이 올바르지 않습니다.`)
  }
  const payments = value.payments.map(migratePayment)
  if (payments.length !== installmentMonths || payments.reduce((sum, payment) => sum + payment.amount, 0) !== totalAmount) {
    throw new Error(`${index + 1}번째 할부 항목의 회차 합계가 총액과 일치하지 않습니다.`)
  }
  const paidCount = payments.filter(payment => payment.status === 'paid').length
  const splitParticipants = Array.isArray(value.splitParticipants) ? value.splitParticipants.filter(name => typeof name === 'string').map(String) : []
  const splitPayment = value.splitPayment === true && splitParticipants.length >= 2
  return {
    id: stringValue(value.id) || crypto.randomUUID(),
    title,
    totalAmount,
    installmentMonths,
    firstPaymentDate: String(value.firstPaymentDate),
    paymentMethod: stringValue(value.paymentMethod),
    merchant: stringValue(value.merchant),
    category: stringValue(value.category, '기타'),
    memo: stringValue(value.memo),
    splitPayment,
    splitParticipants: splitPayment ? splitParticipants : [],
    paidCount,
    status: paidCount === installmentMonths ? 'completed' : 'active',
    createdAt: stringValue(value.createdAt, new Date().toISOString()),
    updatedAt: stringValue(value.updatedAt, new Date().toISOString()),
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    ...(value.isSample === true ? { isSample: true } : {}),
    payments,
  }
}

function migratePeriods(value: unknown, enabled: boolean, createdAt: string, updatedAt: string): RecurringActivePeriod[] {
  const stored = Array.isArray(value) ? value.filter(record).flatMap(period => {
    const startMonth = stringValue(period.startMonth)
    const endMonth = period.endMonth === null ? null : stringValue(period.endMonth)
    return /^\d{4}-\d{2}$/.test(startMonth) && (endMonth === null || /^\d{4}-\d{2}$/.test(endMonth)) ? [{ startMonth, endMonth }] : []
  }) : []
  if (stored.length) return stored.sort((a, b) => a.startMonth.localeCompare(b.startMonth))
  const startMonth = /^\d{4}-\d{2}/.test(createdAt) ? createdAt.slice(0, 7) : monthKey()
  const endMonth = /^\d{4}-\d{2}/.test(updatedAt) ? updatedAt.slice(0, 7) : startMonth
  return [{ startMonth, endMonth: enabled ? null : endMonth }]
}

function migrateRecurring(value: unknown, index: number): RecurringExpense {
  if (!record(value)) throw new Error(`${index + 1}번째 고정지출 형식이 올바르지 않습니다.`)
  const title = stringValue(value.title).trim()
  const amount = Number(value.amount)
  const paymentDay = Number(value.paymentDay)
  if (!title || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
    throw new Error(`${index + 1}번째 고정지출의 필수 값이 올바르지 않습니다.`)
  }
  const createdAt = stringValue(value.createdAt, new Date().toISOString())
  const updatedAt = stringValue(value.updatedAt, createdAt)
  const periods = migratePeriods(value.activePeriods, value.enabled !== false, createdAt, updatedAt)
  const splitParticipants = Array.isArray(value.splitParticipants) ? value.splitParticipants.filter(name => typeof name === 'string').map(String) : []
  const splitPayment = value.splitPayment === true && splitParticipants.length >= 2
  return {
    id: stringValue(value.id) || crypto.randomUUID(),
    title,
    amount,
    paymentDay,
    paymentMethod: stringValue(value.paymentMethod),
    category: stringValue(value.category, '기타'),
    memo: stringValue(value.memo),
    repeatType: 'monthly',
    enabled: periods.some(period => period.endMonth === null),
    splitPayment,
    splitParticipants: splitPayment ? splitParticipants : [],
    activePeriods: periods,
    createdAt,
    updatedAt,
  }
}

export function normalizeItems(value: unknown): InstallmentItem[] {
  if (!Array.isArray(value)) throw new Error('할부 목록이 배열 형식이 아닙니다.')
  return value.map(migrateItem)
}

export function normalizeRecurringExpenses(value: unknown): RecurringExpense[] {
  if (!Array.isArray(value)) throw new Error('고정지출 목록이 배열 형식이 아닙니다.')
  return value.map(migrateRecurring)
}

export function parseBackup(text: string): ParsedBackup {
  const parsed: unknown = JSON.parse(text)
  if (Array.isArray(parsed)) return { version: 1, exportedAt: null, items: normalizeItems(parsed), recurringExpenses: [], settings: {} }
  if (!record(parsed)) throw new Error('백업 파일의 최상위 형식이 올바르지 않습니다.')
  const version = Number(parsed.version || 3)
  if (!Number.isInteger(version) || version < 1 || version > 3) throw new Error('지원하지 않는 백업 버전입니다.')
  const settings = record(parsed.settings) ? {
    ...(typeof parsed.settings.dark === 'boolean' ? { dark: parsed.settings.dark } : {}),
    ...(Array.isArray(parsed.settings.splitNames) ? { splitNames: parsed.settings.splitNames.filter(name => typeof name === 'string').map(String) } : {}),
  } : {}
  return {
    version,
    exportedAt: typeof parsed.exportedAt === 'string' && !Number.isNaN(Date.parse(parsed.exportedAt)) ? parsed.exportedAt : null,
    items: normalizeItems(parsed.items),
    recurringExpenses: parsed.recurringExpenses === undefined ? [] : normalizeRecurringExpenses(parsed.recurringExpenses),
    settings,
  }
}

export function loadStoredItems(): InstallmentItem[] {
  const stored = localStorage.getItem(DATA_KEY)
  if (!stored) return []
  try { return normalizeItems(JSON.parse(stored)) } catch { return [] }
}

export function loadStoredRecurring(): RecurringExpense[] {
  const stored = localStorage.getItem(RECURRING_KEY)
  if (!stored) return []
  try { return normalizeRecurringExpenses(JSON.parse(stored)) } catch { return [] }
}

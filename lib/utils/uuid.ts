/**
 * UUID and data sanitization utilities.
 *
 * Moved from lib/supabase/utils.ts during Prisma migration.
 */
import { OrganizationId, ClientCompanyId } from '@/types'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value || value.trim() === '') return false
  return UUID_REGEX.test(value)
}

export function sanitizeUUID(value: string | undefined | null): string | null {
  if (!value || value === '' || value.trim() === '') return null
  if (!isValidUUID(value)) {
    console.warn(`[sanitizeUUID] UUID invalido descartado: "${value}"`)
    return null
  }
  return value
}

export function sanitizeUUIDs<T extends Record<string, unknown>>(
  obj: T,
  uuidFields: (keyof T)[]
): T {
  const result = { ...obj }
  for (const field of uuidFields) {
    const value = obj[field]
    if (value !== undefined) {
      (result as Record<string, unknown>)[field as string] = sanitizeUUID(value as string)
    }
  }
  return result
}

export function requireUUID(value: string | undefined | null, fieldName: string): string {
  const sanitized = sanitizeUUID(value)
  if (!sanitized) {
    throw new Error(`${fieldName} e obrigatorio e deve ser um UUID valido`)
  }
  return sanitized
}

export function sanitizeOrganizationId(value: string | undefined | null): OrganizationId | null {
  return sanitizeUUID(value) as OrganizationId | null
}

export function requireOrganizationId(value: string | undefined | null): OrganizationId {
  return (sanitizeUUID(value) || '') as OrganizationId
}

export function sanitizeClientCompanyId(value: string | undefined | null): ClientCompanyId | null {
  return sanitizeUUID(value) as ClientCompanyId | null
}

export function sanitizeText(value: string | undefined | null): string | null {
  if (!value || value.trim() === '') return null
  return value.trim()
}

export function sanitizeNumber(value: unknown, defaultValue = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) return parsed
  }
  return defaultValue
}

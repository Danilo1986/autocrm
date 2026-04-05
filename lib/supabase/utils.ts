// Migration shim - re-exports from lib/utils/uuid.ts
export {
  isValidUUID,
  sanitizeUUID,
  sanitizeUUIDs,
  requireUUID,
  sanitizeOrganizationId,
  requireOrganizationId,
  sanitizeClientCompanyId,
  sanitizeText,
  sanitizeNumber,
} from '../utils/uuid'

/** @deprecated Use getCurrentOrganizationId from lib/services/auth-check */
export const getCurrentUserOrganizationId = async (): Promise<string | null> => null

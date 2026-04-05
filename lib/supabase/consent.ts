// Migration shim - re-exports from Prisma service
export {
  getUserConsents,
  hasConsent,
  grantConsent,
  revokeConsent,
  getConsentText,
  CONSENT_VERSION,
  CONSENT_VERSIONS,
} from '../services/consent'
export type { ConsentType } from '../services/consent'

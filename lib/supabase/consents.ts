/**
 * Consent Management Service - Migration Shim
 * T048: Allow users to revoke AI consent
 *
 * LGPD Compliant - Art. 8o §5 (revogacao de consentimento)
 *
 * Re-exports from Prisma-based consent service.
 */

export type { ConsentType } from '../services/consent'
export { CONSENT_VERSION, CONSENT_VERSIONS } from '../services/consent'

/**
 * Legacy UserConsent interface for backwards compatibility.
 * Maps to the Prisma UserConsent model shape.
 */
export interface UserConsent {
  id: string;
  user_id: string;
  version: string;
  terms_accepted: boolean;
  privacy_accepted: boolean;
  ai_data_sharing: boolean;
  marketing_emails: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  revoked_at: string | null;
}

/**
 * Legacy consentsService shim.
 *
 * Client-side code should use fetch('/api/consent/...') instead.
 * Server-side code should import from '@/lib/services/consent' directly.
 */
export const consentsService = {
  async getCurrentConsent(): Promise<{ data: UserConsent | null; error: Error | null }> {
    return { data: null, error: null };
  },

  async giveConsent(_consent: {
    version: string;
    termsAccepted: boolean;
    privacyAccepted: boolean;
    aiDataSharing: boolean;
    marketingEmails: boolean;
  }): Promise<{ data: UserConsent | null; error: Error | null }> {
    return { data: null, error: new Error('Use API route or Prisma service directly') };
  },

  async revokeAIConsent(): Promise<{ error: Error | null }> {
    return { error: new Error('Use API route or Prisma service directly') };
  },

  async revokeAllConsent(): Promise<{ error: Error | null }> {
    return { error: new Error('Use API route or Prisma service directly') };
  },

  async hasConsent(_type: 'terms' | 'privacy' | 'ai' | 'marketing'): Promise<boolean> {
    return false;
  },

  async getConsentHistory(): Promise<{ data: UserConsent[] | null; error: Error | null }> {
    return { data: null, error: null };
  },
};

export default consentsService;

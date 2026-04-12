/**
 * Client-safe Consent Service (LGPD)
 *
 * Uses fetch API to call server endpoints - no Prisma import.
 */

export type ConsentType = 'terms' | 'privacy' | 'marketing' | 'analytics' | 'data_processing' | 'AI_CONSENT'

export interface UserConsent {
  id: string
  user_id: string
  consent_type: ConsentType
  version: string
  consented_at: string
  ip_address: string | null
  user_agent: string | null
  revoked_at: string | null
}

export interface ConsentRecord {
  type: ConsentType
  version: string
  consented: boolean
  consentedAt?: string
}

export const CONSENT_VERSIONS: Record<ConsentType, string> = {
  terms: '1.0.0',
  privacy: '1.0.0',
  marketing: '1.0.0',
  analytics: '1.0.0',
  data_processing: '1.0.0',
  AI_CONSENT: '1.0.0',
}

export const REQUIRED_CONSENTS: ConsentType[] = ['terms', 'privacy', 'data_processing']
export const OPTIONAL_CONSENTS: ConsentType[] = ['marketing', 'analytics']

class ConsentService {
  private userId: string | null = null

  setUserId(userId: string) {
    this.userId = userId
  }

  async getUserConsents(): Promise<UserConsent[]> {
    try {
      const res = await fetch('/api/internal/consents', { credentials: 'include' })
      if (!res.ok) return []
      const { data } = await res.json()
      return data || []
    } catch {
      return []
    }
  }

  async hasRequiredConsents(): Promise<boolean> {
    const consents = await this.getUserConsents()
    return REQUIRED_CONSENTS.every((type) => {
      const c = consents.find((x: UserConsent) => x.consent_type === type)
      return c && c.version === CONSENT_VERSIONS[type]
    })
  }

  async getMissingConsents(): Promise<ConsentType[]> {
    const consents = await this.getUserConsents()
    return REQUIRED_CONSENTS.filter((type) => {
      const c = consents.find((x: UserConsent) => x.consent_type === type)
      return !c || c.version !== CONSENT_VERSIONS[type]
    })
  }

  async giveConsent(type: ConsentType): Promise<boolean> {
    try {
      const res = await fetch('/api/internal/consents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant', type }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async giveConsents(types: ConsentType[]): Promise<boolean> {
    const results = await Promise.all(types.map((t) => this.giveConsent(t)))
    return results.every(Boolean)
  }

  async revokeConsent(type: ConsentType): Promise<boolean> {
    try {
      const res = await fetch('/api/internal/consents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', type }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async getConsentStatus(): Promise<Record<ConsentType, ConsentRecord>> {
    const consents = await this.getUserConsents()
    const allTypes: ConsentType[] = [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS]
    return allTypes.reduce((acc, type) => {
      const c = consents.find((x: UserConsent) => x.consent_type === type)
      acc[type] = {
        type,
        version: CONSENT_VERSIONS[type],
        consented: c?.version === CONSENT_VERSIONS[type],
        consentedAt: c?.consented_at,
      }
      return acc
    }, {} as Record<ConsentType, ConsentRecord>)
  }

  async exportConsentHistory(): Promise<UserConsent[]> {
    return this.getUserConsents()
  }
}

export const consentService = new ConsentService()

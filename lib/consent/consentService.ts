/**
 * @fileoverview Serviço de gerenciamento de consentimentos LGPD.
 *
 * Este módulo gerencia os consentimentos do usuário para compliance com a LGPD
 * (Lei Geral de Proteção de Dados). Suporta múltiplos tipos de consentimento,
 * versionamento, revogação e exportação de histórico.
 *
 * Now backed by Prisma instead of Supabase.
 *
 * @module services/consentService
 * @see {@link https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm LGPD}
 */

import {
  getUserConsents as prismaGetConsents,
  grantConsent as prismaGrantConsent,
  revokeConsent as prismaRevokeConsent,
  CONSENT_VERSIONS as PRISMA_CONSENT_VERSIONS,
  type ConsentType,
} from '@/lib/services/consent';

export type { ConsentType };

/**
 * Registro de consentimento do usuário no banco de dados.
 */
export interface UserConsent {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  version: string;
  consented_at: string;
  ip_address: string | null;
  user_agent: string | null;
  revoked_at: string | null;
}

/**
 * Registro simplificado de status de consentimento.
 */
export interface ConsentRecord {
  type: ConsentType;
  version: string;
  consented: boolean;
  consentedAt?: string;
}

export const CONSENT_VERSIONS: Record<ConsentType, string> = {
  terms: '1.0.0',
  privacy: '1.0.0',
  marketing: '1.0.0',
  analytics: '1.0.0',
  data_processing: '1.0.0',
  AI_CONSENT: '1.0.0',
};

export const REQUIRED_CONSENTS: ConsentType[] = ['terms', 'privacy', 'data_processing'];
export const OPTIONAL_CONSENTS: ConsentType[] = ['marketing', 'analytics'];

/**
 * Serviço de gerenciamento de consentimentos LGPD.
 *
 * NOTE: This service requires a userId. In client components, use API routes.
 * In server components/routes, pass the userId from the session.
 */
class ConsentService {
  private userId: string | null = null;

  setUserId(userId: string) {
    this.userId = userId;
  }

  async getUserConsents(): Promise<UserConsent[]> {
    if (!this.userId) {
      console.error('ConsentService: No userId set');
      return [];
    }
    const consents = await prismaGetConsents(this.userId);
    return consents.map(c => ({
      id: c.id,
      user_id: c.userId,
      consent_type: c.consentType as ConsentType,
      version: c.version,
      consented_at: c.consentedAt?.toISOString?.() ?? (c as any).consentedAt ?? '',
      ip_address: c.ipAddress ?? null,
      user_agent: c.userAgent ?? null,
      revoked_at: c.revokedAt?.toISOString?.() ?? null,
    }));
  }

  async hasRequiredConsents(): Promise<boolean> {
    const consents = await this.getUserConsents();
    return REQUIRED_CONSENTS.every((requiredType) => {
      const consent = consents.find(c => c.consent_type === requiredType);
      if (!consent) return false;
      return consent.version === CONSENT_VERSIONS[requiredType];
    });
  }

  async getMissingConsents(): Promise<ConsentType[]> {
    const consents = await this.getUserConsents();
    return REQUIRED_CONSENTS.filter((requiredType) => {
      const consent = consents.find(c => c.consent_type === requiredType);
      if (!consent) return true;
      return consent.version !== CONSENT_VERSIONS[requiredType];
    });
  }

  async giveConsent(
    type: ConsentType,
    options?: { ipAddress?: string; userAgent?: string }
  ): Promise<boolean> {
    if (!this.userId) {
      console.error('ConsentService: No userId set');
      return false;
    }
    return prismaGrantConsent(this.userId, type, {
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });
  }

  async giveConsents(
    types: ConsentType[],
    options?: { ipAddress?: string; userAgent?: string }
  ): Promise<boolean> {
    const results = await Promise.all(
      types.map(type => this.giveConsent(type, options))
    );
    return results.every(r => r);
  }

  async revokeConsent(type: ConsentType): Promise<boolean> {
    if (!this.userId) {
      console.error('ConsentService: No userId set');
      return false;
    }
    return prismaRevokeConsent(this.userId, type);
  }

  async getConsentStatus(): Promise<Record<ConsentType, ConsentRecord>> {
    const consents = await this.getUserConsents();
    const allTypes: ConsentType[] = [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS];
    return allTypes.reduce((acc, type) => {
      const consent = consents.find(c => c.consent_type === type);
      acc[type] = {
        type,
        version: CONSENT_VERSIONS[type],
        consented: consent?.version === CONSENT_VERSIONS[type],
        consentedAt: consent?.consented_at,
      };
      return acc;
    }, {} as Record<ConsentType, ConsentRecord>);
  }

  async exportConsentHistory(): Promise<UserConsent[]> {
    // For full history including revoked, we need the userId
    return this.getUserConsents();
  }
}

export const consentService = new ConsentService();

import { prisma } from '@/lib/db/prisma'

export type ConsentType = 'AI_CONSENT' | 'terms' | 'privacy' | 'marketing' | 'analytics' | 'data_processing'

export const CONSENT_VERSION = '1.0'

export const CONSENT_VERSIONS: Record<string, string> = {
  AI_CONSENT: '1.0',
  terms: '1.0',
  privacy: '1.0',
}

export async function getUserConsents(userId: string) {
  const data = await prisma.userConsent.findMany({
    where: { userId, revokedAt: null },
  })
  return data
}

export async function hasConsent(userId: string, type: ConsentType): Promise<boolean> {
  const consent = await prisma.userConsent.findFirst({
    where: { userId, consentType: type, revokedAt: null },
  })
  return !!consent
}

export async function grantConsent(userId: string, type: ConsentType, meta?: { ipAddress?: string; userAgent?: string }) {
  try {
    // Check if already consented
    const existing = await prisma.userConsent.findFirst({
      where: { userId, consentType: type, revokedAt: null },
    })
    if (existing) return true

    await prisma.userConsent.create({
      data: {
        userId,
        consentType: type,
        version: CONSENT_VERSIONS[type] ?? CONSENT_VERSION,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    })

    // Log audit event (best-effort)
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'consent.granted',
          resourceType: 'user_consent',
          details: { consent_type: type },
          severity: 'info',
        },
      })
    } catch {
      // Non-critical
    }

    return true
  } catch {
    return false
  }
}

export async function revokeConsent(userId: string, type: ConsentType) {
  try {
    await prisma.userConsent.updateMany({
      where: { userId, consentType: type, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'consent.revoked',
          resourceType: 'user_consent',
          details: { consent_type: type },
          severity: 'info',
        },
      })
    } catch {
      // Non-critical
    }

    return true
  } catch {
    return false
  }
}

export function getConsentText() {
  return {
    title: 'Consentimento para Uso de IA',
    description:
      'Para utilizar as funcionalidades de inteligencia artificial, precisamos do seu consentimento para processar dados do CRM (contatos, negocios, atividades) com provedores de IA externos. Seus dados serao usados apenas para gerar insights e sugestoes dentro do sistema.',
    version: CONSENT_VERSION,
  }
}

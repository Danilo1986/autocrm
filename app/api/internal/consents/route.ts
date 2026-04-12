import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const consents = await prisma.userConsent.findMany({
    where: { userId: session.user.id, revokedAt: null },
  })

  const data = consents.map((c) => ({
    id: c.id,
    user_id: c.userId,
    consent_type: c.consentType,
    version: c.version,
    consented_at: c.consentedAt.toISOString(),
    ip_address: c.ipAddress,
    user_agent: c.userAgent,
    revoked_at: c.revokedAt?.toISOString() ?? null,
  }))

  return Response.json({ data })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.type) return Response.json({ error: 'Missing type' }, { status: 400 })

  const userId = session.user.id

  if (body.action === 'grant') {
    const existing = await prisma.userConsent.findFirst({
      where: { userId, consentType: body.type, revokedAt: null },
    })
    if (!existing) {
      await prisma.userConsent.create({
        data: { userId, consentType: body.type, version: '1.0.0' },
      })
    }
    return Response.json({ ok: true })
  }

  if (body.action === 'revoke') {
    await prisma.userConsent.updateMany({
      where: { userId, consentType: body.type, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 })
}

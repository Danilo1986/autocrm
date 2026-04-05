import { prisma } from '@/lib/db/prisma'

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) return json({ valid: false, error: 'Missing token' }, 400)

  const normalizedToken = token.trim()

  const invite = await prisma.organizationInvite.findFirst({
    where: { token: normalizedToken, usedAt: null },
    select: { token: true, email: true, role: true, expiresAt: true },
  })

  if (!invite) {
    // Check if token exists but was already used or expired
    const usedInvite = await prisma.organizationInvite.findFirst({
      where: { token: normalizedToken },
      select: { usedAt: true, expiresAt: true },
    })

    if (usedInvite) {
      if (usedInvite.usedAt) {
        return json({ valid: false, error: 'Este convite ja foi utilizado' }, 400)
      }
      if (usedInvite.expiresAt && usedInvite.expiresAt < new Date()) {
        return json({ valid: false, error: 'Este convite expirou' }, 400)
      }
    }

    return json({ valid: false, error: 'Convite nao encontrado' }, 404)
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return json({ valid: false, error: 'Este convite expirou' }, 400)
  }

  return json({
    valid: true,
    invite: {
      email: invite.email,
      role: invite.role,
      expires_at: invite.expiresAt?.toISOString() ?? null,
    },
  })
}

import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { hashPassword } from '@/lib/auth/password'
import { isAllowedOrigin } from '@/lib/security/sameOrigin'

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

const AcceptInviteSchema = z
  .object({
    token: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1).max(200).optional(),
  })
  .strict()

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const raw = await req.json().catch(() => null)
  const parsed = AcceptInviteSchema.safeParse(raw)
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400)
  }

  const { token, email, password, name } = parsed.data

  // Find valid invite
  const invite = await prisma.organizationInvite.findFirst({
    where: {
      token,
      usedAt: null,
    },
    select: {
      id: true,
      token: true,
      email: true,
      role: true,
      expiresAt: true,
      organizationId: true,
    },
  })

  if (!invite) {
    return json({ error: 'Convite invalido ou ja foi utilizado' }, 400)
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return json({ error: 'Convite expirado' }, 400)
  }

  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return json({ error: 'Este convite nao e valido para este email' }, 400)
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return json({ error: 'Ja existe um usuario com este email' }, 400)
  }

  const hashedPassword = await hashPassword(password)
  const displayName = name || email.split('@')[0]

  try {
    // Create user, profile, and user_settings in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name: displayName,
          password: hashedPassword,
          emailVerified: new Date(),
        },
      })

      await tx.profile.create({
        data: {
          id: newUser.id,
          email,
          name: displayName,
          firstName: displayName,
          organizationId: invite.organizationId,
          role: invite.role,
        },
      })

      await tx.userSettings.create({
        data: { userId: newUser.id },
      })

      // Mark invite as used
      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      })

      return newUser
    })

    return json({ ok: true, user: { id: user.id, email: user.email } })
  } catch (err: any) {
    console.error('[invites/accept] Error creating user:', err)
    return json({ error: err.message || 'Erro ao criar usuario' }, 400)
  }
}

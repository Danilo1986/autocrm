import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { hashPassword } from '@/lib/auth/password'

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

const SetupSchema = z.object({
  organizationName: z.string().min(1).max(200),
  adminName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
})

/**
 * POST /api/setup
 * Creates the first organization and admin user.
 * Only works if no organization exists yet.
 */
export async function POST(req: Request) {
  // Check if already initialized
  const orgCount = await prisma.organization.count()
  if (orgCount > 0) {
    return json({ error: 'Instancia ja foi inicializada' }, 400)
  }

  const raw = await req.json().catch(() => null)
  const parsed = SetupSchema.safeParse(raw)
  if (!parsed.success) {
    return json({ error: 'Dados invalidos', details: parsed.error.flatten() }, 400)
  }

  const { organizationName, adminName, adminEmail, adminPassword } = parsed.data

  const hashedPassword = await hashPassword(adminPassword)

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create organization
      const org = await tx.organization.create({
        data: { name: organizationName },
      })

      // 2. Create organization settings
      await tx.organizationSettings.create({
        data: { organizationId: org.id },
      })

      // 3. Create user (NextAuth)
      const user = await tx.user.create({
        data: {
          email: adminEmail,
          name: adminName,
          password: hashedPassword,
          emailVerified: new Date(),
        },
      })

      // 4. Create profile (admin role)
      await tx.profile.create({
        data: {
          id: user.id,
          email: adminEmail,
          name: adminName,
          firstName: adminName,
          role: 'admin',
          organizationId: org.id,
        },
      })

      // 5. Create user settings
      await tx.userSettings.create({
        data: { userId: user.id },
      })

      return { org, user }
    })

    return json({
      ok: true,
      organization: { id: result.org.id, name: result.org.name },
      user: { id: result.user.id, email: result.user.email },
    })
  } catch (err: any) {
    console.error('[setup] Error:', err)
    return json({ error: err.message || 'Erro ao criar instancia' }, 500)
  }
}

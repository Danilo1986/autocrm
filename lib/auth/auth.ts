import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { PrismaClient } from '@prisma/client'
import { verifyPassword } from './password'

// Use a raw PrismaClient for the adapter (no extensions)
const prisma = new PrismaClient()

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const password = credentials.password as string

        const user = await prisma.user.findUnique({
          where: { email },
          include: { profile: true },
        })

        if (!user || !user.password) {
          return null
        }

        const isValid = await verifyPassword(password, user.password)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }

      // Enrich token with profile data (role, organizationId)
      if (token.id && !token.role) {
        const profile = await prisma.profile.findUnique({
          where: { id: token.id as string },
          select: { role: true, organizationId: true, firstName: true, lastName: true },
        })
        if (profile) {
          token.role = profile.role
          token.organizationId = profile.organizationId
          token.firstName = profile.firstName
          token.lastName = profile.lastName
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.organizationId = token.organizationId as string | null
        session.user.firstName = token.firstName as string | null
        session.user.lastName = token.lastName as string | null
      }
      return session
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-create profile and user_settings when a new user is created
      // This replaces the Supabase trigger handle_new_user
      if (!user.id) return

      const org = await prisma.organization.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })

      if (org) {
        await prisma.profile.upsert({
          where: { id: user.id },
          update: {},
          create: {
            id: user.id,
            email: user.email,
            name: user.name || user.email?.split('@')[0],
            role: 'user',
            organizationId: org.id,
          },
        })

        await prisma.userSettings.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id },
        })
      }
    },
  },
})

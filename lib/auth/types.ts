import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string | null
      name: string | null
      image: string | null
      role: string
      organizationId: string | null
      firstName: string | null
      lastName: string | null
    }
  }

  interface User {
    role?: string
    organizationId?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    organizationId?: string | null
    firstName?: string | null
    lastName?: string | null
  }
}

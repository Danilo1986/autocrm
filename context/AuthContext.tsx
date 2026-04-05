/**
 * @fileoverview Contexto de Autenticação (NextAuth)
 *
 * Provider React que gerencia autenticação via NextAuth e perfil do usuário.
 * Fornece sessão, usuário, perfil e organizationId para toda a aplicação.
 *
 * Mantém a mesma interface pública do provider anterior (Supabase).
 *
 * @module context/AuthContext
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react'
import type { OrganizationId } from '../types'

interface Profile {
  id: string
  email: string
  organization_id: OrganizationId
  role: 'admin' | 'vendedor'
  first_name?: string | null
  last_name?: string | null
  nickname?: string | null
  phone?: string | null
  avatar_url?: string | null
  created_at?: string
}

interface AuthContextType {
  session: any | null
  user: { id: string; email: string } | null
  profile: Profile | null
  organizationId: OrganizationId | null
  loading: boolean
  isInitialized: boolean | null
  checkInitialization: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: session, status } = useSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)

  const loading = status === 'loading' || (status === 'authenticated' && !profileLoaded)

  const checkInitialization = useCallback(async () => {
    try {
      const res = await fetch('/api/installer/check-initialized')
      const data = await res.json()
      setIsInitialized(data.initialized ?? true)
    } catch {
      setIsInitialized(true)
    }
  }, [])

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/me')
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
      } else {
        setProfile(null)
      }
    } catch {
      setProfile(null)
    } finally {
      setProfileLoaded(true)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await fetchProfile()
    }
  }, [session?.user, fetchProfile])

  useEffect(() => {
    checkInitialization()
  }, [checkInitialization])

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      fetchProfile()
    } else if (status === 'unauthenticated') {
      setProfile(null)
      setProfileLoaded(true)
    }
  }, [status, session?.user, fetchProfile])

  const handleSignOut = useCallback(async () => {
    await nextAuthSignOut({ redirectTo: '/login' })
    setProfile(null)
  }, [])

  const user = session?.user
    ? { id: session.user.id, email: session.user.email ?? '' }
    : null

  const value: AuthContextType = {
    session,
    user,
    profile,
    organizationId: profile?.organization_id ?? null,
    loading,
    isInitialized,
    checkInitialization,
    signOut: handleSignOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

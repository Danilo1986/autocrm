import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

type MockUser = { id: string; email: string; role: string; organizationId: string | null }

const mocks = vi.hoisted(() => {
  const state = {
    currentUser: null as MockUser | null,
    orgCount: 1, // instance initialized by default
  }

  const nextResponseMock = {
    next: vi.fn((init?: unknown) => ({
      kind: 'next',
      init,
      cookies: { set: vi.fn() },
    })),
    redirect: vi.fn((url: unknown) => ({
      kind: 'redirect',
      url,
    })),
  }

  return { state, nextResponseMock }
})

vi.mock('next/server', () => ({
  NextResponse: mocks.nextResponseMock,
}))

vi.mock('@/lib/auth/auth', () => ({
  auth: vi.fn(async () => {
    if (mocks.state.currentUser) {
      return { user: mocks.state.currentUser }
    }
    return null
  }),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    organization: {
      count: vi.fn(async () => mocks.state.orgCount),
    },
  },
}))

import { updateSession } from '../lib/auth/middleware'

function makeRequest(pathname: string) {
  const req = {
    nextUrl: {
      pathname,
      clone() { return { pathname } },
    },
    cookies: {
      getAll() { return [] },
      set: vi.fn(),
    },
  }
  return req as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.currentUser = null
  mocks.state.orgCount = 1
})

describe('updateSession (Auth Middleware)', () => {
  it('bypassa /api/* sem chamar auth', async () => {
    const req = makeRequest('/api/health')
    const res = await updateSession(req)
    expect(mocks.nextResponseMock.next).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ kind: 'next' })
  })

  it('permite /setup sem autenticacao (sem redirect)', async () => {
    const req = makeRequest('/setup')
    const res = await updateSession(req)
    expect(mocks.nextResponseMock.redirect).not.toHaveBeenCalled()
    expect(res).toMatchObject({ kind: 'next' })
  })

  it('permite /join/* sem autenticacao (sem redirect)', async () => {
    const req = makeRequest('/join')
    const res = await updateSession(req)
    expect(mocks.nextResponseMock.redirect).not.toHaveBeenCalled()
    expect(res).toMatchObject({ kind: 'next' })
  })

  it('permite /auth/callback sem autenticacao (sem redirect)', async () => {
    const req = makeRequest('/auth/callback')
    const res = await updateSession(req)
    expect(mocks.nextResponseMock.redirect).not.toHaveBeenCalled()
    expect(res).toMatchObject({ kind: 'next' })
  })

  it('redireciona rota protegida para /login quando nao autenticado', async () => {
    const req = makeRequest('/dashboard')
    const res = await updateSession(req)
    expect(mocks.nextResponseMock.redirect).toHaveBeenCalledTimes(1)
    const [urlArg] = mocks.nextResponseMock.redirect.mock.calls[0]
    expect(urlArg).toMatchObject({ pathname: '/login' })
    expect(res).toMatchObject({ kind: 'redirect' })
  })

  it('redireciona usuario autenticado para /dashboard quando acessa /login', async () => {
    mocks.state.currentUser = { id: 'user-1', email: 'a@b.com', role: 'admin', organizationId: 'org-1' }
    const req = makeRequest('/login')
    const res = await updateSession(req)
    expect(mocks.nextResponseMock.redirect).toHaveBeenCalledTimes(1)
    const [urlArg] = mocks.nextResponseMock.redirect.mock.calls[0]
    expect(urlArg).toMatchObject({ pathname: '/dashboard' })
    expect(res).toMatchObject({ kind: 'redirect' })
  })
})

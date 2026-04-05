'use client'

/**
 * Migration shim - Supabase client replacement
 *
 * Provides a minimal compatibility layer for components that still
 * import from '@/lib/supabase/client'. These should be migrated
 * to use Prisma services directly over time.
 */

 
type AnyFn = (...args: any[]) => any

/**
 * Creates a chainable query builder that mimics the Supabase PostgREST
 * query interface. Every method returns `this` so chained calls compile,
 * and terminal methods (`single`, `maybeSingle`, `then`) resolve to
 * `{ data, error }`.
 */
function createChainableBuilder(): any {
  const result = { data: null as any, error: null as any }

  const builder: Record<string, AnyFn> = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    gt: () => builder,
    gte: () => builder,
    lt: () => builder,
    lte: () => builder,
    is: () => builder,
    in: () => builder,
    not: () => builder,
    like: () => builder,
    ilike: () => builder,
    or: () => builder,
    filter: () => builder,
    match: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: AnyFn) => Promise.resolve(result).then(resolve),
    catch: (fn: AnyFn) => Promise.resolve(result).catch(fn),
  }

  return builder
}

// Placeholder that mimics the old SupabaseClient interface
// Components using this should be migrated to use lib/services/ or API routes
const noopClient = {
  from: (_table: string) => createChainableBuilder(),
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => ({ data: null, error: new Error('Use NextAuth signIn()') }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    updateUser: async () => ({ data: null, error: new Error('Use API route for profile updates') }),
  },
  rpc: async (fn: string, _params?: Record<string, unknown>) => {
    console.warn(`[migration] supabase.rpc('${fn}') called - migrate to Prisma service`)
    if (fn === 'is_instance_initialized') {
      // Fallback: fetch from API
      try {
        const res = await fetch('/api/installer/check-initialized')
        const data = await res.json()
        return { data: data.initialized ?? false, error: null }
      } catch {
        return { data: true, error: null }
      }
    }
    if (fn === 'create_api_key') {
      try {
        const res = await fetch('/api/settings/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: _params?.p_name }),
        })
        const data = await res.json()
        if (!res.ok) return { data: null, error: new Error(data.error || 'Failed') }
        return { data: data.data ? [data.data] : [data], error: null }
      } catch (e) {
        return { data: null, error: e as Error }
      }
    }
    if (fn === 'revoke_api_key') {
      try {
        const res = await fetch(`/api/settings/api-keys/${_params?.p_api_key_id}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          return { data: null, error: new Error(data.error || 'Failed') }
        }
        return { data: null, error: null }
      } catch (e) {
        return { data: null, error: e as Error }
      }
    }
    return { data: null, error: new Error('Supabase removed - use Prisma services') }
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: new Error('Use MinIO storage') }),
      download: async () => ({ data: null, error: new Error('Use MinIO storage') }),
      createSignedUrl: async () => ({ data: null, error: new Error('Use MinIO storage') }),
      remove: async () => ({ error: new Error('Use MinIO storage') }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
}

export function createClient() {
  return noopClient
}

export const supabase = noopClient

/**
 * Supabase-compat adapter backed by Prisma.
 *
 * Re-exports the query builder from server.ts without the auth/rpc parts.
 * Used by lib/ai/tools.ts and other modules that only need .from() chains.
 *
 * TODO: Remove once all consumers are migrated to call prisma directly.
 */
export { createStaticAdminClient as createSupabasePrismaAdapter } from './server'

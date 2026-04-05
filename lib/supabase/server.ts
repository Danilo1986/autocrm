import 'server-only'
import { prisma } from '@/lib/db/prisma'
import { auth } from '@/lib/auth/auth'

/**
 * Migration shim - Server-side Supabase client replacement
 *
 * Provides a Prisma-backed compatibility layer for API routes that
 * still use the Supabase client pattern. Routes should be migrated
 * to use lib/services/ directly over time.
 */

function createPrismaShim(userId?: string | null) {
  return {
    from: (table: string) => createQueryBuilder(table),
    auth: {
      getUser: async () => {
        if (userId) {
          const user = await prisma.user.findUnique({ where: { id: userId } })
          return { data: { user: user ? { id: user.id, email: user.email } : null }, error: null }
        }
        const session = await auth()
        if (session?.user) {
          return { data: { user: { id: session.user.id, email: session.user.email } }, error: null }
        }
        return { data: { user: null }, error: null }
      },
      getSession: async () => {
        const session = await auth()
        return { data: { session }, error: null }
      },
      admin: {
        createUser: async (_opts?: any) => ({ data: null, error: new Error('Use Prisma + bcrypt directly') }),
        deleteUser: async (_id?: string) => ({ data: null, error: new Error('Use Prisma directly') }),
      },
    },
    rpc: async (fn: string, params?: Record<string, unknown>) => {
      switch (fn) {
        case 'is_instance_initialized': {
          const count = await prisma.organization.count()
          return { data: count > 0, error: null }
        }
        case 'get_contact_stage_counts': {
          const counts = await prisma.contact.groupBy({
            by: ['stage'],
            _count: true,
            where: { deletedAt: null },
          })
          const result = counts.map(c => ({ stage: c.stage, count: c._count }))
          return { data: result, error: null }
        }
        case 'get_dashboard_stats': {
          const { dashboardService } = await import('@/lib/services/dashboard')
          const { data } = await dashboardService.getStats()
          return { data, error: null }
        }
        case 'log_audit_event': {
          const { auditService } = await import('@/lib/services/audit')
          await auditService.log({
            action: params?.p_action as string,
            resourceType: params?.p_resource_type as string,
            resourceId: params?.p_resource_id as string,
            details: params?.p_details as Record<string, unknown>,
            severity: ((params?.p_severity as string) ?? 'info') as 'info' | 'warning' | 'critical' | 'error' | 'debug',
            userId: userId ?? undefined,
          })
          return { data: null, error: null }
        }
        case 'create_api_key': {
          const { apiKeysService } = await import('@/lib/services/apiKeys')
          const session = await auth()
          if (!session?.user?.id) return { data: null, error: new Error('Not authenticated') }
          const profile = await prisma.profile.findUnique({ where: { id: session.user.id }, select: { organizationId: true } })
          if (!profile?.organizationId) return { data: null, error: new Error('No organization') }
          const result = await apiKeysService.create(profile.organizationId, params?.p_name as string, session.user.id)
          return { data: result.data ? [result.data] : null, error: result.error }
        }
        case 'revoke_api_key': {
          const { apiKeysService } = await import('@/lib/services/apiKeys')
          const session = await auth()
          if (!session?.user?.id) return { data: null, error: new Error('Not authenticated') }
          const profile = await prisma.profile.findUnique({ where: { id: session.user.id }, select: { organizationId: true } })
          if (!profile?.organizationId) return { data: null, error: new Error('No organization') }
          const result = await apiKeysService.revoke(params?.p_api_key_id as string, profile.organizationId)
          return { data: null, error: result.error }
        }
        case 'validate_api_key': {
          const { apiKeysService } = await import('@/lib/services/apiKeys')
          const result = await apiKeysService.validate(params?.p_token as string)
          return { data: result.data ? [result.data] : null, error: result.error }
        }
        default:
          console.warn(`[migration] supabase.rpc('${fn}') - not implemented`)
          return { data: null, error: new Error(`RPC '${fn}' not implemented`) }
      }
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: new Error('Use MinIO storage') }),
        download: async () => ({ data: null, error: new Error('Use MinIO storage') }),
        createSignedUrl: async () => ({ data: null, error: new Error('Use MinIO storage') }),
        remove: async () => ({ error: new Error('Use MinIO storage') }),
      }),
    },
  }
}

// Minimal query builder that delegates to Prisma
// Handles the most common Supabase patterns used in API routes
function createQueryBuilder(table: string) {
  const modelMap: Record<string, string> = {
    profiles: 'profile',
    organizations: 'organization',
    organization_settings: 'organizationSettings',
    boards: 'board',
    board_stages: 'boardStage',
    contacts: 'contact',
    crm_companies: 'crmCompany',
    deals: 'deal',
    deal_items: 'dealItem',
    activities: 'activity',
    products: 'product',
    tags: 'tag',
    user_settings: 'userSettings',
    ai_conversations: 'aiConversation',
    ai_decisions: 'aiDecision',
    ai_prompt_templates: 'aiPromptTemplate',
    ai_feature_flags: 'aiFeatureFlag',
    system_notifications: 'systemNotification',
    organization_invites: 'organizationInvite',
    api_keys: 'apiKey',
    audit_logs: 'auditLog',
    user_consents: 'userConsent',
    integration_inbound_sources: 'integrationInboundSource',
    integration_outbound_endpoints: 'integrationOutboundEndpoint',
    webhook_events_in: 'webhookEventIn',
    webhook_events_out: 'webhookEventOut',
    quick_scripts: 'quickScript',
    deal_notes: 'dealNote',
    deal_files: 'dealFile',
    leads: 'lead',
    lifecycle_stages: 'lifecycleStage',
    security_alerts: 'securityAlert',
    rate_limits: 'rateLimit',
  }

  const model = modelMap[table]
  if (!model) {
    console.warn(`[migration] Unknown table '${table}' in query builder`)
  }

  // Build a chainable query object
  const where: Record<string, unknown> = {}
  let selectFields: string | undefined
  let orderByField: string | undefined
  let orderAsc = true
  let limitVal: number | undefined
  let countMode = false

  const builder: any = {
    select(fields?: string, opts?: { count?: string }) {
      selectFields = fields
      if (opts?.count) countMode = true
      return builder
    },
    eq(field: string, value: unknown) {
      where[snakeToCamel(field)] = value
      return builder
    },
    neq(field: string, value: unknown) {
      where[snakeToCamel(field)] = { not: value }
      return builder
    },
    is(field: string, value: unknown) {
      where[snakeToCamel(field)] = value
      return builder
    },
    in(field: string, values: unknown[]) {
      where[snakeToCamel(field)] = { in: values }
      return builder
    },
    ilike(field: string, pattern: string) {
      const search = pattern.replace(/%/g, '')
      where[snakeToCamel(field)] = { contains: search, mode: 'insensitive' }
      return builder
    },
    or(expr: string) {
      // Basic OR parsing for simple cases
      // e.g. "name.ilike.%term%,email.ilike.%term%"
      const parts = expr.split(',')
      const orClauses = parts.map(part => {
        const [field, op, val] = part.split('.')
        const camelField = snakeToCamel(field)
        if (op === 'ilike') {
          return { [camelField]: { contains: val?.replace(/%/g, ''), mode: 'insensitive' as const } }
        }
        return { [camelField]: val }
      })
      where.OR = orClauses
      return builder
    },
    order(field: string, opts?: { ascending?: boolean }) {
      orderByField = snakeToCamel(field)
      orderAsc = opts?.ascending ?? true
      return builder
    },
    limit(n: number) {
      limitVal = n
      return builder
    },
    range(from: number, to: number) {
      where._skip = from
      where._take = to - from + 1
      return builder
    },
    gte(field: string, value: unknown) {
      where[snakeToCamel(field)] = { gte: value }
      return builder
    },
    lte(field: string, value: unknown) {
      where[snakeToCamel(field)] = { lte: value }
      return builder
    },
    gt(field: string, value: unknown) {
      where[snakeToCamel(field)] = { gt: value }
      return builder
    },
    lt(field: string, value: unknown) {
      where[snakeToCamel(field)] = { lt: value }
      return builder
    },
    not(field: string, op: string, value: unknown) {
      if (op === 'is') {
        where[snakeToCamel(field)] = { not: value }
      } else {
        where[snakeToCamel(field)] = { not: value }
      }
      return builder
    },
    filter(field: string, op: string, value: unknown) {
      where[snakeToCamel(field)] = value
      return builder
    },
    async single() {
      return executeQuery('single')
    },
    async maybeSingle() {
      return executeQuery('maybeSingle')
    },
    then(resolve: (value: any) => any) {
      return executeQuery('many').then(resolve)
    },
    // Mutations
    async insert(data: any) {
      return executeMutation('insert', data)
    },
    async update(data: any) {
      return executeMutation('update', data)
    },
    async upsert(data: any, opts?: { onConflict?: string }) {
      return executeMutation('upsert', data, opts)
    },
    async delete() {
      return executeMutation('delete')
    },
  }

  async function executeQuery(mode: 'single' | 'maybeSingle' | 'many') {
    if (!model) return { data: null, error: new Error(`Unknown table: ${table}`), count: null }

    try {
      const prismaModel = (prisma as any)[model]
      const skip = (where as any)._skip
      const take = (where as any)._take
      delete (where as any)._skip
      delete (where as any)._take

      const queryOpts: any = { where }
      if (orderByField) queryOpts.orderBy = { [orderByField]: orderAsc ? 'asc' : 'desc' }
      if (limitVal) queryOpts.take = limitVal
      if (skip !== undefined) queryOpts.skip = skip
      if (take !== undefined) queryOpts.take = take

      if (mode === 'single' || mode === 'maybeSingle') {
        const data = await prismaModel.findFirst(queryOpts)
        if (!data && mode === 'single') {
          return { data: null, error: new Error('Row not found') }
        }
        return { data: data ? camelToSnakeObj(data) : null, error: null }
      }

      const data = await prismaModel.findMany(queryOpts)
      const result = data.map(camelToSnakeObj)

      if (countMode) {
        const count = await prismaModel.count({ where })
        return { data: result, error: null, count }
      }

      return { data: result, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async function executeMutation(op: string, data?: any, _opts?: any) {
    if (!model) return { data: null, error: new Error(`Unknown table: ${table}`) }

    try {
      const prismaModel = (prisma as any)[model]
      const camelData = data ? snakeToCamelObj(data) : undefined

      switch (op) {
        case 'insert': {
          const result = await prismaModel.create({ data: camelData })
          return { data: camelToSnakeObj(result), error: null, select: () => ({ single: async () => ({ data: camelToSnakeObj(result), error: null }) }) }
        }
        case 'update': {
          const result = await prismaModel.updateMany({ where, data: camelData })
          return { data: result, error: null }
        }
        case 'delete': {
          await prismaModel.deleteMany({ where })
          return { data: null, error: null }
        }
        default:
          return { data: null, error: new Error(`Unknown op: ${op}`) }
      }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  return builder
}

// snake_case to camelCase helpers
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function snakeToCamelObj(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(snakeToCamelObj)
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value instanceof Date ? value.toISOString() : value
  }
  return result
}

function camelToSnakeObj(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(camelToSnakeObj)
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value instanceof Date ? value.toISOString() : value
  }
  return result
}

/**
 * Creates a server-side client with auth context from cookies.
 * Returns a Prisma-backed compatibility shim.
 */
export async function createClient() {
  const session = await auth()
  return createPrismaShim(session?.user?.id)
}

/**
 * Creates an admin client (service-role equivalent).
 * No auth context needed - full access.
 */
export async function createAdminClient() {
  return createPrismaShim(null)
}

/**
 * Creates a static admin client (no request context needed).
 */
export function createStaticAdminClient() {
  return createPrismaShim(null)
}

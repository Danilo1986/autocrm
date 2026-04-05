/**
 * Client-safe service wrappers
 *
 * These wrap the Prisma services to work in both server and client contexts.
 * On the server: calls Prisma directly.
 * On the client: calls API routes via fetch.
 *
 * This allows contexts ('use client') to import from here instead of
 * directly from the Prisma-based services.
 */

const isServer = typeof window === 'undefined'

// Helper: call an API route and return { data, error } format
async function apiFetch<T>(url: string, options?: RequestInit): Promise<{ data: T | null; error: Error | null }> {
  try {
    const res = await fetch(url, { credentials: 'include', ...options })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return { data: null, error: new Error(body.error || `HTTP ${res.status}`) }
    }
    const data = await res.json()
    return { data: data.data ?? data, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

async function apiMutate(url: string, method: string, body?: unknown): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return { error: new Error(data.error || `HTTP ${res.status}`) }
    }
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

// Lazy server-side imports to avoid bundling Prisma in client
async function getServerService(name: string) {
  if (!isServer) throw new Error(`Cannot use server service '${name}' in browser`)
  const mod = await import(`./${name}`)
  return mod
}

// ============================================================================
// Service proxies that work in both environments
// ============================================================================

export const dealsService = {
  async getAll() {
    if (!isServer) return apiFetch('/api/public/v1/deals')
    return (await getServerService('deals')).dealsService.getAll()
  },
  async getById(id: string) {
    if (!isServer) return apiFetch(`/api/public/v1/deals/${id}`)
    return (await getServerService('deals')).dealsService.getById(id)
  },
  async create(deal: any, stageId?: string) {
    if (!isServer) return apiFetch('/api/public/v1/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...deal, stageId }) })
    return (await getServerService('deals')).dealsService.create(deal, stageId)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiMutate(`/api/public/v1/deals/${id}`, 'PATCH', updates)
    return (await getServerService('deals')).dealsService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiMutate(`/api/public/v1/deals/${id}`, 'DELETE')
    return (await getServerService('deals')).dealsService.delete(id)
  },
  async deleteByBoardId(boardId: string) {
    if (!isServer) return apiMutate(`/api/internal/deals/delete-by-board`, 'POST', { boardId })
    return (await getServerService('deals')).dealsService.deleteByBoardId(boardId)
  },
  async addItem(dealId: string, item: any) {
    if (!isServer) return apiFetch(`/api/internal/deals/${dealId}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
    return (await getServerService('deals')).dealsService.addItem(dealId, item)
  },
  async removeItem(dealId: string, itemId: string) {
    if (!isServer) return apiMutate(`/api/internal/deals/${dealId}/items/${itemId}`, 'DELETE')
    return (await getServerService('deals')).dealsService.removeItem(dealId, itemId)
  },
  async recalculateDealValue(dealId: string) {
    return (await getServerService('deals')).dealsService.recalculateDealValue(dealId)
  },
  async markAsWon(dealId: string) {
    if (!isServer) return apiMutate(`/api/public/v1/deals/${dealId}/mark-won`, 'POST')
    return (await getServerService('deals')).dealsService.markAsWon(dealId)
  },
  async markAsLost(dealId: string, lossReason?: string) {
    if (!isServer) return apiMutate(`/api/public/v1/deals/${dealId}/mark-lost`, 'POST', { lossReason })
    return (await getServerService('deals')).dealsService.markAsLost(dealId, lossReason)
  },
  async reopen(dealId: string) {
    if (!isServer) return apiMutate(`/api/internal/deals/${dealId}/reopen`, 'POST')
    return (await getServerService('deals')).dealsService.reopen(dealId)
  },
}

export const contactsService = {
  async getStageCounts() {
    if (!isServer) return apiFetch('/api/internal/contacts/stage-counts')
    return (await getServerService('contacts')).contactsService.getStageCounts()
  },
  async getByIds(ids: string[]) {
    if (!isServer) return apiFetch(`/api/internal/contacts/by-ids?ids=${ids.join(',')}`)
    return (await getServerService('contacts')).contactsService.getByIds(ids)
  },
  async getAll() {
    if (!isServer) return apiFetch('/api/public/v1/contacts')
    return (await getServerService('contacts')).contactsService.getAll()
  },
  async getAllPaginated(pagination: any, filters?: any) {
    if (!isServer) {
      const params = new URLSearchParams({ page: String(pagination.pageIndex), pageSize: String(pagination.pageSize), ...filters })
      return apiFetch(`/api/internal/contacts/paginated?${params}`)
    }
    return (await getServerService('contacts')).contactsService.getAllPaginated(pagination, filters)
  },
  async create(contact: any) {
    if (!isServer) return apiFetch('/api/public/v1/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact) })
    return (await getServerService('contacts')).contactsService.create(contact)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiMutate(`/api/public/v1/contacts/${id}`, 'PATCH', updates)
    return (await getServerService('contacts')).contactsService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiMutate(`/api/public/v1/contacts/${id}`, 'DELETE')
    return (await getServerService('contacts')).contactsService.delete(id)
  },
  async hasDeals(contactId: string) {
    if (!isServer) return apiFetch(`/api/internal/contacts/${contactId}/has-deals`)
    return (await getServerService('contacts')).contactsService.hasDeals(contactId)
  },
  async deleteWithDeals(contactId: string) {
    if (!isServer) return apiMutate(`/api/internal/contacts/${contactId}/delete-with-deals`, 'POST')
    return (await getServerService('contacts')).contactsService.deleteWithDeals(contactId)
  },
}

export const companiesService = {
  async getByIds(ids: string[]) {
    if (!isServer) return apiFetch(`/api/internal/companies/by-ids?ids=${ids.join(',')}`)
    return (await getServerService('contacts')).companiesService.getByIds(ids)
  },
  async getAll() {
    if (!isServer) return apiFetch('/api/public/v1/companies')
    return (await getServerService('contacts')).companiesService.getAll()
  },
  async create(company: any) {
    if (!isServer) return apiFetch('/api/public/v1/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(company) })
    return (await getServerService('contacts')).companiesService.create(company)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiMutate(`/api/public/v1/companies/${id}`, 'PATCH', updates)
    return (await getServerService('contacts')).companiesService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiMutate(`/api/public/v1/companies/${id}`, 'DELETE')
    return (await getServerService('contacts')).companiesService.delete(id)
  },
}

export const boardsService = {
  async getAll() {
    if (!isServer) return apiFetch('/api/public/v1/boards')
    return (await getServerService('boards')).boardsService.getAll()
  },
  async get(id: string) {
    if (!isServer) {
      const result = await apiFetch(`/api/public/v1/boards/${id}`)
      return result.data
    }
    return (await getServerService('boards')).boardsService.get(id)
  },
  async create(board: any, order?: number) {
    if (!isServer) return apiFetch('/api/internal/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...board, order }) })
    return (await getServerService('boards')).boardsService.create(board, order)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiMutate(`/api/internal/boards/${id}`, 'PATCH', updates)
    return (await getServerService('boards')).boardsService.update(id, updates)
  },
  async canDelete(boardId: string) {
    if (!isServer) return apiFetch(`/api/internal/boards/${boardId}/can-delete`)
    return (await getServerService('boards')).boardsService.canDelete(boardId)
  },
  async moveDealsToBoard(fromBoardId: string, toBoardId: string) {
    if (!isServer) return apiMutate('/api/internal/boards/move-deals', 'POST', { fromBoardId, toBoardId })
    return (await getServerService('boards')).boardsService.moveDealsToBoard(fromBoardId, toBoardId)
  },
  async delete(id: string) {
    if (!isServer) return apiMutate(`/api/internal/boards/${id}`, 'DELETE')
    return (await getServerService('boards')).boardsService.delete(id)
  },
  async deleteWithMoveDeals(boardId: string, targetBoardId: string) {
    if (!isServer) return apiMutate(`/api/internal/boards/${boardId}/delete-with-move`, 'POST', { targetBoardId })
    return (await getServerService('boards')).boardsService.deleteWithMoveDeals(boardId, targetBoardId)
  },
  async addStage(boardId: string, stage: any) {
    if (!isServer) return apiFetch(`/api/internal/boards/${boardId}/stages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stage) })
    return (await getServerService('boards')).boardsService.addStage(boardId, stage)
  },
  async updateStage(stageId: string, updates: any) {
    if (!isServer) return apiMutate(`/api/internal/stages/${stageId}`, 'PATCH', updates)
    return (await getServerService('boards')).boardsService.updateStage(stageId, updates)
  },
  async deleteStage(stageId: string) {
    if (!isServer) return apiMutate(`/api/internal/stages/${stageId}`, 'DELETE')
    return (await getServerService('boards')).boardsService.deleteStage(stageId)
  },
}

export const boardStagesService = {
  async getAll() {
    if (!isServer) return apiFetch('/api/internal/stages')
    return (await getServerService('boards')).boardStagesService.getAll()
  },
  async getByBoardId(boardId: string) {
    if (!isServer) return apiFetch(`/api/public/v1/boards/${boardId}/stages`)
    return (await getServerService('boards')).boardStagesService.getByBoardId(boardId)
  },
}

export const activitiesService = {
  async getAll() {
    if (!isServer) return apiFetch('/api/public/v1/activities')
    return (await getServerService('activities')).activitiesService.getAll()
  },
  async create(activity: any) {
    if (!isServer) return apiFetch('/api/public/v1/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(activity) })
    return (await getServerService('activities')).activitiesService.create(activity)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiMutate(`/api/internal/activities/${id}`, 'PATCH', updates)
    return (await getServerService('activities')).activitiesService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiMutate(`/api/internal/activities/${id}`, 'DELETE')
    return (await getServerService('activities')).activitiesService.delete(id)
  },
  async toggleCompletion(id: string) {
    if (!isServer) return apiFetch(`/api/internal/activities/${id}/toggle`, { method: 'POST' })
    return (await getServerService('activities')).activitiesService.toggleCompletion(id)
  },
}

export const productsService = {
  async getAll() {
    if (!isServer) return apiFetch('/api/internal/products')
    return (await getServerService('products')).productsService.getAll()
  },
  async getActive() {
    if (!isServer) return apiFetch('/api/internal/products?active=true')
    return (await getServerService('products')).productsService.getActive()
  },
  async create(input: any) {
    if (!isServer) return apiFetch('/api/internal/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    return (await getServerService('products')).productsService.create(input)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiMutate(`/api/internal/products/${id}`, 'PATCH', updates)
    return (await getServerService('products')).productsService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiMutate(`/api/internal/products/${id}`, 'DELETE')
    return (await getServerService('products')).productsService.delete(id)
  },
}

export const settingsService = {
  async get(userId: string) {
    if (!isServer) return apiFetch('/api/settings/ai')
    return (await getServerService('settings')).settingsService.get(userId)
  },
  async createDefault(userId: string) {
    if (!isServer) return apiFetch('/api/settings/ai', { method: 'POST' })
    return (await getServerService('settings')).settingsService.createDefault(userId)
  },
  async update(userId: string, updates: any) {
    if (!isServer) return apiMutate('/api/settings/ai', 'POST', updates)
    return (await getServerService('settings')).settingsService.update(userId, updates)
  },
}

export const lifecycleStagesService = {
  async getAll() {
    if (!isServer) return apiFetch('/api/internal/lifecycle-stages')
    return (await getServerService('settings')).lifecycleStagesService.getAll()
  },
  async create(stage: any) {
    return (await getServerService('settings')).lifecycleStagesService.create(stage)
  },
  async update(id: string, updates: any) {
    return (await getServerService('settings')).lifecycleStagesService.update(id, updates)
  },
  async delete(id: string) {
    return (await getServerService('settings')).lifecycleStagesService.delete(id)
  },
  async reorder(stages: any[]) {
    return (await getServerService('settings')).lifecycleStagesService.reorder(stages)
  },
}

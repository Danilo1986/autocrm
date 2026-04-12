/**
 * Client-safe service wrappers
 *
 * Browser: calls /api/internal/data via fetch (session auth)
 * Server: calls Prisma directly via lazy import
 */

const isServer = typeof window === 'undefined'

const API = '/api/internal/data'

async function apiFetch<T>(entity: string, id?: string): Promise<{ data: T | null; error: Error | null }> {
  try {
    const url = id ? `${API}?entity=${entity}&id=${id}` : `${API}?entity=${entity}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { data: null, error: new Error(body.error || `HTTP ${res.status}`) }
    }
    const json = await res.json()
    return { data: json.data ?? json, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

async function apiCreate<T>(entity: string, body: unknown): Promise<{ data: T | null; error: Error | null }> {
  try {
    const res = await fetch(`${API}?entity=${entity}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { data: null, error: new Error(data.error || `HTTP ${res.status}`) }
    }
    const json = await res.json()
    return { data: json.data ?? json, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

async function apiUpdate(entity: string, id: string, body: unknown): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(`${API}?entity=${entity}&id=${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: new Error(data.error || `HTTP ${res.status}`) }
    }
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

async function apiDelete(entity: string, id: string): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(`${API}?entity=${entity}&id=${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: new Error(data.error || `HTTP ${res.status}`) }
    }
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

async function apiPost(url: string, body?: unknown): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: new Error(data.error || `HTTP ${res.status}`) }
    }
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

// Lazy server-side import
async function srv(name: string) {
  if (!isServer) throw new Error(`Server-only: ${name}`)
  return import(`./${name}`)
}

// ============================================================================
// Deals
// ============================================================================
export const dealsService = {
  async getAll() {
    if (!isServer) return apiFetch('deals')
    return (await srv('deals')).dealsService.getAll()
  },
  async getById(id: string) {
    if (!isServer) return apiFetch('deals', id)
    return (await srv('deals')).dealsService.getById(id)
  },
  async create(deal: any, stageId?: string) {
    if (!isServer) return apiCreate('deals', { ...deal, stageId })
    return (await srv('deals')).dealsService.create(deal, stageId)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiUpdate('deals', id, updates)
    return (await srv('deals')).dealsService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiDelete('deals', id)
    return (await srv('deals')).dealsService.delete(id)
  },
  async deleteByBoardId(boardId: string) {
    if (!isServer) return apiPost('/api/internal/deals/delete-by-board', { boardId })
    return (await srv('deals')).dealsService.deleteByBoardId(boardId)
  },
  async addItem(dealId: string, item: any) {
    if (!isServer) return apiCreate('deals', { _action: 'addItem', dealId, item })
    return (await srv('deals')).dealsService.addItem(dealId, item)
  },
  async removeItem(dealId: string, itemId: string) {
    if (!isServer) return apiPost('/api/internal/deals/remove-item', { dealId, itemId })
    return (await srv('deals')).dealsService.removeItem(dealId, itemId)
  },
  async recalculateDealValue(dealId: string) {
    return (await srv('deals')).dealsService.recalculateDealValue(dealId)
  },
  async markAsWon(dealId: string) {
    if (!isServer) return apiPost(`/api/internal/deals/mark-won`, { dealId })
    return (await srv('deals')).dealsService.markAsWon(dealId)
  },
  async markAsLost(dealId: string, lossReason?: string) {
    if (!isServer) return apiPost(`/api/internal/deals/mark-lost`, { dealId, lossReason })
    return (await srv('deals')).dealsService.markAsLost(dealId, lossReason)
  },
  async reopen(dealId: string) {
    if (!isServer) return apiPost(`/api/internal/deals/reopen`, { dealId })
    return (await srv('deals')).dealsService.reopen(dealId)
  },
}

// ============================================================================
// Contacts
// ============================================================================
export const contactsService = {
  async getStageCounts() {
    if (!isServer) return apiFetch('contacts') // TODO: separate endpoint
    return (await srv('contacts')).contactsService.getStageCounts()
  },
  async getByIds(ids: string[]) {
    if (!isServer) return apiFetch('contacts') // Returns all, filter client-side
    return (await srv('contacts')).contactsService.getByIds(ids)
  },
  async getAll() {
    if (!isServer) return apiFetch('contacts')
    return (await srv('contacts')).contactsService.getAll()
  },
  async getAllPaginated(pagination: any, filters?: any) {
    if (!isServer) return apiFetch('contacts') // TODO: pagination via query params
    return (await srv('contacts')).contactsService.getAllPaginated(pagination, filters)
  },
  async create(contact: any) {
    if (!isServer) return apiCreate('contacts', contact)
    return (await srv('contacts')).contactsService.create(contact)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiUpdate('contacts', id, updates)
    return (await srv('contacts')).contactsService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiDelete('contacts', id)
    return (await srv('contacts')).contactsService.delete(id)
  },
  async hasDeals(contactId: string) {
    if (!isServer) return { hasDeals: false, dealCount: 0, deals: [], error: null }
    return (await srv('contacts')).contactsService.hasDeals(contactId)
  },
  async deleteWithDeals(contactId: string) {
    if (!isServer) return apiDelete('contacts', contactId)
    return (await srv('contacts')).contactsService.deleteWithDeals(contactId)
  },
}

export const companiesService = {
  async getByIds(ids: string[]) {
    if (!isServer) return apiFetch('companies')
    return (await srv('contacts')).companiesService.getByIds(ids)
  },
  async getAll() {
    if (!isServer) return apiFetch('companies')
    return (await srv('contacts')).companiesService.getAll()
  },
  async create(company: any) {
    if (!isServer) return apiCreate('companies', company)
    return (await srv('contacts')).companiesService.create(company)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiUpdate('companies', id, updates)
    return (await srv('contacts')).companiesService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiDelete('companies', id)
    return (await srv('contacts')).companiesService.delete(id)
  },
}

// ============================================================================
// Boards
// ============================================================================
export const boardsService = {
  async getAll() {
    if (!isServer) return apiFetch('boards')
    return (await srv('boards')).boardsService.getAll()
  },
  async get(id: string) {
    if (!isServer) {
      const r = await apiFetch('boards', id)
      return r.data
    }
    return (await srv('boards')).boardsService.get(id)
  },
  async create(board: any, order?: number) {
    if (!isServer) return apiCreate('boards', { ...board, order })
    return (await srv('boards')).boardsService.create(board, order)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiUpdate('boards', id, updates)
    return (await srv('boards')).boardsService.update(id, updates)
  },
  async canDelete(boardId: string) {
    if (!isServer) return { canDelete: true, dealCount: 0, error: null }
    return (await srv('boards')).boardsService.canDelete(boardId)
  },
  async moveDealsToBoard(from: string, to: string) {
    return (await srv('boards')).boardsService.moveDealsToBoard(from, to)
  },
  async delete(id: string) {
    if (!isServer) return apiDelete('boards', id)
    return (await srv('boards')).boardsService.delete(id)
  },
  async deleteWithMoveDeals(boardId: string, targetBoardId: string) {
    return (await srv('boards')).boardsService.deleteWithMoveDeals(boardId, targetBoardId)
  },
  async addStage(boardId: string, stage: any) {
    if (!isServer) return apiCreate('stages', { ...stage, boardId })
    return (await srv('boards')).boardsService.addStage(boardId, stage)
  },
  async updateStage(stageId: string, updates: any) {
    if (!isServer) return apiUpdate('stages', stageId, updates)
    return (await srv('boards')).boardsService.updateStage(stageId, updates)
  },
  async deleteStage(stageId: string) {
    if (!isServer) return apiDelete('stages', stageId)
    return (await srv('boards')).boardsService.deleteStage(stageId)
  },
}

export const boardStagesService = {
  async getAll() {
    if (!isServer) return apiFetch('stages')
    return (await srv('boards')).boardStagesService.getAll()
  },
  async getByBoardId(boardId: string) {
    if (!isServer) return apiFetch('stages') // TODO: filter by boardId
    return (await srv('boards')).boardStagesService.getByBoardId(boardId)
  },
}

// ============================================================================
// Activities
// ============================================================================
export const activitiesService = {
  async getAll() {
    if (!isServer) return apiFetch('activities')
    return (await srv('activities')).activitiesService.getAll()
  },
  async create(activity: any) {
    if (!isServer) return apiCreate('activities', activity)
    return (await srv('activities')).activitiesService.create(activity)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiUpdate('activities', id, updates)
    return (await srv('activities')).activitiesService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiDelete('activities', id)
    return (await srv('activities')).activitiesService.delete(id)
  },
  async toggleCompletion(id: string) {
    if (!isServer) return apiPost(`/api/internal/activities/toggle`, { id })
    return (await srv('activities')).activitiesService.toggleCompletion(id)
  },
}

// ============================================================================
// Products
// ============================================================================
export const productsService = {
  async getAll() {
    if (!isServer) return apiFetch('products')
    return (await srv('products')).productsService.getAll()
  },
  async getActive() {
    if (!isServer) return apiFetch('products') // TODO: filter active
    return (await srv('products')).productsService.getActive()
  },
  async create(input: any) {
    if (!isServer) return apiCreate('products', input)
    return (await srv('products')).productsService.create(input)
  },
  async update(id: string, updates: any) {
    if (!isServer) return apiUpdate('products', id, updates)
    return (await srv('products')).productsService.update(id, updates)
  },
  async delete(id: string) {
    if (!isServer) return apiDelete('products', id)
    return (await srv('products')).productsService.delete(id)
  },
}

// ============================================================================
// Settings
// ============================================================================
export const settingsService = {
  async get(userId: string) {
    if (!isServer) {
      const r = await apiFetch('settings')
      return { data: r.data, error: r.error }
    }
    return (await srv('settings')).settingsService.get(userId)
  },
  async createDefault(userId: string) {
    return (await srv('settings')).settingsService.createDefault(userId)
  },
  async update(userId: string, updates: any) {
    if (!isServer) return apiPost('/api/settings/ai', updates)
    return (await srv('settings')).settingsService.update(userId, updates)
  },
}

export const lifecycleStagesService = {
  async getAll() {
    if (!isServer) return apiFetch('lifecycle-stages')
    return (await srv('settings')).lifecycleStagesService.getAll()
  },
  async create(stage: any) {
    return (await srv('settings')).lifecycleStagesService.create(stage)
  },
  async update(id: string, updates: any) {
    return (await srv('settings')).lifecycleStagesService.update(id, updates)
  },
  async delete(id: string) {
    return (await srv('settings')).lifecycleStagesService.delete(id)
  },
  async reorder(stages: any[]) {
    return (await srv('settings')).lifecycleStagesService.reorder(stages)
  },
}

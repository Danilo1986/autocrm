/**
 * SSE-based Realtime Sync Hook
 *
 * Drop-in replacement for the Supabase-based useRealtimeSync.
 * Connects to /api/realtime/stream and invalidates React Query
 * caches when change events arrive.
 */
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys, DEALS_VIEW_KEY } from '@/lib/query/queryKeys'

type RealtimeTable =
  | 'deals'
  | 'contacts'
  | 'activities'
  | 'boards'
  | 'board_stages'
  | 'crm_companies'

const getTableQueryKeys = (table: RealtimeTable): readonly (readonly unknown[])[] => {
  const mapping: Record<RealtimeTable, readonly (readonly unknown[])[]> = {
    deals: [queryKeys.deals.all, queryKeys.dashboard.stats],
    contacts: [queryKeys.contacts.all],
    activities: [queryKeys.activities.all],
    boards: [queryKeys.boards.all],
    board_stages: [queryKeys.boards.all],
    crm_companies: [queryKeys.companies.all],
  }
  return mapping[table]
}

// Global deduplication
const processedEvents = new Map<string, number>()
const DEDUP_TTL = 5000

function shouldProcess(key: string): boolean {
  const now = Date.now()
  for (const [k, ts] of processedEvents) {
    if (now - ts > DEDUP_TTL) processedEvents.delete(k)
  }
  if (processedEvents.has(key)) return false
  processedEvents.set(key, now)
  return true
}

interface UseRealtimeSyncOptions {
  enabled?: boolean
  debounceMs?: number
}

export function useRealtimeSync(
  tables: RealtimeTable | RealtimeTable[],
  options: UseRealtimeSyncOptions = {}
) {
  const { enabled = true, debounceMs = 150 } = options
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingKeysRef = useRef<Set<readonly unknown[]>>(new Set())

  const tableList = Array.isArray(tables) ? tables : [tables]
  const tablesKey = tableList.sort().join(',')

  const flush = useCallback(() => {
    const keys = pendingKeysRef.current
    if (keys.size === 0) return

    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key })
    }
    keys.clear()
  }, [queryClient])

  const scheduleFlush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(flush, debounceMs)
  }, [flush, debounceMs])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const url = `/api/realtime/stream?tables=${tablesKey}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener('connected', () => {
      setIsConnected(true)
    })

    es.addEventListener('change', (e) => {
      try {
        const data = JSON.parse(e.data) as {
          table: string
          operation: string
          id: string
          timestamp: string
        }

        const dedupeKey = `${data.table}-${data.id}-${data.timestamp}`
        if (!shouldProcess(dedupeKey)) return

        const table = data.table as RealtimeTable
        const keys = getTableQueryKeys(table)
        if (keys) {
          for (const key of keys) {
            pendingKeysRef.current.add(key)
          }
          scheduleFlush()
        }
      } catch {
        // Ignore malformed events
      }
    })

    es.onerror = () => {
      setIsConnected(false)
      // EventSource auto-reconnects
    }

    return () => {
      es.close()
      eventSourceRef.current = null
      setIsConnected(false)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [enabled, tablesKey, scheduleFlush])

  return { isConnected }
}

/**
 * Subscribe to all CRM tables
 */
export function useRealtimeSyncAll(options: UseRealtimeSyncOptions = {}) {
  return useRealtimeSync(
    ['deals', 'contacts', 'activities', 'boards', 'crm_companies'],
    options
  )
}

/**
 * Subscribe to Kanban-related tables
 */
export function useRealtimeSyncKanban(options: UseRealtimeSyncOptions = {}) {
  return useRealtimeSync(['deals', 'board_stages'], options)
}

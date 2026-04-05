/**
 * PostgreSQL LISTEN/NOTIFY Listener
 *
 * Maintains a persistent connection to PostgreSQL and listens for
 * change notifications on the 'crm_changes' channel.
 *
 * Used by the SSE endpoint to push realtime updates to clients.
 */
import pg from 'pg'

export interface ChangeEvent {
  table: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  id: string
  timestamp: string
}

type ChangeListener = (event: ChangeEvent) => void

const listeners = new Set<ChangeListener>()
let client: pg.Client | null = null
let connecting = false
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

async function connect() {
  if (client || connecting) return
  connecting = true

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.warn('[realtime/listener] DATABASE_URL not set, skipping pg LISTEN')
    connecting = false
    return
  }

  try {
    client = new pg.Client({ connectionString })

    client.on('notification', (msg) => {
      if (msg.channel !== 'crm_changes' || !msg.payload) return

      try {
        const event = JSON.parse(msg.payload) as ChangeEvent
        for (const listener of listeners) {
          try {
            listener(event)
          } catch {
            // Individual listener errors should not affect others
          }
        }
      } catch {
        // Ignore malformed payloads
      }
    })

    client.on('error', (err) => {
      console.error('[realtime/listener] Connection error:', err.message)
      cleanup()
      scheduleReconnect()
    })

    client.on('end', () => {
      cleanup()
      if (listeners.size > 0) {
        scheduleReconnect()
      }
    })

    await client.connect()
    await client.query('LISTEN crm_changes')
    console.log('[realtime/listener] Connected and listening on crm_changes')
  } catch (err) {
    console.error('[realtime/listener] Failed to connect:', (err as Error).message)
    cleanup()
    scheduleReconnect()
  } finally {
    connecting = false
  }
}

function cleanup() {
  if (client) {
    client.removeAllListeners()
    client.end().catch(() => {})
    client = null
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null
    if (listeners.size > 0) {
      connect()
    }
  }, 3000)
}

/**
 * Subscribe to change events. Automatically connects to PostgreSQL
 * when the first listener is added.
 */
export function subscribe(listener: ChangeListener): () => void {
  listeners.add(listener)

  // Connect if this is the first listener
  if (listeners.size === 1) {
    connect()
  }

  // Return unsubscribe function
  return () => {
    listeners.delete(listener)
    // Disconnect if no more listeners
    if (listeners.size === 0) {
      cleanup()
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }
    }
  }
}

/**
 * Send a notification (called from services after mutations).
 * Uses the existing Prisma connection pool, not the listener connection.
 */
export async function notify(event: Omit<ChangeEvent, 'timestamp'>) {
  const { prisma } = await import('@/lib/db/prisma')

  const payload = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  })

  await prisma.$executeRawUnsafe(
    `SELECT pg_notify('crm_changes', $1)`,
    payload
  )
}

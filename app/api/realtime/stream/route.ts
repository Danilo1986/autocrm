/**
 * SSE Endpoint for Realtime Updates
 *
 * Streams database change events to connected clients via Server-Sent Events.
 * Replaces Supabase Realtime subscriptions.
 *
 * GET /api/realtime/stream?tables=deals,contacts
 */
import { subscribe, type ChangeEvent } from '@/lib/realtime/listener'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEARTBEAT_INTERVAL = 30000 // 30 seconds

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tablesParam = url.searchParams.get('tables')
  const subscribedTables = tablesParam
    ? new Set(tablesParam.split(',').map((t) => t.trim()))
    : null // null = subscribe to all

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`)
      )

      // Subscribe to pg NOTIFY events
      unsubscribe = subscribe((event: ChangeEvent) => {
        // Filter by subscribed tables
        if (subscribedTables && !subscribedTables.has(event.table)) {
          return
        }

        try {
          controller.enqueue(
            encoder.encode(`event: change\ndata: ${JSON.stringify(event)}\n\n`)
          )
        } catch {
          // Stream closed
        }
      })

      // Heartbeat to keep connection alive
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          // Stream closed
        }
      }, HEARTBEAT_INTERVAL)
    },
    cancel() {
      if (unsubscribe) unsubscribe()
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    },
  })

  // Clean up on client disconnect
  request.signal.addEventListener('abort', () => {
    if (unsubscribe) unsubscribe()
    if (heartbeatTimer) clearInterval(heartbeatTimer)
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

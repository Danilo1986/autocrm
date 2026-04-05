/**
 * Realtime Hooks (SSE-based)
 *
 * Real-time synchronization for multi-user CRM via Server-Sent Events.
 */
export { useRealtimeSync, useRealtimeSyncAll, useRealtimeSyncKanban } from './useRealtimeSSE'
export { useRealtimePreset, getPresetTables, REALTIME_PRESETS, type RealtimePreset } from './presets'

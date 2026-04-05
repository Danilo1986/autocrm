/**
 * Realtime Sync Presets
 * 
 * Pre-configured table combinations for common sync scenarios.
 * Reduces repetition and provides semantic naming.
 * 
 * Usage:
 *   useRealtimePreset('contacts');  // Syncs contacts + companies
 *   useRealtimePreset('kanban');    // Syncs deals + stages
 */
import { useRealtimeSync } from './useRealtimeSSE';

// Table combinations for common scenarios
const REALTIME_PRESETS = {
  /** Contacts page: contacts and their companies */
  contacts: ['contacts', 'crm_companies'] as const,
  
  /** Deals page: deals with contacts and companies */
  deals: ['deals', 'contacts', 'crm_companies'] as const,
  
  /** Kanban board: deals and stages */
  kanban: ['deals', 'board_stages'] as const,
  
  /** Activities/Inbox: activities with deals */
  activities: ['activities', 'deals'] as const,
  
  /** Boards management: boards and stages */
  boards: ['boards', 'board_stages'] as const,
  
  /** Full CRM sync (for main layout) */
  all: ['deals', 'contacts', 'activities', 'boards', 'crm_companies'] as const,
} as const;

export type RealtimePreset = keyof typeof REALTIME_PRESETS;

/**
 * Hook to subscribe to a predefined realtime preset
 */
export function useRealtimePreset(
  preset: RealtimePreset,
  options?: Parameters<typeof useRealtimeSync>[1]
) {
  const tables = REALTIME_PRESETS[preset];
  return useRealtimeSync(tables as unknown as Parameters<typeof useRealtimeSync>[0], options);
}

/**
 * Get the tables for a preset (for documentation/debugging)
 */
export function getPresetTables(preset: RealtimePreset): readonly string[] {
  return REALTIME_PRESETS[preset];
}

export { REALTIME_PRESETS };

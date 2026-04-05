import 'server-only';

/**
 * Checks if a specific AI feature is enabled for the organization.
 * Now accepts a generic supabase-like shim (from server.ts) instead of SupabaseClient.
 */
export async function isAIFeatureEnabled(
  supabase: any,
  organizationId: string,
  key: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_feature_flags')
    .select('enabled')
    .eq('organization_id', organizationId)
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.warn('[ai/features] Failed to load feature flag; defaulting to enabled.', {
      key,
      message: error.message,
    });
    return true;
  }

  // Default: enabled when missing
  return data?.enabled !== false;
}

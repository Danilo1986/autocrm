/**
 * Migration stub - Supabase Admin Client for Tests
 *
 * Previously used @supabase/supabase-js for integration tests.
 * Now provides the same interface backed by Prisma shim.
 */
import { createStaticAdminClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClient: any = null;

type SupabaseResult<T> = {
  data: T | null;
  error: unknown | null;
};

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;
  adminClient = createStaticAdminClient();
  return adminClient;
}

export function assertNoSupabaseError(
  res: { error: unknown | null },
  context: string,
): void {
  if (!res.error) return;
  const details =
    typeof res.error === 'object'
      ? JSON.stringify(res.error, null, 2)
      : String(res.error);
  throw new Error(`Error (${context}): ${details}`);
}

export function requireSupabaseData<T>(res: SupabaseResult<T>, context: string): T {
  assertNoSupabaseError(res, context);
  if (res.data == null) {
    throw new Error(`No data returned (${context})`);
  }
  return res.data;
}

export async function withSupabaseRetry<T>(
  op: () => Promise<SupabaseResult<T>>,
  context: string,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<SupabaseResult<T>> {
  const retries = Math.max(0, opts?.retries ?? 2);
  const baseDelayMs = Math.max(10, opts?.baseDelayMs ?? 250);

  let last: SupabaseResult<T> | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await op();
    last = res;
    if (!res.error) return res;
    if (attempt === retries) return res;
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
  }

  return last ?? { data: null, error: new Error(`Retry failed (${context})`) };
}

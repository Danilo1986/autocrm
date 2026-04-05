import { loadEnvFile } from './helpers/env';
import { cleanupFixtures } from './helpers/fixtures';
import { getRunId } from './helpers/runId';

// Next.js server/client boundary helpers.
// In runtime do Next, `server-only` previne import acidental em Client Components.
// Em testes Node (Vitest), queremos que seja um no-op.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// Mock next-auth (requires next/server which is not available in vitest)
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: any) => children,
}));

vi.mock('@/lib/auth/auth', () => ({
  auth: async () => null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

/**
 * Test noise suppression (targeted).
 *
 * These are known noisy logs from third-party libs (Supabase) and from our
 * integration-style tests (expected 4xx on negative-path assertions).
 *
 * We DO NOT want these to pollute CI output; failures are still asserted by tests.
 */
const SUPPRESSED_CONSOLE_PATTERNS: RegExp[] = [
  /Multiple GoTrueClient instances detected/i,
  /\[supabase\]\s+Not configured - auth will not work/i,
];

const SUPPRESSED_STDERR_PATTERNS: RegExp[] = [
  // happy-dom/network logging style lines that are expected in negative-path tests
  /^GET https:\/\/.*\s406\s\(Not Acceptable\)\s*$/m,
  /^DELETE https:\/\/.*\s400\s\(Bad Request\)\s*$/m,
];

const originalConsoleLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const msg = args.map((a) => String(a)).join(' ');
  // Our tools log with "[AI] ..." — keep it opt-in during tests.
  if (msg.startsWith('[AI]')) return;
  originalConsoleLog(...args);
};

const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const msg = args.map((a) => String(a)).join(' ');
  if (SUPPRESSED_CONSOLE_PATTERNS.some((r) => r.test(msg))) return;
  originalConsoleWarn(...args);
};

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const msg = args.map((a) => String(a)).join(' ');
  if (SUPPRESSED_CONSOLE_PATTERNS.some((r) => r.test(msg))) return;
  originalConsoleError(...args);
};

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: any, ...rest: any[]) => {
  const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  if (SUPPRESSED_STDERR_PATTERNS.some((r) => r.test(text))) {
    return true;
  }
  return originalStderrWrite(chunk, ...rest);
}) as any;

// Prefer envs from THIS project folder so crmia-next can be moved to its own repo.
// (When running inside the monorepo, we keep the old root .env as a fallback.)
loadEnvFile(new URL('../.env', import.meta.url).pathname);
loadEnvFile(new URL('../.env.local', import.meta.url).pathname, { override: true });

// Monorepo fallback (no override)
loadEnvFile(new URL('../../.env', import.meta.url).pathname);
loadEnvFile(new URL('../../.env.local', import.meta.url).pathname);

// Best-effort cleanup: if a prior run crashed, make a quick attempt to remove leftovers.
// This won't block tests if cleanup fails (it can fail due to missing tables in dev).
beforeAll(async () => {
  const runId = getRunId('next-ai');
  try {
    await cleanupFixtures(runId);
  } catch {
    // ignore
  }
});

afterAll(async () => {
  const runId = getRunId('next-ai');
  try {
    await cleanupFixtures(runId);
  } catch {
    // ignore
  }
});

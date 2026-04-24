/** Per-host rate limiter. Default: 1 request / second / host. */
const REQUESTS_PER_SECOND = 1;
const MIN_GAP_MS = 1000 / REQUESTS_PER_SECOND;

const nextAllowedByHost = new Map<string, number>();

export async function rateLimit(host: string): Promise<void> {
  const now = Date.now();
  const next = nextAllowedByHost.get(host) ?? 0;
  if (next > now) {
    await new Promise((resolve) => setTimeout(resolve, next - now));
  }
  nextAllowedByHost.set(host, Math.max(now, next) + MIN_GAP_MS);
}

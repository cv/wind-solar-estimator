// Fetching with retries and backoff, shared by the Open-Meteo archive and Environment Canada
// clients. Each caller decides per attempt what counts as success, a retry or a failure.

import { sleep } from "../util/sleep.ts";

/** How many times to retry and how long to wait between attempts. */
export interface RetryPolicy {
  /** Retries after the first attempt. */
  maxRetries: number;
  /** Wait before retry k (0-based) is backoffMs × (k + 1), unless the reply gives Retry-After. */
  backoffMs: number;
  /** Aborts the wait between attempts. */
  signal: AbortSignal | undefined;
}

/** What one attempt produced: a value, or a request to try again (after the reply's Retry-After, if any). */
export type Attempt<T> = { done: true; value: T } | { done: false; res: Response | undefined };

export const succeeded = <T>(value: T): Attempt<T> => ({ done: true, value });

/** Try again; res, if given, may set the wait with a Retry-After header. */
export const tryAgain = <T>(res?: Response): Attempt<T> => ({ done: false, res });

/** A fetch that is abortable only when a signal is given. */
export const fetchOnce = async (url: string, signal: AbortSignal | undefined): Promise<Response> =>
  fetch(url, signal ? { signal } : {});

/** An error's message, or the thrown value as text. */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Milliseconds to wait before retry `attempt` (0-based): the reply's Retry-After seconds, else linear backoff. */
export function retryDelayMs(res: Response | undefined, attempt: number, backoffMs: number): number {
  const after = Number(res?.headers.get("retry-after"));
  return after > 0 ? after * 1000 : backoffMs * (attempt + 1);
}

/**
 * Runs tryOnce until it succeeds, waiting between attempts. tryOnce is told whether a retry is
 * still allowed, and must throw instead of asking for one when it isn't.
 */
export async function withRetries<T>(
  policy: RetryPolicy,
  tryOnce: (retryAllowed: boolean) => Promise<Attempt<T>>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
    const outcome = await tryOnce(attempt < policy.maxRetries);
    if (outcome.done) return outcome.value;
    // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
    await sleep(retryDelayMs(outcome.res, attempt, policy.backoffMs), policy.signal);
  }
}

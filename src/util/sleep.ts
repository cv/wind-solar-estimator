// A pause that ends early, rejecting, when its AbortSignal fires.

/** Resolves after ms; rejects with the signal's reason (an Error) if it is aborted first. */
export const sleep = async (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        const reason: unknown = signal.reason;
        // Abort reasons are DOMExceptions (Errors) unless abort() was given something else.
        reject(reason instanceof Error ? reason : new Error(String(reason), { cause: reason }));
      },
      { once: true },
    );
  });

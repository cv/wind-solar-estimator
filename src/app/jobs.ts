// Background work after a report is shown: jobs run one per task after a pause, so the page stays
// responsive, and stop as soon as their analysis is superseded.

/** Pause after the last change before background runs start. */
export const JOBS_PAUSE_MS = 300;

/** Runs jobs one per task, the first after pause ms, while isCurrent(); returns a function that cancels the rest. */
export function runJobs(jobs: ReadonlyArray<() => void>, isCurrent: () => boolean, pause: number): () => void {
  let k = 0;
  let handle: ReturnType<typeof setTimeout> | undefined;
  const step = (): void => {
    const job = jobs[k];
    if (!isCurrent() || job === undefined) return;
    job();
    k++;
    handle = setTimeout(step, 0);
  };
  handle = setTimeout(step, pause);
  return () => {
    clearTimeout(handle);
  };
}

// Picks the measuring station "auto" uses, weighing distance, elevation difference and record length.

/**
 * How "auto" weighs a station's drawbacks against distance when picking one: 100 m of
 * elevation difference counts like 10 km, and each year of the period the station's
 * record doesn't cover counts like 2 km. A hilltop station 18 km away then loses to one
 * on the same plain 18 km away, and of several stations in one town the one whose record
 * spans the period wins.
 */
/** What stationScore needs from a station: distance from the site and elevation difference (m, NaN or absent if unknown). */
export interface Candidate {
  distanceKm: number;
  rise?: number;
}

export const KM_PER_METRE_RISE = 0.1;
export const KM_PER_MISSING_YEAR = 2;
export const stationScore = (s: Candidate, missingYears = 0): number =>
  s.distanceKm +
  (s.rise !== undefined && Number.isFinite(s.rise) ? Math.abs(s.rise) * KM_PER_METRE_RISE : 0) +
  Math.max(0, missingYears) * KM_PER_MISSING_YEAR;

/** The station "auto" picks: lowest score among those that pass ok(s); missing(s) = years of the period it lacks. */
export function pickStation<T extends Candidate>(
  list: readonly T[],
  ok: (s: NoInfer<T>) => boolean,
  missing: (s: NoInfer<T>) => number = () => 0,
): T | null {
  let best: T | null = null,
    bestScore = Infinity;
  for (const s of list) {
    if (!ok(s)) continue;
    const score = stationScore(s, missing(s));
    if (score < bestScore) [best, bestScore] = [s, score];
  }
  return best;
}

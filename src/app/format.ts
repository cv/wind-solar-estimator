// Text formatting: HTML escaping, numbers, percentages, money and year spans.
import { analysis } from "./state.ts";

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const esc = (s: string | number): string =>
  String(s).replaceAll(/[&<>"']/gu, (c) => {
    // The pattern only matches characters with an entity.
    const e = ENTITIES[c];
    if (e === undefined) throw new Error(`no entity for ${c}`);
    return e;
  });
export const fmt = (x: number, d = 0): string =>
  Number.isFinite(x) ? x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
export const pct = (x: number, d = 0): string => `${fmt(x * 100, d)}%`;
/** A ratio such as "1.7×" (one decimal below 10), so a curve 1.7× the limit never reads as 2×. */
export const times = (x: number): string => `${fmt(x, x < 10 ? 1 : 0)}×`;
/** A wind speed in km/h, with its decimal when it has one (edited curves can sit at 20.5 km/h). */
export const speed = (v: number): string => fmt(v, Number.isInteger(v) ? 0 : 1);
export const money = (x: number, d = 0): string =>
  Number.isFinite(x) ? `${x < 0 ? "−" : ""}${analysis().params.currency}${fmt(Math.abs(x), d)}` : "—";

/** The number text spells, or 0 when it isn't one (NaN), like `Number(text) || 0`. */
export function numberOrZero(text: string): number {
  const n = Number(text);
  return Number.isNaN(n) ? 0 : n;
}

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const span = (a: number, b: number): string => (a === b ? String(a) : `${a}–${b}`);

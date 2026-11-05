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
export const money = (x: number, d = 0): string =>
  Number.isFinite(x) ? `${x < 0 ? "−" : ""}${analysis().params.currency}${fmt(Math.abs(x), d)}` : "—";

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const span = (a: number, b: number): string => (a === b ? String(a) : `${a}–${b}`);

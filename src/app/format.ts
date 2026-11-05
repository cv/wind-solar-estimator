// @ts-nocheck -- typed in the first strictness round, after this file is split up
// Text formatting: HTML escaping, numbers, percentages, money and year spans.
import { state } from "./state.ts";

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const fmt = (x, d = 0) =>
  Number.isFinite(x) ? x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
export const pct = (x, d = 0) => `${fmt(x * 100, d)}%`;
export const money = (x, d = 0) =>
  Number.isFinite(x) ? `${x < 0 ? "−" : ""}${state.params.currency}${fmt(Math.abs(x), d)}` : "—";

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const span = (a, b) => (a === b ? String(a) : `${a}–${b}`);

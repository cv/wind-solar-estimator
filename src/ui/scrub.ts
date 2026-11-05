// Numbers in the report that the reader drags sideways (or steps with the arrow keys) to change
// the field they show, the report following as they go. The report re-renders on every change,
// replacing the number being dragged, so the drag lives on the window and focus is restored.
import { SCRUB, isScrubField } from "../app/constants.ts";
import type { ScrubField } from "../app/constants.ts";
import { $, form } from "../app/dom.ts";
import { hooks } from "../app/hooks.ts";

interface Drag {
  field: ScrubField;
  start: number;
  x0: number;
  pointerId: number;
}

let drag: Drag | null = null;
/** The field whose number has keyboard focus, to give focus back after a re-render. */
let focused: ScrubField | null = null;

const decimals = (step: number): number => (String(step).split(".")[1] ?? "").length;

function fieldOf(target: EventTarget | null): ScrubField | null {
  const el = target instanceof Element ? target.closest(".scrub") : null;
  const field = el instanceof HTMLElement ? el.dataset["field"] : undefined;
  return field !== undefined && isScrubField(field) ? field : null;
}

function valueOf(field: ScrubField): number {
  const n = Number(form.elements[field].value);
  return Number.isFinite(n) ? n : SCRUB[field].min;
}

/** Sets the field to x (clamped to its bounds, at its step's precision) and re-runs the report at once. */
function setValue(field: ScrubField, x: number): void {
  const s = SCRUB[field];
  const text = String(Number(Math.min(s.max, Math.max(s.min, x)).toFixed(decimals(s.step))));
  const el = form.elements[field];
  if (text === el.value) return;
  el.value = text;
  hooks.onChange(field, { live: true });
}

function onDown(e: PointerEvent): void {
  const field = fieldOf(e.target);
  if (field === null || e.button !== 0) return;
  drag = { field, start: valueOf(field), x0: e.clientX, pointerId: e.pointerId };
  document.documentElement.classList.add("scrubbing");
  markActive();
  e.preventDefault(); // no text selection
}

function onMove(e: PointerEvent): void {
  if (drag?.pointerId !== e.pointerId) return;
  const s = SCRUB[drag.field];
  setValue(drag.field, drag.start + Math.trunc((e.clientX - drag.x0) / s.px) * s.step);
}

function onUp(e: PointerEvent): void {
  if (drag?.pointerId !== e.pointerId) return;
  drag = null;
  document.documentElement.classList.remove("scrubbing");
  markActive();
}

/** Arrows step the value (Shift or Page Up/Down: ten steps); Home and End go to its bounds. */
function onKey(e: KeyboardEvent): void {
  const field = fieldOf(e.target);
  if (field === null) return;
  const s = SCRUB[field];
  const v = valueOf(field);
  const step = s.step * (e.shiftKey ? 10 : 1);
  const next: Partial<Record<string, number>> = {
    ArrowRight: v + step,
    ArrowUp: v + step,
    ArrowLeft: v - step,
    ArrowDown: v - step,
    PageUp: v + s.step * 10,
    PageDown: v - s.step * 10,
    Home: s.min,
    End: s.max,
  };
  const x = next[e.key];
  if (x === undefined) return;
  e.preventDefault();
  focused = field;
  setValue(field, x);
}

/** Highlights the number being dragged (it's a new element after every re-render). */
function markActive(): void {
  for (const el of document.querySelectorAll(".scrub.active")) el.classList.remove("active");
  if (drag) document.querySelector(`.scrub[data-field="${drag.field}"]`)?.classList.add("active");
}

/** After a re-render: keep the highlight, and give focus back to the number that had it. */
function afterRender(): void {
  markActive();
  const active = document.activeElement;
  if (focused === null || (active !== null && active !== document.body)) return;
  const el = document.querySelector(`.scrub[data-field="${focused}"]`);
  if (el instanceof HTMLElement) el.focus();
}

export function initScrub(): void {
  const results = $("#results");
  results.addEventListener("pointerdown", onDown);
  results.addEventListener("keydown", onKey);
  globalThis.addEventListener("pointermove", onMove);
  globalThis.addEventListener("pointerup", onUp);
  globalThis.addEventListener("pointercancel", onUp);
  document.addEventListener("focusin", (e) => {
    focused = fieldOf(e.target);
  });
  new MutationObserver(afterRender).observe(results, { childList: true, subtree: true });
}

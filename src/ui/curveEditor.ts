// The power curve editor in the Wind turbines group: the curve drawn against the physical (Betz)
// limit for the capture area, with points to drag, add and remove. It writes the curve text area
// and reports each change through hooks, like any other field.
import { $, form } from "../app/dom.ts";
import { enteredCaptureArea } from "../app/form.ts";
import { fmt, pct, times } from "../app/format.ts";
import { hooks } from "../app/hooks.ts";
import { formatCurve, insertPoint, movePoint, parseCurve, removePoint } from "../model/powerCurve.ts";
import type { CurvePoint } from "../model/powerCurve.ts";
import { at } from "../util/checked.ts";
import { createCurveChart, curveRanges, drawCurveChart, limitKw, roundTo, wattStep } from "./curveChart.ts";
import type { CurveChart, CurveView } from "./curveChart.ts";

/** A point being dragged: where the drag started, so a vertical drag keeps the point's speed. */
interface Drag {
  index: number;
  pointerId: number;
  startKmh: number;
  startValueX: number;
  startPx: number;
}

/** The editor: what the chart shows (axis ranges fixed during a drag, so it never moves under the pointer), and the drag. */
interface Editor extends CurveView {
  chart: CurveChart | null;
  drag: Drag | null;
  /** Why the text can't be drawn ("" when it can): editing by hand is then off. */
  error: string;
}

const ed: Editor = { chart: null, pts: [], limitArea: 0, xMax: 40, yMax: 4, active: null, drag: null, error: "" };

const HIT_PX = 12;
const HIT_PX_TOUCH = 22;
/** Pointer travel (px) before a drag moves a point sideways. */
const SIDEWAYS_PX = 6;
const HINT = "Drag a point to change the curve. Double-click to add a point, or on a point to remove it.";

/** Fits the axes to the curve. */
function rescale(): void {
  if (ed.pts.length > 0) Object.assign(ed, curveRanges(ed.pts));
}

function redraw(): void {
  if (ed.chart) drawCurveChart(ed.chart, ed, ed.error !== "");
}

function pointText([v, w]: CurvePoint): string {
  const power = w < 1000 ? `${fmt(w)} W` : `${fmt(w / 1000, 2)} kW`;
  if (ed.limitArea <= 0 || v <= 0) return `${fmt(v, 1)} km/h: ${power}.`;
  const ratio = w / 1000 / limitKw(v, ed.limitArea);
  return ratio > 1
    ? `${fmt(v, 1)} km/h: ${power}, ${times(ratio)} the physical limit. No device this size can do that.`
    : `${fmt(v, 1)} km/h: ${power}, ${pct(ratio)} of the physical limit.`;
}

function readout(): void {
  const p = ed.active === null ? undefined : ed.pts[ed.active];
  let text = p ? pointText(p) : HINT;
  if (ed.error !== "") text = ed.error;
  $("#curveReadout").textContent = text;
}

function setActive(i: number | null): void {
  if (i === ed.active) return;
  ed.active = i;
  redraw();
  readout();
}

/** Puts an edited curve in the text area and tells the app, as typing there would. */
function commit(pts: CurvePoint[], { refit }: { refit: boolean }): void {
  const text = formatCurve(pts);
  ed.pts = pts;
  if (refit) rescale();
  if (text !== form.elements.curve.value) {
    form.elements.curve.value = text;
    hooks.onChange("curve");
  }
  redraw();
  readout();
}

/** The pointer's position on the canvas in CSS pixels (from client coordinates, which every event has right). */
function pos(e: MouseEvent): { px: number; py: number } {
  const r = (e.currentTarget instanceof Element ? e.currentTarget : document.body).getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}

/** The pointer's position in chart values (km/h, W), or null off the axes. */
function valueAt(e: MouseEvent): { v: number; w: number } | null {
  const x = ed.chart?.scales["x"],
    y = ed.chart?.scales["y"];
  const v = x?.getValueForPixel(pos(e).px),
    kw = y?.getValueForPixel(pos(e).py);
  return v === undefined || kw === undefined ? null : { v, w: kw * 1000 };
}

/** The point within slop pixels of the pointer, nearest first. */
function hit(e: MouseEvent, slop: number): number | null {
  const x = ed.chart?.scales["x"],
    y = ed.chart?.scales["y"];
  if (!x || !y) return null;
  let best: number | null = null;
  let bestD = slop;
  for (const [i, [v, w]] of ed.pts.entries()) {
    if (v > ed.xMax) continue;
    const d = Math.hypot(x.getPixelForValue(v) - pos(e).px, y.getPixelForValue(w / 1000) - pos(e).py);
    if (d <= bestD) [best, bestD] = [i, d];
  }
  return best;
}

function onDown(e: PointerEvent): void {
  const c = ed.chart;
  if (!c || ed.error !== "" || e.button !== 0) return;
  const i = hit(e, e.pointerType === "touch" ? HIT_PX_TOUCH : HIT_PX);
  const p = valueAt(e);
  if (i === null || !p) return;
  c.canvas.setPointerCapture(e.pointerId);
  ed.drag = { index: i, pointerId: e.pointerId, startKmh: at(ed.pts, i)[0], startValueX: p.v, startPx: pos(e).px };
  c.canvas.style.cursor = "grabbing";
  setActive(i);
  e.preventDefault();
}

function onMove(e: PointerEvent): void {
  const d = ed.drag;
  if (d?.pointerId !== e.pointerId) {
    if (ed.error !== "" || !ed.chart) return;
    const i = hit(e, e.pointerType === "touch" ? HIT_PX_TOUCH : HIT_PX);
    ed.chart.canvas.style.cursor = i === null ? "crosshair" : "grab";
    setActive(i);
    return;
  }
  const p = valueAt(e);
  if (!p) return;
  // Sideways in 0.5 km/h steps, and only past a few pixels, so dragging a point up or down keeps its speed.
  const sideways = Math.abs(pos(e).px - d.startPx) < SIDEWAYS_PX ? 0 : Math.round((p.v - d.startValueX) * 2) / 2;
  const w = roundTo(Math.min(ed.yMax * 1000, p.w), wattStep(ed.yMax));
  commit(movePoint(ed.pts, d.index, d.startKmh + sideways, w), { refit: false });
}

function onUp(e: PointerEvent): void {
  if (ed.drag?.pointerId !== e.pointerId || !ed.chart) return;
  ed.drag = null;
  ed.chart.canvas.style.cursor = "grab";
  commit(ed.pts, { refit: true }); // room to drag further next time
}

function onDoubleClick(e: MouseEvent): void {
  if (ed.error !== "") return;
  const i = hit(e, HIT_PX);
  if (i !== null) {
    ed.active = null;
    commit(removePoint(ed.pts, i), { refit: true });
    return;
  }
  const p = valueAt(e);
  if (p)
    commit(insertPoint(ed.pts, Math.round(p.v * 2) / 2, roundTo(Math.max(0, p.w), wattStep(ed.yMax))), { refit: true });
}

/** Left and right pick a point; up and down change its output (Shift: ten steps); Delete removes it. */
function onKey(e: KeyboardEvent): void {
  const n = ed.pts.length;
  if (n === 0 || ed.error !== "") return;
  const i = ed.active;
  switch (e.key) {
    case "ArrowRight":
      setActive(Math.min(n - 1, (i ?? -1) + 1));
      break;
    case "ArrowLeft":
      setActive(Math.max(0, (i ?? n) - 1));
      break;
    case "ArrowUp":
    case "ArrowDown": {
      const k = i ?? 0;
      const [v, w] = at(ed.pts, k);
      const step = wattStep(ed.yMax) * (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
      ed.active = k;
      commit(movePoint(ed.pts, k, v, roundTo(w + step, wattStep(ed.yMax))), { refit: true });
      break;
    }
    case "Delete":
    case "Backspace":
      if (i === null) return;
      commit(removePoint(ed.pts, i), { refit: true });
      setActive(Math.min(i, ed.pts.length - 1));
      break;
    default:
      return;
  }
  e.preventDefault();
}

/** Redraws the editor from the curve text, capture area and duct augmentation (not during a drag). */
export function syncCurveEditor(): void {
  if (ed.drag) return;
  const area = enteredCaptureArea();
  const aug = Number(form.elements.augmentation.value);
  ed.limitArea = Number.isFinite(area) && area > 0 ? area * (Number.isFinite(aug) && aug >= 1 ? aug : 1) : 0;
  try {
    ed.pts = parseCurve(form.elements.curve.value);
    ed.error = "";
  } catch (e: unknown) {
    ed.error = `${e instanceof Error ? e.message : String(e)}. Fix the text below to edit the curve here.`;
  }
  if (ed.active !== null && ed.active >= ed.pts.length) ed.active = null;
  rescale();
  redraw();
  readout();
}

export function initCurveEditor(): void {
  const canvas = $("#curveEditor", HTMLCanvasElement);
  if (typeof Chart === "undefined") {
    canvas.parentElement?.setAttribute("hidden", "");
    return;
  }
  ed.chart = createCurveChart(canvas, ed);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", () => {
    if (!ed.drag) setActive(null);
  });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("blur", () => setActive(null));
  syncCurveEditor();
}

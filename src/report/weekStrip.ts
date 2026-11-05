// The strip of weeks: a row per year, a square per week, darker when the turbines made more, with
// the week shown outlined. Drawn on a plain canvas (a thousand squares need no chart library).
import { COLORS } from "../app/constants.ts";
import type { Week } from "../model/hours.ts";

const LABEL_W = 38;
const ROW_H = 11;
const AXIS_H = 16;
const GAP = 1;
/** Squares run from this pale blue (calm) to Wind Blue (the windiest week). */
const CALM: readonly [number, number, number] = [236, 242, 249];
const WINDY: readonly [number, number, number] = [31, 119, 180];

/** Where the last drawing put the rows and columns, for finding the week under the pointer. */
let layout: { years: number[]; cell: number } = { years: [], cell: 1 };

const shade = (t: number): string => {
  const c = CALM.map((v, k) => Math.round(v + ((WINDY[k] ?? v) - v) * Math.min(1, Math.max(0, t))));
  return `rgb(${c.join(",")})`;
};

/** Year labels down the left (first, last and every fifth) and season marks along the bottom. */
function drawLabels(ctx: CanvasRenderingContext2D, years: readonly number[], cell: number): void {
  ctx.fillStyle = "#5b6475";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const [row, y] of years.entries())
    if (row === 0 || row === years.length - 1 || y % 5 === 0)
      ctx.fillText(String(y), LABEL_W - 5, row * ROW_H + ROW_H / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const [label, week] of [
    ["Jan", 0],
    ["Apr", 13],
    ["Jul", 26],
    ["Oct", 39],
  ] as const)
    ctx.fillText(label, LABEL_W + week * cell, years.length * ROW_H + 3);
}

/** Draws the weeks across the canvas's width, with selected outlined. */
export function drawStrip(canvas: HTMLCanvasElement, weeks: readonly Week[], selected: Week): void {
  const years = [...new Set(weeks.map((w) => w.year))];
  const cols = Math.max(...weeks.map((w) => w.week)) + 1;
  const width = canvas.clientWidth;
  const cell = Math.max(3, (width - LABEL_W) / cols);
  const height = years.length * ROW_H + AXIS_H;
  canvas.style.height = `${height}px`;
  const dpr = devicePixelRatio;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  // By energy per hour, so a year's longer last week doesn't stand out.
  const peak = Math.max(...weeks.map((w) => w.windKwh / w.hours));
  for (const w of weeks) {
    ctx.fillStyle = shade(peak > 0 ? w.windKwh / w.hours / peak : 0);
    ctx.fillRect(LABEL_W + w.week * cell, years.indexOf(w.year) * ROW_H, cell - GAP, ROW_H - GAP);
  }
  ctx.strokeStyle = "#172033";
  ctx.lineWidth = 2;
  ctx.strokeRect(LABEL_W + selected.week * cell - 1, years.indexOf(selected.year) * ROW_H - 1, cell + 1, ROW_H + 1);
  ctx.font = `11px ${getComputedStyle(canvas).fontFamily}`;
  drawLabels(ctx, years, cell);
  layout = { years, cell };
  canvas.dataset["accent"] = COLORS.wind;
}

/** The week at (x, y) in CSS pixels on the strip last drawn, or undefined. */
export function stripWeekAt(weeks: readonly Week[], x: number, y: number): Week | undefined {
  const year = layout.years[Math.floor(y / ROW_H)];
  const col = Math.floor((x - LABEL_W) / layout.cell);
  return year === undefined || col < 0 ? undefined : weeks.find((w) => w.year === year && w.week === col);
}

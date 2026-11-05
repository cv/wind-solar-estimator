// "Hour by hour": every week of the record as a strip (darker: windier) and the chosen week hour
// by hour, so the averages above can be checked against real weather. It opens on the week that
// needed most from the grid; the choice is kept as the inputs change.
import { COLORS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { fmt } from "../app/format.ts";
import { state } from "../app/state.ts";
import type { Analysis } from "../app/state.ts";
import { f32, u8 } from "../model/checkedArrays.ts";
import { tellingWeeks } from "../model/hours.ts";
import type { TellingWeeks, Week } from "../model/hours.ts";
import type { HourRecord } from "../model/simulate.ts";
import { axis, drawChart, legendLabels } from "./chartKit.ts";
import { drawStrip, stripWeekAt } from "./weekStrip.ts";

type PickName = keyof TellingWeeks;
const PICKS: readonly PickName[] = ["hardest", "calmest", "windiest"];
const isPick = (s: string | undefined): s is PickName => PICKS.some((p) => p === s);
const PICK_TEXT: Record<PickName, string> = {
  hardest: "The week that needed most from the grid.",
  calmest: "The calmest week in the record for the turbines.",
  windiest: "The windiest week in the record.",
};

/** The first hour of the week shown (null: the hardest). */
let shownStart: number | null = null;
let wired = false;

const weeksNow = (): readonly Week[] => state.analysis?.hours?.weeks ?? [];
const shownWeek = (weeks: readonly Week[], t: TellingWeeks | null): Week | undefined =>
  weeks.find((w) => w.start === shownStart) ?? t?.hardest ?? weeks[0];

function show(w: Week | undefined): void {
  if (!w) return;
  shownStart = w.start;
  if (state.analysis) renderHours(state.analysis);
}

/** The week delta weeks on (or, by year, the same week delta years on). */
function move(delta: number, byYear: boolean): void {
  const weeks = weeksNow();
  const w = shownWeek(weeks, tellingWeeks(weeks));
  if (!w) return;
  show(byYear ? weeks.find((x) => x.year === w.year + delta && x.week === w.week) : weeks[weeks.indexOf(w) + delta]);
}

function pick(what: string | undefined): void {
  if (what === "prev" || what === "next") {
    move(what === "prev" ? -1 : 1, false);
    return;
  }
  const t = tellingWeeks(weeksNow());
  if (t && isPick(what)) show(t[what]);
}

const KEY_MOVES: Partial<Record<string, [number, boolean]>> = {
  ArrowLeft: [-1, false],
  ArrowRight: [1, false],
  ArrowUp: [-1, true],
  ArrowDown: [1, true],
};

function wire(): void {
  if (wired) return;
  wired = true;
  const strip = $("#weekStrip", HTMLCanvasElement);
  strip.addEventListener("click", (e) => {
    const r = strip.getBoundingClientRect();
    show(stripWeekAt(weeksNow(), e.clientX - r.left, e.clientY - r.top));
  });
  strip.addEventListener("keydown", (e) => {
    const m = KEY_MOVES[e.key];
    if (!m) return;
    e.preventDefault();
    move(...m);
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-pick]"))
    b.addEventListener("click", () => pick(b.dataset["pick"]));
  // The strip is drawn to its width, so it is drawn again when that changes (and for print).
  new ResizeObserver(() => {
    const weeks = weeksNow();
    const w = shownWeek(weeks, tellingWeeks(weeks));
    if (w) drawStrip(strip, weeks, w);
  }).observe(strip);
}

/**
 * Hours the record's local time is ahead of UTC: its years, months and hours are local standard
 * time (UTC plus a fixed offset), so dates are read the same way rather than through the time zone.
 */
function localOffsetHours(a: Analysis): number {
  const t0 = a.wx.t[0] ?? 0;
  return ((((u8(a.wx.hour, 0) - (t0 % 24)) % 24) + 36) % 24) - 12;
}

/** The hour's local date (and time) as text. */
const hourText = (a: Analysis, i: number, opts: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" }).format(
    ((a.wx.t[i] ?? 0) + localOffsetHours(a)) * 3.6e6,
  );
const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

function weekText(a: Analysis, w: Week, t: TellingWeeks | null): string {
  const range = `${hourText(a, w.start, DAY)} to ${hourText(a, w.start + w.hours - 1, DAY)}, ${w.year}`;
  const which = PICKS.find((k) => t?.[k] === w);
  const note = which === undefined ? "" : ` ${PICK_TEXT[which]}`;
  return `${range}: the turbines made ${fmt(w.windKwh)} kWh and the panels ${fmt(w.pvKwh)} kWh; the site used ${fmt(w.loadKwh)} kWh and bought ${fmt(w.importKwh)} kWh from the grid.${batteryNote(a, w)}${note}`;
}

/** " The battery sat empty …" when it spent nearly all the week at its minimum charge ("" otherwise). */
function batteryNote(a: Analysis, w: Week): string {
  const { battKwh, battMinSoc } = a.params;
  const soc = a.hours?.rec.soc;
  if (battKwh <= 0 || !soc) return "";
  const floor = battKwh * battMinSoc + battKwh * 0.01;
  let empty = 0;
  for (let i = w.start; i < w.start + w.hours; i++) if (f32(soc, i) <= floor) empty++;
  return empty / w.hours >= 0.9
    ? " The battery sat at its minimum charge for nearly all of it: there was no surplus to fill it."
    : "";
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

function drawWeek(a: Analysis, rec: HourRecord, w: Week): void {
  const idx = Array.from({ length: w.hours }, (_, k) => w.start + k);
  const series = (arr: Float32Array): number[] => idx.map((i) => round2(f32(arr, i)));
  const batt = a.params.battKwh;
  const line = { pointRadius: 0, borderWidth: 1.5 };
  drawChart("chWeek", {
    type: "line",
    data: {
      labels: idx.map((i) => hourText(a, i, { ...DAY, hour: "numeric", hourCycle: "h23" })),
      datasets: [
        {
          ...line,
          label: "Wind",
          data: series(rec.wind),
          borderColor: COLORS.wind,
          backgroundColor: "rgba(31,119,180,0.35)",
          fill: "origin",
          stack: "made",
        },
        {
          ...line,
          label: "Solar",
          data: series(rec.pv),
          borderColor: COLORS.solar,
          backgroundColor: "rgba(242,169,0,0.35)",
          fill: "-1",
          stack: "made",
        },
        { ...line, label: "Electricity use", data: series(rec.load), borderColor: COLORS.load, stack: "use" },
        {
          ...line,
          label: "Bought from the grid",
          data: idx.map((i) => round2(Math.max(0, f32(rec.grid, i)))),
          borderColor: COLORS.grey,
          backgroundColor: "rgba(154,163,181,0.3)",
          fill: "origin",
          stack: "grid",
        },
        ...(batt > 0
          ? [
              {
                ...line,
                label: "Battery charge",
                data: idx.map((i) => Math.round((100 * f32(rec.soc, i)) / batt)),
                borderColor: "#2e7d32",
                borderDash: [4, 3],
                yAxisID: "y2",
                stack: "battery",
              },
            ]
          : []),
      ],
    },
    options: {
      plugins: {
        legend: { labels: legendLabels },
        tooltip: {
          callbacks: {
            label: (c) =>
              `${c.dataset.label ?? ""}: ${c.dataset.yAxisID === "y2" ? `${fmt(c.parsed.y)}%` : `${fmt(c.parsed.y, 2)} kW`}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: (c) => (u8(a.wx.hour, idx[c.index] ?? 0) === 0 ? "rgba(23,32,51,0.12)" : "transparent") },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback: (_v, k) => {
              const i = idx[k];
              return i !== undefined && u8(a.wx.hour, i) === 12 ? hourText(a, i, DAY) : "";
            },
          },
        },
        y: axis("kW (average over the hour)", { stacked: true, min: 0 }),
        ...(batt > 0
          ? {
              y2: axis("Battery charge (%)", {
                position: "right" as const,
                min: 0,
                max: 100,
                grid: { drawOnChartArea: false },
              }),
            }
          : {}),
      },
    },
  });
}

/** Shows the week chosen (or the hardest) once the hours are worked out; until then any earlier one stays, faded. */
export function renderHours(a: Analysis): void {
  wire();
  const h = a.hours;
  $("#hoursCard").classList.toggle("pending", h === null);
  if (!h) return;
  const t = tellingWeeks(h.weeks);
  const w = shownWeek(h.weeks, t);
  if (!w) return;
  $("#hours").hidden = false;
  $("#hoursText").textContent = weekText(a, w, t);
  drawStrip($("#weekStrip", HTMLCanvasElement), h.weeks, w);
  drawWeek(a, h.rec, w);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-pick]")) {
    const k = b.dataset["pick"];
    if (isPick(k)) b.setAttribute("aria-pressed", String(t?.[k] === w));
  }
}

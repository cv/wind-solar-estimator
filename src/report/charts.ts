// @ts-nocheck -- typed in the first strictness round, after this file is split up
// Chart.js charts: wind distribution, monthly energy, imports, battery charge, yearly wind and power curve.
import { MONTHS, COLORS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { fmt } from "../app/format.ts";
import { state } from "../app/state.ts";
import { betzLimitW } from "../model/physics.ts";
import { makeCurveFn } from "../model/powerCurve.ts";

// Legend keys match the marks: a swatch for bars, a short line (dashed if the series is) for lines.
export const legendLabels = {
  usePointStyle: true,
  boxHeight: 8,
  pointStyleWidth: 16,
  generateLabels(chart) {
    return Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item) => {
      const ds = chart.data.datasets[item.datasetIndex];
      return (ds.type || chart.config.type) === "line"
        ? { ...item, pointStyle: "line", strokeStyle: ds.borderColor, lineWidth: 2.5 }
        : { ...item, pointStyle: "rect", lineWidth: 0 };
    });
  },
};

export function drawChart(id, config) {
  if (typeof Chart === "undefined") return;
  state.charts[id]?.destroy();
  state.charts[id] = new Chart(document.getElementById(id), {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: legendLabels }, ...config.options?.plugins },
      ...config.options,
    },
  });
}

export const axis = (title, extra = {}) => ({ title: { display: true, text: title }, ...extra });

export function renderCharts(r, p) {
  // Wind speed distribution and energy by speed
  let last = r.hist.hours.length - 1;
  while (last > 0 && r.hist.hours[last] < 1 && r.hist.energy[last] < 1) last--;
  const bins = r.hist.hours.slice(0, last + 1).map((_, i) => `${i * r.hist.binKmh}`);
  drawChart("chDist", {
    data: {
      labels: bins,
      datasets: [
        {
          type: "bar",
          label: "Hours per year",
          data: r.hist.hours.slice(0, last + 1).map((x) => Math.round(x)),
          backgroundColor: "rgba(31,119,180,0.35)",
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Wind energy (kWh/yr)",
          data: r.hist.energy.slice(0, last + 1).map((x) => Math.round(x)),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      scales: {
        x: axis(`Wind speed at hub, km/h (${r.hist.binKmh} km/h bins)`),
        y: axis("Hours per year", { beginAtZero: true }),
        y1: axis("kWh per year", { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } }),
      },
    },
  });

  const round = (a) => a.map((x) => Math.round(x));
  drawChart("chMonthly", {
    data: {
      labels: MONTHS,
      datasets: [
        { type: "bar", label: "Wind", data: round(r.monthly.wind), backgroundColor: COLORS.wind, stack: "gen" },
        { type: "bar", label: "Solar", data: round(r.monthly.pv), backgroundColor: COLORS.solar, stack: "gen" },
        {
          type: "line",
          label: "Electricity use",
          data: round(r.monthly.load),
          borderColor: COLORS.load,
          backgroundColor: COLORS.load,
          pointRadius: 2,
        },
      ],
    },
    options: { scales: { x: { stacked: true }, y: axis("kWh per month", { stacked: true, beginAtZero: true }) } },
  });

  drawChart("chImport", {
    type: "bar",
    data: {
      labels: MONTHS,
      datasets: [
        { label: "Solar + battery only", data: round(r.monthly.importPv), backgroundColor: COLORS.grey },
        { label: "With wind", data: round(r.monthly.importBoth), backgroundColor: COLORS.wind },
      ],
    },
    options: { scales: { y: axis("kWh bought per month", { beginAtZero: true }) } },
  });

  renderSoc();

  const mean = r.windKwh;
  drawChart("chYearly", {
    data: {
      labels: r.yearly.map((y) => String(y.year)),
      datasets: [
        {
          type: "bar",
          label: "Wind energy",
          data: r.yearly.map((y) => Math.round(y.kwh)),
          backgroundColor: COLORS.wind,
        },
        {
          type: "line",
          label: "Average",
          data: r.yearly.map(() => Math.round(mean)),
          borderColor: COLORS.load,
          borderDash: [5, 4],
          pointRadius: 0,
        },
      ],
    },
    options: { scales: { y: axis("kWh per year", { beginAtZero: true }) } },
  });

  const curve = makeCurveFn(p.curvePts);
  const speeds = Array.from({ length: 61 }, (_, i) => i);
  const positive = (x) => (x > 0 ? x : null);
  drawChart("chCurve", {
    type: "line",
    data: {
      labels: speeds.map(String),
      datasets: [
        {
          label: "Entered power curve (W)",
          data: speeds.map((s) => positive(curve(s))),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: 0,
        },
        {
          label: `Physical limit, ${fmt(p.captureAreaM2, p.captureAreaM2 < 10 ? 2 : 1)} m²${p.augmentation > 1 ? ` ×${fmt(p.augmentation, 1)}` : ""} (W)`,
          data: speeds.map((s) => positive(betzLimitW(s, p.captureAreaM2) * p.augmentation)),
          borderColor: COLORS.limit,
          backgroundColor: COLORS.limit,
          borderDash: [6, 4],
          pointRadius: 0,
        },
      ],
    },
    options: {
      scales: {
        x: axis("Wind speed (km/h)", { ticks: { maxTicksLimit: 13 } }),
        y: axis("Watts (log scale)", {
          type: "logarithmic",
          min: 0.1,
          ticks: {
            callback: (v) =>
              [0.1, 1, 10, 100, 1000, 10000, 100000].includes(v) ? (v >= 1000 ? `${v / 1000}k` : String(v)) : "",
          },
        }),
      },
    },
  });
}

export function renderSoc() {
  const r = state.result;
  if (!r) return;
  const mo = Number($("#socMonth").value) || 0;
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  const asPct = (a) => a.map((x) => (x == null ? null : Math.round(x * 1000) / 10));
  drawChart("chSoc", {
    type: "line",
    data: {
      labels: hours,
      datasets: [
        {
          label: "With wind",
          data: asPct(r.socDay.withWind[mo]),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: "Without wind",
          data: asPct(r.socDay.pvOnly[mo]),
          borderColor: COLORS.grey,
          backgroundColor: COLORS.grey,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: "Minimum charge",
          data: hours.map(() => state.params.battMinSoc * 100),
          borderColor: COLORS.limit,
          borderWidth: 1,
          borderDash: [2, 3],
          pointRadius: 0,
        },
      ],
    },
    options: {
      scales: {
        y: axis("Battery charge (%)", { min: 0, max: 100 }),
        x: axis("Hour of day", { ticks: { maxTicksLimit: 8 } }),
      },
    },
  });
}

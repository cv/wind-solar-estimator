// CSV download of the report.
import { readForm } from "../app/form.ts";
import { analysis, state } from "../app/state.ts";
import { assumptionRows, monthlyRows } from "./tables.ts";

/** One CSV cell: numbers rounded to 2 decimals, everything else quoted. */
const q = (c: string | number): string =>
  typeof c === "number" ? String(Math.round(c * 100) / 100) : `"${c.replace(/"/g, '""')}"`;

export function downloadCsv(): void {
  if (!state.result) return; // nothing analysed yet
  const { result: r, params: p, req, wx } = analysis();
  const { head, rows, total } = monthlyRows(r);
  const lines: (string | number)[][] = [
    ["Wind + solar site estimate", readForm().place || ""],
    ["Latitude", req.lat],
    ["Longitude", req.lon],
    ...assumptionRows(r, p, req, wx),
    [],
    ["Wind kWh/yr", r.windKwh],
    ["Capacity factor", r.capacityFactor],
    ["Solar kWh/yr", r.pvKwh],
    ["Use kWh/yr", r.loadKwh],
    ["Bought kWh/yr, solar + battery", r.pvOnly.importKwh],
    ["Bought kWh/yr, with wind", r.withWind.importKwh],
    ["Savings from wind per yr", r.econ.savings],
    ["Simple payback (yrs)", Number.isFinite(r.econ.payback) ? r.econ.payback : "never"],
    [],
    head.map((h) => `${h} (kWh)`),
    ...rows,
    total,
  ];
  const blob = new Blob([lines.map((l) => l.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `site-estimate-${req.lat.toFixed(3)}_${req.lon.toFixed(3)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// @ts-nocheck -- typed in the first strictness round, after this file is split up
// CSV download of the report.
import { readForm } from "../app/form.ts";
import { state } from "../app/state.ts";
import { assumptionRows, monthlyRows } from "./tables.ts";

export function downloadCsv() {
  const { result: r, params: p, req, wx } = state;
  if (!r) return;
  const q = (c) => (typeof c === "number" ? String(Math.round(c * 100) / 100) : `"${String(c).replace(/"/g, '""')}"`);
  const { head, rows, total } = monthlyRows(r);
  const lines = [
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

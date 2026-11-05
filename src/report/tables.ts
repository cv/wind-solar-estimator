// Monthly table and the assumptions table (shared with the CSV export).
import { MONTHS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { esc, fmt, pct, money } from "../app/format.ts";
import type { DataRequest } from "../app/state.ts";
import { state } from "../app/state.ts";
import type { Station } from "../data/stations.ts";
import type { Weather } from "../data/weather.ts";
import type { LoadPreset } from "../model/load.ts";
import { LOAD_PRESETS } from "../model/load.ts";
import type { ModelParams, SimResult } from "../model/simulate.ts";
import type { BlendStats } from "../wind/blend.ts";
import { homogeneityText } from "./notes.ts";
import { fromSite } from "../ui/stationPicker.ts";

/** One row of the monthly table: a label, then kWh for wind, solar, use and the two import cases. */
export type MonthlyRow = [label: string, ...kwh: number[]];

/** The monthly table: column heads, one row per month and the yearly total. */
export interface MonthlyTable {
  head: string[];
  rows: MonthlyRow[];
  total: MonthlyRow;
}

/** One line of the assumptions table: what, and how it was set. */
export type AssumptionRow = [label: string, text: string];

export function monthlyRows(r: SimResult): MonthlyTable {
  const m = r.monthly;
  const rows = MONTHS.map((name, i): MonthlyRow => [
    name,
    m.wind[i],
    m.pv[i],
    m.load[i],
    m.importPv[i],
    m.importBoth[i],
  ]);
  const total: MonthlyRow = ["Year", r.windKwh, r.pvKwh, r.loadKwh, r.pvOnly.importKwh, r.withWind.importKwh];
  return { head: ["Month", "Wind", "Solar", "Use", "Bought: solar + battery", "Bought: with wind"], rows, total };
}

export function renderMonthly(r: SimResult): void {
  const { head, rows, total } = monthlyRows(r);
  const tr = ([label, ...kwh]: MonthlyRow, tag: string = "td"): string =>
    `<tr><${tag}>${esc(label)}</${tag}>${kwh.map((c) => `<${tag}>${fmt(c)}</${tag}>`).join("")}</tr>`;
  $("#monthlyTable").innerHTML =
    `<caption class="visually-hidden">Monthly energy in kWh for an average year</caption><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((row) => tr(row)).join("")}</tbody><tfoot>${tr(total)}</tfoot>`;
}

/** Load presets by any profile name: a hand-entered profile has none. */
const presetByName: Readonly<Partial<Record<string, LoadPreset>>> = LOAD_PRESETS;

export function assumptionRows(r: SimResult, p: ModelParams, req: DataRequest, wx: Weather): AssumptionRow[] {
  const ratedKw = r.ratedKw / p.nTurbines;
  const src = state.source;
  return [
    [
      "Site",
      `${req.lat.toFixed(4)}, ${req.lon.toFixed(4)}; weather grid cell centred ${wx.gridLat}, ${wx.gridLon}; elevation ${fmt(wx.elevation)} m; ${wx.timezone}`,
    ],
    [
      "Weather data",
      `ERA5 reanalysis via Open-Meteo, hourly, ${wx.startYear}–${wx.endYear} (${fmt(wx.n)} hours, ${fmt(wx.missing)} missing)`,
    ],
    ...(src?.stats
      ? [["Wind data", windDataText({ station: src.station, stats: src.stats })] satisfies AssumptionRow]
      : []),
    [
      "Wind at hub",
      `${p.hubHeight} m, from ${state.source?.stats ? "the 10 m wind with the weather model's" : "10 m and 100 m winds with an"} hourly shear exponent (mean ${fmt(r.meanAlpha, 2)}); scaled ×${fmt(r.scale, 2)}; air density correction ${p.densityCorrection ? "on" : "off"}; ${p.windLossPct}% losses`,
    ],
    [
      "Turbines",
      `${p.nTurbines} × ${fmt(ratedKw, 2)} kW peak; ${p.curvePts.length}-point power curve; capture area ${fmt(p.captureAreaM2, 2)} m² (${p.captureDesc}), augmentation ×${fmt(p.augmentation, 1)}; ${p.clampPhysics ? "capped at" : "not capped at"} the physical limit`,
    ],
    [
      "Solar",
      `${p.pvKwp} kWp, tilt ${req.tilt}°, facing ${req.compass}°; ${p.pvLossPct}% losses; ${p.tempCoeffPct}%/°C`,
    ],
    ["Electricity use", `${fmt(p.loadKwh)} kWh/yr, ${presetByName[p.loadProfile]?.label ?? "custom profile"}`],
    [
      "Battery",
      `${p.battKwh} kWh, ${p.battKw} kW, kept above ${fmt(p.battMinSoc * 100)}%, ${fmt(p.battRte * 100)}% round trip; charged from surplus, then surplus exported`,
    ],
    [
      "Inverter",
      p.inverterKw !== undefined && p.inverterKw > 0
        ? `${fmt(p.inverterKw, 1)} kW shared by wind and solar; output above it is lost (${fmt(r.inverterLostKwh.withWind)} kWh/yr, ${fmt(r.inverterLostKwh.pvOnly)} without wind)`
        : "no shared limit",
    ],
    [
      "Economics",
      `grid ${money(p.price, 2)}/kWh, export credit ${money(p.exportCredit, 2)}/kWh, ${money(p.turbineCost)} installed and ${money(p.omPerTurbine)}/yr maintenance per turbine; no inflation, discounting or incentives`,
    ],
  ];
}

export function windDataText({ station: s, stats: st }: { station: Station; stats: BlendStats }): string {
  return (
    `measured hourly at ${s.name} (Environment and Climate Change Canada, climate ID ${s.id}), ${fromSite(s)}, ` +
    `elevation ${fmt(s.elevation)} m, 10 m mast; ${pct(st.coverage, 1)} of hours measured, the rest filled from ERA5 at the site ` +
    `through a seasonal quantile mapping fitted on ${fmt(st.measured)} shared hours (correlation ${fmt(st.correlation, 2)})${homogeneityText(st.homogeneity)}`
  );
}

export function renderAssumptions(r: SimResult, p: ModelParams, req: DataRequest, wx: Weather): void {
  $("#assumptions").innerHTML = assumptionRows(r, p, req, wx)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join("");
}

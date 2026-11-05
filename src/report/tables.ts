// @ts-nocheck -- typed in the first strictness round, after this file is split up
// Monthly table and the assumptions table (shared with the CSV export).
import { MONTHS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { esc, fmt, pct, money } from "../app/format.ts";
import { state } from "../app/state.ts";
import { LOAD_PRESETS } from "../model/load.ts";
import { homogeneityText } from "./notes.ts";
import { fromSite } from "../ui/stationPicker.ts";

export function monthlyRows(r) {
  const m = r.monthly;
  const rows = MONTHS.map((name, i) => [name, m.wind[i], m.pv[i], m.load[i], m.importPv[i], m.importBoth[i]]);
  const total = ["Year", r.windKwh, r.pvKwh, r.loadKwh, r.pvOnly.importKwh, r.withWind.importKwh];
  return { head: ["Month", "Wind", "Solar", "Use", "Bought: solar + battery", "Bought: with wind"], rows, total };
}

export function renderMonthly(r) {
  const { head, rows, total } = monthlyRows(r);
  const tr = (cells, tag = "td") =>
    `<tr>${cells.map((c, i) => `<${tag}>${i ? fmt(c) : esc(c)}</${tag}>`).join("")}</tr>`;
  $("#monthlyTable").innerHTML =
    `<caption class="visually-hidden">Monthly energy in kWh for an average year</caption><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((row) => tr(row)).join("")}</tbody><tfoot>${tr(total)}</tfoot>`;
}

export function assumptionRows(r, p, req, wx) {
  const ratedKw = r.ratedKw / p.nTurbines;
  return [
    [
      "Site",
      `${req.lat.toFixed(4)}, ${req.lon.toFixed(4)}; weather grid cell centred ${wx.gridLat}, ${wx.gridLon}; elevation ${fmt(wx.elevation)} m; ${wx.timezone}`,
    ],
    [
      "Weather data",
      `ERA5 reanalysis via Open-Meteo, hourly, ${wx.startYear}–${wx.endYear} (${fmt(wx.n)} hours, ${fmt(wx.missing)} missing)`,
    ],
    ...(state.source?.stats ? [["Wind data", windDataText(state.source)]] : []),
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
    ["Electricity use", `${fmt(p.loadKwh)} kWh/yr, ${LOAD_PRESETS[p.loadProfile]?.label ?? "custom profile"}`],
    [
      "Battery",
      `${p.battKwh} kWh, ${p.battKw} kW, kept above ${fmt(p.battMinSoc * 100)}%, ${fmt(p.battRte * 100)}% round trip; charged from surplus, then surplus exported`,
    ],
    [
      "Inverter",
      p.inverterKw > 0
        ? `${fmt(p.inverterKw, 1)} kW shared by wind and solar; output above it is lost (${fmt(r.inverterLostKwh.withWind)} kWh/yr, ${fmt(r.inverterLostKwh.pvOnly)} without wind)`
        : "no shared limit",
    ],
    [
      "Economics",
      `grid ${money(p.price, 2)}/kWh, export credit ${money(p.exportCredit, 2)}/kWh, ${money(p.turbineCost)} installed and ${money(p.omPerTurbine)}/yr maintenance per turbine; no inflation, discounting or incentives`,
    ],
  ];
}

export function windDataText({ station: s, stats: st }) {
  return (
    `measured hourly at ${s.name} (Environment and Climate Change Canada, climate ID ${s.id}), ${fromSite(s)}, ` +
    `elevation ${fmt(s.elevation)} m, 10 m mast; ${pct(st.coverage, 1)} of hours measured, the rest filled from ERA5 at the site ` +
    `through a seasonal quantile mapping fitted on ${fmt(st.measured)} shared hours (correlation ${fmt(st.correlation, 2)})${homogeneityText(st.homogeneity)}`
  );
}

export function renderAssumptions(r, p, req, wx) {
  $("#assumptions").innerHTML = assumptionRows(r, p, req, wx)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join("");
}

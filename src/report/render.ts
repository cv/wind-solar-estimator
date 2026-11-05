// Renders the whole report for the latest results.
import { COLORS, ERA5_CELL_DEG } from "../app/constants.ts";
import type { FormValues } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { esc } from "../app/format.ts";
import { state } from "../app/state.ts";
import type { CurveCheck } from "../model/powerCurve.ts";
import { renderCharts } from "./charts.ts";
import { renderFigures } from "./figures.ts";
import { renderNotes } from "./notes.ts";
import { renderMonthly, renderAssumptions } from "./tables.ts";
import { renderVerdict } from "./verdict.ts";
import { stationPlace } from "../ui/stationPicker.ts";

export function render(v: FormValues, check: CurveCheck): void {
  const { result: r, params: p, req, wx } = state;
  $("#intro").hidden = true;
  $("#results").hidden = false;
  $<HTMLButtonElement>("#share").disabled = false;
  $<HTMLButtonElement>("#print").disabled = false;

  const title = v.place || `Site at ${req.lat.toFixed(3)}, ${req.lon.toFixed(3)}`;
  $("#reportHead").innerHTML =
    `<h2>${esc(title)}</h2><p>${req.lat.toFixed(4)}, ${req.lon.toFixed(4)} · ${wx.years} year${wx.years === 1 ? "" : "s"} of hourly weather (${wx.startYear === wx.endYear ? wx.endYear : `${wx.startYear}–${wx.endYear}`})` +
    (state.source?.stats
      ? `, wind measured at ${esc(state.source.station.name)} (${stationPlace(state.source.station)})`
      : "") +
    ` · ` +
    `${p.nTurbines} turbine${p.nTurbines === 1 ? "" : "s"} at ${p.hubHeight} m, ${p.pvKwp} kWp solar, ${p.battKwh} kWh battery · ${new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}</p>`;

  renderVerdict(r);
  if (state.capped) $<HTMLDetailsElement>("#more").open = true; // the power-curve chart is the evidence
  renderNotes(r, p, check);
  renderFigures(r, p, req);
  renderCharts(r, p);
  renderMonthly(r);
  renderAssumptions(r, p, req, wx);
  if (state.map) {
    state.cell?.remove();
    const h = ERA5_CELL_DEG / 2;
    state.cell = L.rectangle(
      [
        [wx.gridLat - h, wx.gridLon - h],
        [wx.gridLat + h, wx.gridLon + h],
      ],
      { color: COLORS.wind, weight: 1, fillOpacity: 0.08 },
    )
      .bindTooltip("Weather data grid cell (~28 km): wind and sunlight are averaged over this area")
      .addTo(state.map);
    state.cell.getElement()?.setAttribute("tabindex", "-1"); // hover-only hint, not a tab stop
  }
}

// Renders the whole report for the latest results.
import { COLORS, ERA5_CELL_DEG } from "../app/constants.ts";
import type { FormValues } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { esc, money } from "../app/format.ts";
import { analysis, state } from "../app/state.ts";
import { stationPlace } from "../app/stationText.ts";
import { renderCharts } from "./charts.ts";
import { renderFigures } from "./figures.ts";
import { renderNotes } from "./notes.ts";
import { renderMonthly, renderAssumptions } from "./tables.ts";
import { scrubbable } from "./scrubbable.ts";
import { renderSensitivity } from "./sensitivity.ts";
import { renderSetups } from "./setups.ts";
import { renderWindCases } from "./windCases.ts";
import { renderVerdict } from "./verdict.ts";
import type { ModelParams } from "../model/simulate.ts";

/** The system in one line, its numbers draggable: turbines, tower, solar, battery and the grid price. */
function setupText(p: ModelParams): string {
  const turbines = `${scrubbable("nTurbines", p.nTurbines, String(p.nTurbines))} turbine${p.nTurbines === 1 ? "" : "s"}`;
  return [
    `${turbines} at ${scrubbable("hubHeight", p.hubHeight, `${p.hubHeight} m`)}`,
    `${scrubbable("pvKwp", p.pvKwp, `${p.pvKwp} kWp`)} solar`,
    `${scrubbable("battKwh", p.battKwh, `${p.battKwh} kWh`)} battery`,
    `grid at ${scrubbable("price", p.price, money(p.price, 2))}/kWh`,
  ].join(", ");
}

export function render(v: FormValues): void {
  const a = analysis();
  const { result: r, params: p, req, wx, source } = a;
  $("#intro").hidden = true;
  $("#results").hidden = false;
  $("#share", HTMLButtonElement).disabled = false;
  $("#print", HTMLButtonElement).disabled = false;

  const title = v.place === "" ? `Site at ${req.lat.toFixed(3)}, ${req.lon.toFixed(3)}` : v.place;
  const measured =
    source?.kind === "measured"
      ? `, wind measured at ${esc(source.station.name)} (${stationPlace(source.station)})`
      : "";
  $("#reportHead").innerHTML =
    `<h2>${esc(title)}</h2><p>${req.lat.toFixed(4)}, ${req.lon.toFixed(4)} · ${wx.years} year${wx.years === 1 ? "" : "s"} of hourly weather (${wx.startYear === wx.endYear ? wx.endYear : `${wx.startYear}–${wx.endYear}`})${measured} · ${setupText(p)} · ${new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}</p>`;

  const capped = a.limit.kind === "faceValue" ? a.limit.capped : null;
  renderVerdict(r, capped);
  if (capped) $("#more", HTMLDetailsElement).open = true; // the power-curve chart is the evidence
  renderNotes(a);
  renderSensitivity(a);
  renderSetups(a);
  renderWindCases(a);
  renderFigures(r, p, req, source);
  renderCharts(r, p);
  renderMonthly(r);
  renderAssumptions(r, p, req, wx, source);
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

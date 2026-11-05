// Report notes: power-curve, wind data and station-quality caveats.
import { ELEVATION_NOTE_M } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { esc, fmt, pct, span, speed, times } from "../app/format.ts";
import { state } from "../app/state.ts";
import type { Analysis, DataRequest, WindSource } from "../app/state.ts";
import { autoEligible, fromSite, missingYears } from "../app/stationText.ts";
import type { Station } from "../data/stations.ts";
import type { BlendStats } from "../wind/blend.ts";
import type { Homogeneity } from "../wind/homogeneity.ts";
import { renderClampStatus } from "./verdict.ts";
import { POOR_CORRELATION } from "../wind/blend.ts";
import { pickStation } from "../wind/stationChoice.ts";

/** One report note: its style (info, caution or problem) and its HTML. */
export type Note = [cls: "info" | "warn" | "bad", html: string];

export function renderNotes(a: Analysis): void {
  const { result: r, params: p, wx, source: src, limit } = a;
  renderClampStatus(a);
  const items: Note[] = [];
  if (limit.kind !== "within") {
    const { check } = limit;
    const area = `${fmt(p.captureAreaM2, p.captureAreaM2 < 10 ? 2 : 1)} m² of capture area (${p.captureDesc})`;
    const aug = p.augmentation > 1 ? `, even with ${fmt(p.augmentation, 1)}× duct augmentation` : "";
    if (limit.kind === "capped") {
      items.push([
        "warn",
        `<strong>Power curve:</strong> output is capped at the physical limit for ${area}, which takes wind energy from ${fmt(limit.uncapped.windKwh)} to ${fmt(r.windKwh)} kWh a year.`,
      ]);
    } else {
      items.push([
        "bad",
        `<strong>Power curve:</strong> at ${speed(check.atKmh)} km/h it is ${times(check.worstRatio)} the most the wind through ${area} can deliver (the Betz limit${aug}). ` +
          `Even a perfect device this size could capture at most ${fmt(r.physicsCapKwh)} kWh a year here, before losses. Shapes inside the device, such as scoops, spirals or torque-multiplying coils, can redirect that energy but not add to it. ` +
          `Before quoting customers, measure the electrical output against the free wind speed, and enter the device's full frontal outline as the capture area.`,
      ]);
    }
  }
  if (src) items.push(...sourceNotes(src, wx.elevation, a.req));
  if (p.siteMeanKmh > 0) {
    items.push([
      "warn",
      `<strong>Wind data:</strong> scaled ×${fmt(r.scale, 2)} so the mean at hub height matches the measured ${fmt(p.siteMeanKmh, 1)} km/h. The weather data alone gave ${fmt(r.modelHubMean, 1)} km/h.`,
    ]);
  } else if (p.windScale !== 1) {
    items.push(["warn", `<strong>Wind data:</strong> scaled ×${fmt(p.windScale, 2)} by hand.`]);
  } else if (src?.kind !== "measured") {
    items.push([
      "warn",
      `<strong>Wind data:</strong> not calibrated. It's averaged over a ~28 km grid cell, and terrain, trees and buildings can change the wind at the turbine a lot; energy rises with the cube of wind speed. Enter a measured mean under <em>Site wind calibration</em> if one exists.`,
    ]);
  }
  if (p.hubHeight < 10)
    items.push([
      "warn",
      `<strong>Hub height:</strong> below 10 m the wind is extrapolated downward, and wind near roofs and the ground is turbulent and hard to predict.`,
    ]);
  if (wx.missing > 0)
    items.push(["warn", `<strong>Missing data:</strong> ${fmt(wx.missing)} hours had gaps and were skipped.`]);
  $("#notes").innerHTML = items.map(([cls, html]) => `<li class="${cls}">${html}</li>`).join("");
}

/** Notes on where the wind came from when a station was chosen, with the station's caveats when its readings were used. */
function sourceNotes(src: WindSource, siteElevationM: number, req: DataRequest): Note[] {
  const name = esc(src.station.name);
  if (src.kind === "measured") {
    const st = src.stats;
    return [
      [
        "info",
        `<strong>Wind data:</strong> measured hourly at ${name}, ${fromSite(src.station)}, at 10 m (${pct(st.coverage)} of hours; the rest filled from the weather model). ` +
          `Over the same hours the station averaged ${fmt(st.meanStation, 1)} km/h against the model's ${fmt(st.meanModel, 1)}, with ${fmt(st.energyRatio, 1)}× the wind energy. ` +
          `Stations usually sit in open, flat places such as airports; a site with trees or buildings nearby may see less wind.`,
      ],
      ...stationChecks(src.station, st, siteElevationM, req),
    ];
  }
  if (src.kind === "failed")
    return [
      [
        "warn",
        `<strong>Station data:</strong> couldn't load readings from ${name} (${esc(src.error)}), so this report uses the weather model. Press <em>Analyse this site</em> to try again.`,
      ],
    ];
  // "sparse": too few hours measured.
  return [
    [
      "warn",
      `<strong>Station data:</strong> ${name} has wind readings for only ${pct(src.coverage)} of these hours, so this report uses the weather model${src.station.explicit === true ? "" : ". Pick the station under <em>Wind data</em> to use it anyway"}.`,
    ],
  ];
}

/** Notes on how far the station can be trusted: hour-by-hour agreement, and breaks in its record. */
export function stationChecks(station: Station, st: BlendStats, siteElevationM: number, req: DataRequest): Note[] {
  const out: Note[] = [];
  const name = esc(station.name);
  const rise = station.elevation - siteElevationM;
  if (Math.abs(rise) >= ELEVATION_NOTE_M) {
    const stations = state.stations;
    const better =
      stations.status === "ready"
        ? pickStation(
            stations.list.filter((s) => s.id !== station.id && Math.abs(s.rise) < ELEVATION_NOTE_M),
            autoEligible(req),
            missingYears(req),
          )
        : null;
    out.push([
      "warn",
      `<strong>Station elevation:</strong> ${name} is ${fmt(Math.abs(rise))} m ${rise > 0 ? "higher" : "lower"} than the site ` +
        `(${fmt(station.elevation)} m against ${fmt(siteElevationM)} m). Stations on hills and ridges usually measure stronger wind than lower ground nearby, and stations in valleys weaker, ` +
        `so the wind at the site may be well ${rise > 0 ? "below" : "above"} what was measured.${
          better
            ? ` ${esc(better.name)}, ${fromSite(better)}, is closer to the site's elevation; pick it under <em>Wind data</em> to compare.`
            : ""
        }`,
    ]);
  }
  if (st.correlation < POOR_CORRELATION) {
    out.push([
      "warn",
      `<strong>Station match:</strong> the station and the weather model agree poorly hour by hour (correlation ${fmt(st.correlation, 2)}). ` +
        `Wind at ${name} follows its own local pattern, such as a valley or lake breeze, so it may not represent the site either. Use a closer or more similar station if there is one.`,
    ]);
  }
  const h = st.homogeneity;
  if (h.issue === "step") {
    const s = h.step;
    const recent = s.to - s.year + 1;
    const fix =
      recent >= 5
        ? ` <button type="button" class="link" data-years="${recent}" data-end="${s.to}">Use ${span(s.year, s.to)} only</button>`
        : ` Consider another station under <em>Wind data</em>.`;
    out.push([
      "warn",
      `<strong>Station record:</strong> from ${s.year} the wind measured at ${name} is ${pct(Math.abs(s.change))} ${s.change > 0 ? "higher" : "lower"} ` +
        `relative to the weather model than in ${span(s.from, s.year - 1)}. A jump like this usually means the instrument was moved, raised or replaced, not that the climate changed, ` +
        `so the years before and after don't measure the same thing.${fix}`,
    ]);
  } else if (h.issue === "trend") {
    const t = h.trend;
    out.push([
      "warn",
      `<strong>Station record:</strong> relative to the weather model, the wind measured at ${name} ${t.change < 0 ? "fell" : "rose"} about ${pct(Math.abs(t.change))} from ${t.from} to ${t.to}. ` +
        `A steady drift like this usually comes from changes around the instrument, such as trees growing or new buildings, rather than the climate. ` +
        `This report averages all years, so treat its wind figures as uncertain by about that much.`,
    ]);
  }
  return out;
}

/** A change as a signed percentage, e.g. "+4%" or "−4%". */
const signed = (x: number): string => `${x > 0 ? "+" : "−"}${pct(Math.abs(x))}`;

/** One line on the station record's consistency, for the assumptions table. */
export function homogeneityText(h: Homogeneity | null | undefined): string {
  if (!h || h.years < 5) return "";
  if (h.issue === "step") return `; record steps ${signed(h.step.change)} relative to the model in ${h.step.year}`;
  if (h.issue === "trend")
    return `; record drifts ${signed(h.trend.change)} relative to the model over ${span(h.trend.from, h.trend.to)}`;
  return `; no step or drift relative to the model across ${h.years} years`;
}

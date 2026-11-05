// The Leaflet map: site marker, station pins and place search.
import { COLORS } from "../app/constants.ts";
import { $, form } from "../app/dom.ts";
import { esc, fmt, numberOrZero } from "../app/format.ts";
import { hooks } from "../app/hooks.ts";
import { state } from "../app/state.ts";
import type { ChosenStation, RankedStation, WindCase } from "../app/state.ts";
import { MARGINAL_YEARS, PROMISING_YEARS } from "../report/verdict.ts";
import { riseText, stationPlace } from "../app/stationText.ts";
import type * as Leaflet from "leaflet";
import { searchPlaces } from "../data/places.ts";

/** What the map calls back into: picking a station by clicking its pin. */
export interface MapOptions {
  /** A station pin was clicked; value is the picker's option value ("eccc:<id>"). */
  onPinClick: (value: string) => void;
}

function ignorePinClick(): void {
  // Until initMap is given the real handler.
}

let pinClick: (value: string) => void = ignorePinClick;

/** good, warn or bad: the verdict band a payback falls in. */
function tone(pb: number): string {
  if (pb <= PROMISING_YEARS) return "good";
  return pb <= MARGINAL_YEARS ? "warn" : "bad";
}

/** A station's payback beside its pin ("19 yr", "never"), in its verdict's ink; null when it wasn't worked out. */
function pinLabel(s: RankedStation, w: WindCase | undefined): Leaflet.Marker | null {
  if (w?.reason !== "") return null;
  const text = Number.isFinite(w.payback) ? `${fmt(w.payback, w.payback < 10 ? 1 : 0)} yr` : "never";
  const icon = L.divIcon({
    className: `pin-label ${tone(w.payback)}`,
    html: `<span>${esc(text)}</span>`,
    iconSize: [0, 0],
  });
  return L.marker([s.lat, s.lon], { icon, interactive: false, keyboard: false });
}

export function renderStationPins(
  list: readonly RankedStation[],
  active: ChosenStation | null,
  cases: readonly WindCase[] | null = null,
): void {
  if (!state.map) return;
  state.stationLayer?.remove();
  const pins = list.map((s): Leaflet.CircleMarker => {
    const on = active?.id === s.id;
    const m = L.circleMarker([s.lat, s.lon], {
      radius: on ? 7 : 5,
      // A pin click picks the station; without this it also bubbles to the map and moves the site.
      bubblingMouseEvents: false,
      color: on ? COLORS.wind : "#556074",
      weight: on ? 2 : 1,
      fillColor: on ? COLORS.wind : "#ffffff",
      fillOpacity: on ? 0.9 : 0.8,
    })
      .bindTooltip(
        `${s.name}: ${stationPlace(s)}${riseText(s)}, hourly records ${s.first}–${s.last}${on ? " (in use)" : ""}`,
      )
      .on("click", () => pinClick(`eccc:${s.id}`));
    return m;
  });
  const labels = list.flatMap(
    (s) =>
      pinLabel(
        s,
        cases?.find((w) => w.id === s.id),
      ) ?? [],
  );
  state.stationLayer = L.layerGroup([...pins, ...labels]).addTo(state.map);
  // The picker is the keyboard route to the same choice, so the pins aren't tab stops.
  for (const m of pins) m.getElement()?.setAttribute("tabindex", "-1");
}

export function initMap({ onPinClick }: MapOptions): void {
  pinClick = onPinClick;
  if (typeof L === "undefined") {
    $("#map").hidden = true;
    return;
  }
  const lat = numberOrZero(form.elements.lat.value),
    lon = numberOrZero(form.elements.lon.value);
  const map = L.map("map", { scrollWheelZoom: false }).setView([lat, lon], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);
  const marker = L.marker([lat, lon], { draggable: true, alt: "Site location", title: "Drag to move the site" }).addTo(
    map,
  );
  marker.on("dragend", () => {
    const ll = marker.getLatLng();
    setLocation(ll.lat, ll.lng, "");
  });
  map.on("click", (e: Leaflet.LeafletMouseEvent) => setLocation(e.latlng.lat, e.latlng.lng, ""));
  Object.assign(state, { map, marker });
}

export function setLocation(lat: number, lon: number, name: string, { pan = false }: { pan?: boolean } = {}): void {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  form.elements.lat.value = lat.toFixed(4);
  form.elements.lon.value = wrapped.toFixed(4);
  form.elements.place.value = name;
  form.elements.windSource.value = "auto"; // a station picked for the old spot may not suit the new one
  state.marker?.setLatLng([lat, wrapped]);
  if (pan) state.map?.setView([lat, wrapped], 8);
  hooks.onChange("lat");
}

export async function placeSearch(): Promise<void> {
  const q = $("#placeSearch", HTMLInputElement).value.trim();
  const ul = $("#placeResults", HTMLUListElement);
  if (q === "") {
    ul.hidden = true;
    return;
  }
  ul.hidden = false;
  ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">Searching…</li>`;
  try {
    const places = await searchPlaces(q);
    if (places.length === 0) {
      ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">No places found.</li>`;
      return;
    }
    ul.innerHTML = "";
    for (const pl of places) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${pl.name} (${pl.lat.toFixed(2)}, ${pl.lon.toFixed(2)})`;
      b.addEventListener("click", () => {
        ul.hidden = true;
        setLocation(pl.lat, pl.lon, pl.name, { pan: true });
        hooks.analyse();
      });
      li.append(b);
      ul.append(li);
    }
  } catch (e) {
    ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">${esc(e instanceof Error ? e.message : String(e))}</li>`;
  }
}

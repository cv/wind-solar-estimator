// @ts-nocheck -- typed in the first strictness round, after this file is split up
// The Leaflet map: site marker, station pins and place search.
import { analyse, onChange } from "../app/analyse.ts";
import { COLORS } from "../app/constants.ts";
import { $, form } from "../app/dom.ts";
import { esc } from "../app/format.ts";
import { state } from "../app/state.ts";
import { searchPlaces } from "../data/places.ts";
import { stationPlace, riseText, chooseWindSource } from "./stationPicker.ts";

export function renderStationPins(list, active) {
  if (!state.map) return;
  state.stationLayer?.remove();
  state.stationLayer = L.layerGroup(
    list.map((s) => {
      const on = active?.id === s.id;
      const m = L.circleMarker([s.lat, s.lon], {
        radius: on ? 7 : 5,
        color: on ? COLORS.wind : "#556074",
        weight: on ? 2 : 1,
        fillColor: on ? COLORS.wind : "#ffffff",
        fillOpacity: on ? 0.9 : 0.8,
      })
        .bindTooltip(
          `${s.name}: ${stationPlace(s)}${riseText(s)}, hourly records ${s.first}–${s.last}${on ? " (in use)" : ""}`,
        )
        .on("click", () => chooseWindSource(`eccc:${s.id}`));
      return m;
    }),
  ).addTo(state.map);
  // The picker is the keyboard route to the same choice, so the pins aren't tab stops.
  state.stationLayer.eachLayer((m) => m.getElement()?.setAttribute("tabindex", "-1"));
}

export function initMap() {
  if (typeof L === "undefined") {
    $("#map").hidden = true;
    return;
  }
  const lat = Number(form.elements.lat.value) || 0,
    lon = Number(form.elements.lon.value) || 0;
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
  map.on("click", (e) => setLocation(e.latlng.lat, e.latlng.lng, ""));
  Object.assign(state, { map, marker });
}

export function setLocation(lat, lon, name, { pan = false } = {}) {
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  form.elements.lat.value = lat.toFixed(4);
  form.elements.lon.value = lon.toFixed(4);
  form.elements.place.value = name;
  form.elements.windSource.value = "auto"; // a station picked for the old spot may not suit the new one
  state.marker?.setLatLng([lat, lon]);
  if (pan) state.map?.setView([lat, lon], 8);
  onChange("lat");
}

export async function placeSearch() {
  const q = $("#placeSearch").value.trim();
  const ul = $("#placeResults");
  if (!q) {
    ul.hidden = true;
    return;
  }
  ul.hidden = false;
  ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">Searching…</li>`;
  try {
    const places = await searchPlaces(q);
    if (!places.length) {
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
        analyse();
      });
      li.append(b);
      ul.append(li);
    }
  } catch (e) {
    ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">${esc(e.message)}</li>`;
  }
}

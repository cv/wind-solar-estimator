// Leaflet and Chart.js load from CDNs as globals (see index.html); these give them types.
import type * as Leaflet from "leaflet";
import type { Chart as ChartJs } from "chart.js";

declare global {
  const L: typeof Leaflet;
  const Chart: typeof ChartJs;
}

export {};

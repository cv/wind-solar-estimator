// Shared mutable state: the loaded data, the latest results, and the run token / abort controller.
import type { Chart } from "chart.js";
import type * as Leaflet from "leaflet";
import type { Station } from "../data/stations.ts";
import type { Weather } from "../data/weather.ts";
import type { ModelParams, SimResult } from "../model/simulate.ts";
import type { BlendStats } from "../wind/blend.ts";

/** A station near the site, with its height above (+) or below (−) the site in metres (NaN if unknown). */
export type RankedStation = Station & { rise: number };

/** The station whose wind a run uses; explicit when picked by hand rather than by "auto". */
export type ChosenStation = RankedStation & { explicit?: boolean };

/** What has to be downloaded (dataRequest's result, plus the station resolveStation chose). */
export interface DataRequest {
  lat: number;
  lon: number;
  startYear: number;
  endYear: number;
  /** Panel tilt from horizontal, degrees. */
  tilt: number;
  /** Open-Meteo azimuth: 0 = south, −90 = east, 90 = west. */
  azimuth: number;
  /** Panel facing as a compass bearing: 180 = south. */
  compass: number;
  apiKey: string;
  /** Set once the stations are loaded: null for the weather model alone. */
  station?: ChosenStation | null;
}

/**
 * Where the wind came from when a station was chosen: its readings (stats), or the model
 * because they failed to load (error) or covered too few hours (unused = coverage).
 * The absent fields are typed `undefined` so `source?.stats` and the like narrow the union.
 */
export type WindSource =
  | { station: ChosenStation; stats: BlendStats; error?: undefined; unused?: undefined }
  | { station: ChosenStation; error: string; stats?: undefined; unused?: undefined }
  | { station: ChosenStation; unused: number; stats?: undefined; error?: undefined };

/**
 * The station search for the current pin (key = "lat|lon" to 3 decimals): list is undefined
 * while loading, null if the search failed.
 */
export interface StationListState {
  key: string | null;
  promise?: Promise<RankedStation[] | null>;
  list?: RankedStation[] | null;
}

export interface AppState {
  /** A weather download is in progress. */
  loading: boolean;
  wx: Weather | null;
  /** requestKey of the request wx was loaded for. */
  wxKey: string | null;
  req: DataRequest | null;
  /** null when the run used the weather model alone. */
  source: WindSource | null;
  stations: StationListState;
  stationLayer: Leaflet.LayerGroup | null;
  params: ModelParams | null;
  result: SimResult | null;
  /** The run with output capped at the physical limit, when the curve exceeds it and the cap is off. */
  capped: SimResult | null;
  /** The run without the cap, when the curve exceeds the limit and the cap is on. */
  uncapped?: SimResult | null;
  /** Chart.js charts by canvas id. */
  charts: Record<string, Chart>;
  map: Leaflet.Map | null;
  marker: Leaflet.Marker | null;
  /** The weather grid cell outline on the map. */
  cell: Leaflet.Rectangle | null;
}

export const state: AppState = {
  loading: false,
  wx: null,
  wxKey: null,
  req: null,
  source: null,
  stations: { key: null },
  stationLayer: null,
  params: null,
  result: null,
  capped: null,
  charts: {},
  map: null,
  marker: null,
  cell: null,
};

/** Values several modules reassign (ES module bindings can't be assigned from outside). */
export interface RunControl {
  /** Increments with each download, so a superseded one can tell it's stale. */
  token: number;
  abortCtl: AbortController | null;
  /** setTimeout handle of the pending re-run after a form change. */
  debounce: ReturnType<typeof setTimeout> | undefined;
}

export const runCtl: RunControl = { token: 0, abortCtl: null, debounce: undefined };

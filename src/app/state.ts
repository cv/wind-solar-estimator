// Shared mutable state: the loaded data, the latest results, and the run token / abort controller.
import type { Chart } from "chart.js";
import type * as Leaflet from "leaflet";
import type { Station } from "../data/stations.ts";
import type { Weather } from "../data/weather.ts";
import type { CurveExceedsLimit, CurveWithinLimit } from "../model/powerCurve.ts";
import type { ModelParams, SimResult } from "../model/simulate.ts";
import type { SensitivityPoint } from "../model/sensitivity.ts";
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
 * Where the wind came from when a station was chosen: its readings ("measured"), or the model
 * because they failed to load ("failed") or covered too few hours ("sparse", with their coverage).
 */
export type WindSource =
  | { kind: "measured"; station: ChosenStation; stats: BlendStats }
  | { kind: "failed"; station: ChosenStation; error: string }
  | { kind: "sparse"; station: ChosenStation; coverage: number };

/** The station search for the current pin: key = "lat|lon" to 3 decimals (null before any), and its promise. */
interface StationSearch {
  key: string | null;
  promise?: Promise<RankedStation[] | null>;
}

/** The station search and where it stands: still loading, failed, or ready with its list. */
export type StationListState =
  | (StationSearch & { status: "loading" })
  | (StationSearch & { status: "failed" })
  | (StationSearch & { status: "ready"; list: readonly RankedStation[] });

/** Weather downloaded for a request: key = its requestKey, wx with any station wind blended in. */
export interface LoadedWeather {
  key: string;
  req: DataRequest;
  wx: Weather;
  /** null when the run used the weather model alone. */
  source: WindSource | null;
}

export interface AppState {
  /** A weather download is in progress. */
  loading: boolean;
  /** The latest weather download (null before one, or after the cache is cleared). */
  loaded: LoadedWeather | null;
  /** The latest completed analysis (null before one): read it through analysis(). */
  analysis: Analysis | null;
  stations: StationListState;
  stationLayer: Leaflet.LayerGroup | null;
  /** Chart.js charts by canvas id. */
  charts: Record<string, Chart>;
  map: Leaflet.Map | null;
  marker: Leaflet.Marker | null;
  /** The weather grid cell outline on the map. */
  cell: Leaflet.Rectangle | null;
}

export const state: AppState = {
  loading: false,
  loaded: null,
  analysis: null,
  stations: { key: null, status: "loading" },
  stationLayer: null,
  charts: {},
  map: null,
  marker: null,
  cell: null,
};

/**
 * How the power curve compares with the physical limit, with the comparison run that calls for:
 * none when it stays within; when it exceeds, the run without the cap if the result is capped
 * ("capped"), or the run with the cap if the result takes the curve at face value ("faceValue").
 */
export type PhysicsLimit =
  | { kind: "within"; check: CurveWithinLimit }
  | { kind: "capped"; check: CurveExceedsLimit; uncapped: SimResult }
  | { kind: "faceValue"; check: CurveExceedsLimit; capped: SimResult };

/** Everything one completed analysis produced: what the report renders. */
export interface Analysis {
  wx: Weather;
  req: DataRequest;
  params: ModelParams;
  result: SimResult;
  limit: PhysicsLimit;
  /** null when the run used the weather model alone. */
  source: WindSource | null;
  /** The result for wind weaker or stronger than the data; null until worked out, after a pause (app/sensitivity.ts). */
  sensitivity: SensitivityPoint[] | null;
}

/**
 * The latest completed analysis. Rendering only happens after one, so a missing one is a
 * programming error: this throws rather than letting every renderer handle null.
 */
export function analysis(): Analysis {
  if (!state.analysis) throw new Error("analysis(): nothing has been analysed yet");
  return state.analysis;
}

/** Values several modules reassign (ES module bindings can't be assigned from outside). */
export interface RunControl {
  /** Increments with each download, so a superseded one can tell it's stale. */
  token: number;
  abortCtl: AbortController | null;
  /** setTimeout handle of the pending re-run after a form change. */
  debounce: ReturnType<typeof setTimeout> | undefined;
}

export const runCtl: RunControl = { token: 0, abortCtl: null, debounce: undefined };

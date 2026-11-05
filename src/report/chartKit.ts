// Chart.js plumbing shared by the report's charts: drawing into a canvas, legends and titled axes.
import type {
  Chart as ChartJs,
  ChartConfiguration,
  ChartConfigurationCustomTypesPerDataset,
  ChartType,
  Color,
  LegendItem,
  LegendOptions,
} from "chart.js";
import { $ } from "../app/dom.ts";
import { state } from "../app/state.ts";

/** A plain colour (not a per-point array or a scriptable function). */
const isColor = (v: unknown): v is Color =>
  typeof v === "string" || v instanceof CanvasGradient || v instanceof CanvasPattern;

/** A chart for drawChart: the type may be left to the datasets (mixed bar and line charts). */
export type ChartSpec = ChartConfiguration | ChartConfigurationCustomTypesPerDataset;

// Legend keys match the marks: a swatch for bars, a short line (dashed if the series is) for lines.
export const legendLabels: Partial<LegendOptions<ChartType>["labels"]> = {
  usePointStyle: true,
  boxHeight: 8,
  pointStyleWidth: 16,
  generateLabels(chart: ChartJs): LegendItem[] {
    return Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item): LegendItem => {
      // Legend items for these charts are per dataset, so datasetIndex is always set; leave any other as is.
      if (item.datasetIndex === undefined) return item;
      const ds = chart.data.datasets[item.datasetIndex];
      if (ds === undefined) return item;
      // A live chart's config always has its type (mixed charts get the default one); these charts use plain colours.
      const chartType = "type" in chart.config ? chart.config.type : undefined;
      return (ds.type ?? chartType) === "line"
        ? {
            ...item,
            pointStyle: "line",
            ...(isColor(ds.borderColor) ? { strokeStyle: ds.borderColor } : {}),
            lineWidth: 2.5,
          }
        : { ...item, pointStyle: "rect", lineWidth: 0 };
    });
  },
};

export function drawChart(id: string, config: ChartSpec): void {
  if (typeof Chart === "undefined") return;
  state.charts[id]?.destroy();
  state.charts[id] = new Chart($(`#${id}`, HTMLCanvasElement), {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: legendLabels }, ...config.options?.plugins },
      ...config.options,
    },
  });
}

/** A scale with a title, plus any other scale options. */
export function axis(title: string): AxisTitle;
export function axis<T extends object>(title: string, extra: T): AxisTitle & T;
export function axis(title: string, extra: object = {}): AxisTitle {
  return { title: { display: true, text: title }, ...extra };
}
/** What axis gives every scale. */
interface AxisTitle {
  title: { display: boolean; text: string };
}

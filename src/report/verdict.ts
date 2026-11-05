// The headline verdict and the physical-limit (Betz cap) status line.
import { $ } from "../app/dom.ts";
import { esc, fmt, pct, capitalize } from "../app/format.ts";
import type { Analysis } from "../app/state.ts";
import type { CurveCheck } from "../model/powerCurve.ts";
import type { SimResult } from "../model/simulate.ts";

/** How a verdict or note is styled. */
export type VerdictClass = "good" | "warn" | "bad";

/** The headline judgement of a run: style, short label and the sentence behind it. */
export interface Verdict {
  cls: VerdictClass;
  label: string;
  text: string;
}

export function verdictFor(r: SimResult): Verdict {
  const pb = r.econ.payback;
  if (pb <= 10)
    return {
      cls: "good",
      label: "Promising",
      text: `the turbines pay back in about ${fmt(pb, pb < 10 ? 1 : 0)} years`,
    };
  if (pb <= 20) return { cls: "warn", label: "Marginal", text: `the turbines pay back in about ${fmt(pb)} years` };
  if (Number.isFinite(pb))
    return { cls: "bad", label: "Weak", text: `the turbines take about ${fmt(pb)} years to pay back` };
  return { cls: "bad", label: "Not viable", text: "the turbines' savings don't cover their maintenance" };
}

/** capped: the run capped at the physical limit, when the curve exceeds it and the cap is off. */
export function renderVerdict(r: SimResult, capped: SimResult | null): void {
  const v = verdictFor(r);
  let tag: Pick<Verdict, "cls" | "label"> = v;
  let head = capitalize(v.text);
  let lines: string[] = []; // the figures under the headline carry the numbers
  if (capped) {
    const c = verdictFor(capped);
    tag = { cls: "bad", label: "Unverified" };
    head = "The power curve claims more than the wind can deliver";
    lines = [
      `The figures below take the curve at face value. Capped at the physical limit: ${fmt(capped.windKwh)} kWh a year from wind, and ${c.text}. Only an independently measured power curve can settle it.`,
    ];
  }
  $("#verdict").innerHTML =
    `<h3 id="verdictHead" class="verdict-head"><span class="tag ${tag.cls}">${esc(tag.label)}</span> ${esc(head)}</h3>${lines.map((l) => `<p class="verdict-detail">${esc(l)}</p>`).join("")}`;
}

/** Says what the Betz cap does for the current curve, next to the checkbox, so toggling it never looks inert. */
export function renderClampStatus(a: Analysis, check: CurveCheck): void {
  const { result: r, params: p, capped, uncapped } = a;
  let text = `This curve stays within the limit at every wind speed (at most ${pct(check.worstRatio)} of it), so capping changes nothing.`;
  if (check.exceeds) {
    // analyse.ts makes the comparison run whenever the curve exceeds the limit: uncapped with the cap on, capped with it off.
    const other = p.clampPhysics ? uncapped : capped;
    if (!other) throw new Error("renderClampStatus: the curve exceeds the limit but the comparison run is missing");
    text = p.clampPhysics
      ? `Capped, wind makes ${fmt(r.windKwh)} kWh a year instead of the ${fmt(other.windKwh)} the curve as entered would give.`
      : `This curve is ${fmt(check.worstRatio)}× the limit at ${fmt(check.atKmh)} km/h. Capped, wind would make ${fmt(other.windKwh)} kWh a year instead of ${fmt(r.windKwh)}.`;
  }
  $("#clampStatus").textContent = text;
}

// The headline verdict and the physical-limit (Betz cap) status line.
import { $ } from "../app/dom.ts";
import { esc, fmt, pct, capitalize } from "../app/format.ts";
import { state } from "../app/state.ts";
import type { CurveCheck } from "../model/powerCurve.ts";
import type { ModelParams, SimResult } from "../model/simulate.ts";

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

export function renderVerdict(r: SimResult): void {
  const v = verdictFor(r);
  let tag: Pick<Verdict, "cls" | "label"> = v;
  let head = capitalize(v.text);
  let lines: string[] = []; // the figures under the headline carry the numbers
  if (state.capped) {
    const c = verdictFor(state.capped);
    tag = { cls: "bad", label: "Unverified" };
    head = "The power curve claims more than the wind can deliver";
    lines = [
      `The figures below take the curve at face value. Capped at the physical limit: ${fmt(state.capped.windKwh)} kWh a year from wind, and ${c.text}. Only an independently measured power curve can settle it.`,
    ];
  }
  $("#verdict").innerHTML =
    `<h3 id="verdictHead" class="verdict-head"><span class="tag ${tag.cls}">${esc(tag.label)}</span> ${esc(head)}</h3>` +
    lines.map((l) => `<p class="verdict-detail">${esc(l)}</p>`).join("");
}

/** Says what the Betz cap does for the current curve, next to the checkbox, so toggling it never looks inert. */
export function renderClampStatus(r: SimResult, p: ModelParams, check: CurveCheck): void {
  let text: string;
  if (check.worstRatio <= 1) {
    text = `This curve stays within the limit at every wind speed (at most ${pct(check.worstRatio)} of it), so capping changes nothing.`;
  } else if (p.clampPhysics) {
    text = `Capped, wind makes ${fmt(r.windKwh)} kWh a year instead of the ${fmt(state.uncapped.windKwh)} the curve as entered would give.`;
  } else {
    text = `This curve is ${fmt(check.worstRatio)}× the limit at ${fmt(check.atKmh)} km/h. Capped, wind would make ${fmt(state.capped.windKwh)} kWh a year instead of ${fmt(r.windKwh)}.`;
  }
  $("#clampStatus").textContent = text;
}

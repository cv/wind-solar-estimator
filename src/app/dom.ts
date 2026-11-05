// DOM helpers: the $ selector, the form element, and status / error / flash messages.
import type { FormKey } from "./constants.ts";

/** The element matching sel; throws if there is none (the page's markup is fixed, so that's a bug). */
export function $<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`No element matches ${sel}`);
  return el;
}

type SelectKey = "captureShape" | "loadProfile";
type TextAreaKey = "curve" | "loadHourly" | "loadMonthly";
/** A named field of the form: an <input> (text, number, checkbox, hidden or password), <select> or <textarea>. */
export type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/** The form's controls by name, each with its element type. */
export type FormElements = HTMLFormControlsCollection & {
  readonly [K in FormKey | "apiKey"]: K extends SelectKey
    ? HTMLSelectElement
    : K extends TextAreaKey
      ? HTMLTextAreaElement
      : HTMLInputElement;
};
export interface AppForm extends HTMLFormElement {
  readonly elements: FormElements;
}

export const form = $<AppForm>("#form");

/** A field that failed validation, or none: the message then goes under the Analyse button. */
export function formError(message: string, field?: FormField | null): void {
  const el = $("#formError");
  el.textContent = message;
  el.hidden = !message;
  if (!message) return;
  (field ? field.closest(".row") || field.closest("label") || field : $("#run")).after(el);
  field?.setAttribute("aria-describedby", "formError");
}

/** Each flashing button's pending restore timer. */
const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

// Brief confirmation on the button that was pressed.
export function flash(btn: HTMLElement, text: string, ms: number = 2000): void {
  clearTimeout(flashTimers.get(btn));
  btn.dataset["label"] ??= btn.textContent;
  btn.textContent = text;
  flashTimers.set(
    btn,
    setTimeout(() => {
      btn.textContent = btn.dataset["label"] ?? null;
    }, ms),
  );
}

/** How a status message is styled: progress or info, a hint that results are out of date, or an error. */
export type StatusKind = "info" | "stale" | "error";

export function status(html: string, kind: StatusKind = "info"): void {
  const el = $("#status");
  el.hidden = !html;
  el.className = `status ${kind}`;
  el.innerHTML = html || "";
}

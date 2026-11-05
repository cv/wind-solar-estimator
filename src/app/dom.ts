// DOM helpers: the $ selector, the form element, and status / error / flash messages.
import { DEFAULTS } from "./constants.ts";
import type { FormKey } from "./constants.ts";

/**
 * The element matching sel, checked to be a type (an HTMLElement unless given); throws if there is
 * none or it is another kind (the page's markup is fixed, so either is a bug).
 */
export function $(sel: string): HTMLElement;
export function $<T extends Element>(sel: string, type: abstract new () => T): T;
export function $(sel: string, type: abstract new () => Element = HTMLElement): Element {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`No element matches ${sel}`);
  const tag = el.localName; // read first: a failed instanceof against Element narrows el to never
  if (!(el instanceof type)) throw new Error(`${sel} is a <${tag}>, expected ${type.name}`);
  return el;
}

type SelectKey = "captureShape" | "loadProfile";
type TextAreaKey = "curve" | "loadHourly" | "loadMonthly";
/** A named field of the form: an <input> (text, number, checkbox, hidden or password), <select> or <textarea>. */
export type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export const isFormField = (el: unknown): el is FormField =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
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

const SELECT_KEYS = new Set<string>(["captureShape", "loadProfile"] satisfies SelectKey[]);
const TEXTAREA_KEYS = new Set<string>(["curve", "loadHourly", "loadMonthly"] satisfies TextAreaKey[]);

/** A form with every field FormElements lists (DEFAULTS' keys and the API key), each the kind of control it says. */
function isAppForm(el: HTMLFormElement): el is AppForm {
  return [...Object.keys(DEFAULTS), "apiKey"].every((k) => {
    const c = el.elements.namedItem(k);
    if (SELECT_KEYS.has(k)) return c instanceof HTMLSelectElement;
    if (TEXTAREA_KEYS.has(k)) return c instanceof HTMLTextAreaElement;
    return c instanceof HTMLInputElement;
  });
}

function findForm(): AppForm {
  const el = $("#form", HTMLFormElement);
  if (!isAppForm(el)) throw new Error("#form is missing a field, or a field is the wrong kind of control");
  return el;
}

export const form = findForm();

/** A field that failed validation, or none: the message then goes under the Analyse button. */
export function formError(message: string, field?: FormField | null): void {
  const el = $("#formError");
  el.textContent = message;
  el.hidden = message === "";
  if (message === "") return;
  (field ? (field.closest(".row") ?? field.closest("label") ?? field) : $("#run")).after(el);
  field?.setAttribute("aria-describedby", "formError");
}

/** Each flashing button's pending restore timer. */
const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

// Brief confirmation on the button that was pressed.
export function flash(btn: HTMLElement, text: string, ms = 2000): void {
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
  el.hidden = html === "";
  el.className = `status ${kind}`;
  el.innerHTML = html;
}

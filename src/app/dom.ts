// @ts-nocheck -- typed in the first strictness round, after this file is split up
// DOM helpers: the $ selector, the form element, and status / error / flash messages.

export const $ = (sel) => document.querySelector(sel);
export const form = $("#form");

// Input problems are shown under the field at fault (or the Analyse button), so they're in view on every screen size.
export function formError(message, field) {
  const el = $("#formError");
  el.textContent = message;
  el.hidden = !message;
  if (!message) return;
  (field ? field.closest(".row") || field.closest("label") || field : $("#run")).after(el);
  field?.setAttribute("aria-describedby", "formError");
}

// Brief confirmation on the button that was pressed.
export function flash(btn, text, ms = 2000) {
  clearTimeout(btn._flash);
  btn.dataset.label ??= btn.textContent;
  btn.textContent = text;
  btn._flash = setTimeout(() => {
    btn.textContent = btn.dataset.label;
  }, ms);
}

export function status(html, kind = "info") {
  const el = $("#status");
  el.hidden = !html;
  el.className = `status ${kind}`;
  el.innerHTML = html || "";
}

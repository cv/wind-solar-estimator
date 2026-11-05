// A number in the report the reader can drag to change (wired up by ui/scrub.ts).
import { SCRUB } from "../app/constants.ts";
import type { ScrubField } from "../app/constants.ts";
import { esc } from "../app/format.ts";

/** The value of field, shown as text, as a draggable number (an ARIA slider); printed, it is plain text. */
export function scrubbable(field: ScrubField, value: number, text: string): string {
  const s = SCRUB[field];
  return (
    `<span class="scrub" data-field="${field}" tabindex="0" role="slider" title="Drag sideways, or use the arrow keys" ` +
    `aria-label="${esc(s.label)}" aria-valuemin="${s.min}" aria-valuemax="${s.max}" aria-valuenow="${value}" aria-valuetext="${esc(text)}">${esc(text)}</span>`
  );
}

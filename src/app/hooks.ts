// Callbacks the UI modules (map, station picker) use to reach the app, filled in by init,
// so that ui code never imports app/analyse.

export interface AppHooks {
  /** A form field changed: mark results stale, re-run if appropriate. */
  onChange(name: string): void;
  /** Run the analysis now. */
  analyse(): void;
}

function ignore(): void {
  // Until init wires the real handlers.
}

export const hooks: AppHooks = { onChange: ignore, analyse: ignore };

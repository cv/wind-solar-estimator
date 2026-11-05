// @ts-nocheck -- typed in the first strictness round, after this file is split up
// Shared mutable state: the loaded data, the latest results, and the run token / abort controller.

export const state = {
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
  charts: {} as Record<string, any>,
  map: null,
  marker: null,
  cell: null,
};

// Values several modules reassign (ES module bindings can't be assigned from outside).
export const runCtl = { token: 0, abortCtl: null, debounce: 0 };

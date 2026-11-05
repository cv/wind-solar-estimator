import assert from "node:assert/strict";
import { test } from "node:test";

import { LOAD_PRESETS, isLoadProfileKey } from "../../src/model/load.ts";

test("isLoadProfileKey accepts the presets and rejects inherited property names", () => {
  for (const key of Object.keys(LOAD_PRESETS)) assert.equal(isLoadProfileKey(key), true);
  for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty", "custom", ""])
    assert.equal(isLoadProfileKey(key), false);
});

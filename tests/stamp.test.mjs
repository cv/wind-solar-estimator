import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedBlock, currentBlock } from "../scripts/stamp.mjs";

test("index.html's asset versions match the current files (run `npm run stamp`)", () => {
  assert.equal(currentBlock(), expectedBlock());
});

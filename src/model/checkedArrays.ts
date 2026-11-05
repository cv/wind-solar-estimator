// Checked reads for the hourly loops. Same contract as at() in ../util/checked.ts, but one
// function per element kind: the shared at() sees every array type in the app, so V8 can't
// inline its load (simulate() took ~28 ms instead of ~17 ms in scripts/bench.ts).

const outOfRange = (i: number, length: number): RangeError =>
  new RangeError(`index ${i} out of range (length ${length})`);

export function f32(arr: Float32Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}

export function u8(arr: Uint8Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}

export function u16(arr: Uint16Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}

export function f64(arr: Float64Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}

export function num(arr: readonly number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}

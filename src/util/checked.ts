// Checked element access for index loops whose bounds the code already knows.

/** arr[i], throwing a RangeError if i is out of range (or the slot is empty). */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range (length ${arr.length})`);
  return v;
}

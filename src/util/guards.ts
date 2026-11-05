// Runtime type guards for data from outside the type system (JSON replies, IndexedDB, caches).

/** A non-null object whose fields can be inspected. */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export const isNumber = (v: unknown): v is number => typeof v === "number";

export const isString = (v: unknown): v is string => typeof v === "string";

/** An array whose every element passes the guard. */
export const isArrayOf = <T>(v: unknown, guard: (x: unknown) => x is T): v is T[] =>
  Array.isArray(v) && v.every((x: unknown) => guard(x));

/** A number, or null for a missing value. */
export const isNumberOrNull = (v: unknown): v is number | null => v === null || typeof v === "number";

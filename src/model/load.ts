// Typical load shapes (hourly and monthly multipliers) for the yearly consumption.

/** A named load shape: 24 hourly and 12 monthly multipliers. */
export interface LoadPreset {
  label: string;
  hourly: readonly number[];
  monthly: readonly number[];
}

export type LoadProfileKey = "residential" | "farm" | "greenhouse" | "flat";

export const LOAD_PRESETS: Readonly<Record<LoadProfileKey, LoadPreset>> = {
  residential: {
    label: "Farm house / residential",
    hourly: [
      0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.1, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.1, 1.5, 1.7, 1.6, 1.4, 1.2, 0.9,
      0.7,
    ],
    monthly: [1.3, 1.2, 1.05, 0.95, 0.85, 0.8, 0.85, 0.85, 0.85, 0.95, 1.15, 1.3],
  },
  farm: {
    label: "Farm operation (daytime work)",
    hourly: [
      0.5, 0.5, 0.5, 0.5, 0.6, 0.8, 1.1, 1.4, 1.5, 1.5, 1.5, 1.4, 1.3, 1.4, 1.5, 1.5, 1.4, 1.2, 1, 0.9, 0.8, 0.7, 0.6,
      0.5,
    ],
    monthly: [1.1, 1.05, 1, 1, 1.05, 1, 0.95, 1, 1.05, 1, 0.95, 1.05],
  },
  greenhouse: {
    label: "Greenhouse (grow lights 04–22 h, winter-heavy)",
    hourly: [
      0.5, 0.5, 0.5, 0.5, 1.3, 1.3, 1.3, 1.3, 1.2, 1.1, 1, 1, 1, 1, 1, 1.1, 1.2, 1.3, 1.3, 1.3, 1.3, 1.3, 0.5, 0.5,
    ],
    monthly: [1.5, 1.4, 1.2, 1, 0.8, 0.65, 0.6, 0.65, 0.85, 1.05, 1.3, 1.5],
  },
  flat: {
    label: "Flat (constant load)",
    hourly: Array.from({ length: 24 }, () => 1),
    monthly: Array.from({ length: 12 }, () => 1),
  },
};

/** Whether key names one of LOAD_PRESETS' own presets (not an inherited property such as "constructor"). */
export function isLoadProfileKey(key: string): key is LoadProfileKey {
  return Object.hasOwn(LOAD_PRESETS, key);
}

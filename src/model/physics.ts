// Physical limits and air properties for wind power. Units: wind speed km/h, power W.

import { fraction, kgPerM3, squareMetres, watts } from "./units.ts";
import type { Celsius, Fraction, KgPerM3, Kmh, Metres, SquareMetres, Watts } from "./units.ts";

export const BETZ: Fraction = fraction(16 / 27); // 0.593, the most any open rotor can extract
export const STD_RHO: KgPerM3 = kgPerM3(1.225); // at sea level, 15 °C (power curves are quoted at this)

/** Area of a circle of this diameter. */
export const circleArea = (diameter: Metres): SquareMetres => squareMetres(Math.PI * (diameter / 2) ** 2);

/**
 * Most power any device can take from the wind blowing through its frontal capture
 * area (the outline the wind sees). What happens inside (ducts, spirals, gearing,
 * torque multiplication) can redirect this energy but not add to it.
 */
export function betzLimitW(v: Kmh, area: SquareMetres, rho: KgPerM3 = STD_RHO): Watts {
  return watts(0.5 * rho * area * (v / 3.6) ** 3 * BETZ);
}

/** Air density from site elevation (standard atmosphere pressure) and air temperature. */
export function airDensity(elevation: Metres, temp: Celsius): KgPerM3 {
  const pressure = 101_325 * Math.pow(1 - 2.25577e-5 * elevation, 5.25588);
  return kgPerM3(pressure / (287.05 * (temp + 273.15)));
}

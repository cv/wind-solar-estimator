// Physical limits and air properties for wind power. Units: wind speed km/h, power W.

export const BETZ = 16 / 27; // 0.593, the most any open rotor can extract
export const STD_RHO = 1.225; // kg/m³ at sea level, 15 °C (power curves are quoted at this)

/** Area (m²) of a circle of this diameter (m). */
export const circleArea = (diameterM) => Math.PI * (diameterM / 2) ** 2;

/**
 * Most power (W) any device can take from the wind blowing through its frontal capture
 * area (m², the outline the wind sees). What happens inside (ducts, spirals, gearing,
 * torque multiplication) can redirect this energy but not add to it.
 */
export function betzLimitW(vKmh, areaM2, rho = STD_RHO) {
  return 0.5 * rho * areaM2 * (vKmh / 3.6) ** 3 * BETZ;
}

/** Air density from site elevation (standard atmosphere pressure) and air temperature. */
export function airDensity(elevationM, tempC) {
  const pressure = 101325 * Math.pow(1 - 2.25577e-5 * elevationM, 5.25588);
  return pressure / (287.05 * (tempC + 273.15));
}

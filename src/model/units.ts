// Branded number types for the units the model mixes. A brand exists only for the type
// checker: at runtime every value is a plain number and each constructor is the identity.
// Brand values where they enter the model (form input, test fixtures, results); inside hot
// loops the typed arrays stay plain numbers. Arithmetic on brands gives a plain number, so a
// function that combines quantities wraps its result in the constructor of the right unit.

/** A number carrying a unit for the type checker only. */
export type Brand<T, B extends string> = T & { readonly __unit: B };

/** Wind speed, km/h. */
export type Kmh = Brand<number, "km/h">;
/** Power, W (turbine power curves). */
export type Watts = Brand<number, "W">;
/** Power, kW (system sizes and limits). */
export type Kw = Brand<number, "kW">;
/** Energy, kWh. */
export type Kwh = Brand<number, "kWh">;
/** Length, m. */
export type Metres = Brand<number, "m">;
/** Area, m². */
export type SquareMetres = Brand<number, "m²">;
/** Air density, kg/m³. */
export type KgPerM3 = Brand<number, "kg/m³">;
/** Temperature, °C. */
export type Celsius = Brand<number, "°C">;
/** A share from 0 to 1 (capacity factor, minimum charge, round-trip efficiency). */
export type Fraction = Brand<number, "fraction">;
/** A share from 0 to 100. */
export type Percent = Brand<number, "%">;

// The only casts to a unit: everything else gets its brand through these.
/* eslint-disable typescript/no-unsafe-type-assertion -- a brand is a type-level tag on a plain number */
export const kmh = (n: number): Kmh => n as Kmh;
export const watts = (n: number): Watts => n as Watts;
export const kw = (n: number): Kw => n as Kw;
export const kwh = (n: number): Kwh => n as Kwh;
export const metres = (n: number): Metres => n as Metres;
export const squareMetres = (n: number): SquareMetres => n as SquareMetres;
export const kgPerM3 = (n: number): KgPerM3 => n as KgPerM3;
export const celsius = (n: number): Celsius => n as Celsius;
export const fraction = (n: number): Fraction => n as Fraction;
export const percent = (n: number): Percent => n as Percent;
/* eslint-enable typescript/no-unsafe-type-assertion */

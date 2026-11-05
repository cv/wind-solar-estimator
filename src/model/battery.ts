// Hour-by-hour battery: charges from surplus, covers deficits, counts grid import and export.

export interface Battery {
  /** State of charge, kWh. */
  soc: number;
  /** Grid import and export so far, kWh. */
  imported: number;
  exported: number;
  /** One hour with net kW (generation − load); returns grid kWh (+ import, − export). */
  step(net: number): number;
}

export function battery(capKwh: number, minFrac: number, roundTrip: number, maxKw: number): Battery {
  const eff = Math.sqrt(roundTrip); // split losses between charging and discharging
  const floor = capKwh * minFrac;
  return {
    soc: capKwh, // start full
    imported: 0,
    exported: 0,
    /** One hour with net kW (generation − load); returns grid kWh (+ import, − export). */
    step(net) {
      if (net >= 0) {
        const charge = Math.max(0, Math.min(net, maxKw, (capKwh - this.soc) / eff));
        this.soc += charge * eff;
        this.exported += net - charge;
        return -(net - charge);
      }
      const need = -net;
      const give = Math.max(0, Math.min(need, maxKw, (this.soc - floor) * eff));
      this.soc -= give / eff;
      this.imported += need - give;
      return need - give;
    },
  };
}

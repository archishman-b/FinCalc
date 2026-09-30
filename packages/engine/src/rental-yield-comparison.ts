/**
 * A small, deliberately standalone comparison of a let-out flat's post-tax
 * rental yield against the REIT Portfolio Builder's post-tax yield — ported
 * from the prototype's `rentNetYield()` (reit-simulator.html). Works in
 * yield terms (% of property value/year) rather than absolute rupees, so it
 * needs no property price, loan, or appreciation assumption at all.
 *
 * Deliberately NOT routed through `positions/real-estate.ts`'s
 * `letOutPropertyPosition` — that Position models a full property (loan
 * terms, appreciation, entry/exit costs), inputs this comparison's UI
 * doesn't ask for at all. The prototype's own "How the numbers are worked
 * out" note says as much: "It compares income only; property price growth,
 * loans and exit costs are left to the full comparator." This function is
 * that narrower, self-contained comparison — matching the prototype's own
 * scope, not the flagship Comparator's.
 */

export interface RentalYieldComparisonInput {
  /** Gross rental yield, % of the property's value per year. */
  grossRentalYieldPct: number;
  /** Months per year the flat sits vacant. */
  vacancyMonthsPerYear: number;
  /**
   * Maintenance and repairs, landlord-paid — as a percent of the *gross*
   * yield (not of rent actually collected after vacancy), matching the
   * prototype's own arithmetic exactly: it scales maintenance and property
   * tax off the yield figure itself, not off post-vacancy collected rent.
   */
  maintenancePctOfGrossYield: number;
  /** Property tax, as a percent of the gross yield — same convention as maintenancePctOfGrossYield above. */
  propertyTaxPctOfGrossYield: number;
  /** The household's marginal slab rate, % — rental income (less property tax) gets the 30% standard deduction, then is taxed at this rate. */
  slabRatePct: number;
}

/** Net-of-vacancy, net-of-costs, post-tax rental yield, as a percent of property value/year — directly comparable to the REIT portfolio's post-tax yield. */
export function letOutFlatNetYieldPct(input: RentalYieldComparisonInput): number {
  const grossYield = input.grossRentalYieldPct / 100;
  const occupancyFraction = Math.max(0, 12 - input.vacancyMonthsPerYear) / 12;
  const rent = grossYield * occupancyFraction;
  const propertyTax = grossYield * (input.propertyTaxPctOfGrossYield / 100);
  const maintenance = grossYield * (input.maintenancePctOfGrossYield / 100);
  const taxableAfterStandardDeduction = Math.max(0, 0.7 * (rent - propertyTax));
  const tax = taxableAfterStandardDeduction * (input.slabRatePct / 100);
  return (rent - propertyTax - maintenance - tax) * 100;
}

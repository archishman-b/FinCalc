/**
 * Maps a comparison's 1-based month offset onto the Indian financial year
 * (April-March) it falls in. Month 1 of every Scenario's timeline is April
 * of `startFy`'s starting year, matching the convention `possessionMonth`
 * and every other month-indexed input already use elsewhere in this
 * engine.
 */

/** True for month 12, 24, 36, ... — the last month of each FY on this convention (month 1 = April). */
export function isFiscalYearEnd(month: number): boolean {
  return month % 12 === 0;
}

/** The FY (e.g. "2026-27") that calendar (year, month1to12) falls in — FY starts April. */
export function fiscalYearOf(year: number, month1to12: number): string {
  const fyStartYear = month1to12 >= 4 ? year : year - 1;
  const endYy = String((fyStartYear + 1) % 100).padStart(2, '0');
  return `${fyStartYear}-${endYy}`;
}

/** The FY a given 1-based comparison month falls in, given the comparison's startFy (month 1 = April of startFy's starting year). */
export function fyForMonth(startFy: string, month: number): string {
  const startYear = Number(startFy.slice(0, 4));
  const totalMonthsFromJan = 3 + (month - 1); // April = index 3 (Jan=0) of startYear
  const year = startYear + Math.floor(totalMonthsFromJan / 12);
  const month1to12 = (totalMonthsFromJan % 12) + 1;
  return fiscalYearOf(year, month1to12);
}

/** Every FY that intersects months 1..horizonMonths, in order, given the comparison's startFy. */
export function fiscalYearsInHorizon(startFy: string, horizonMonths: number): string[] {
  const fys: string[] = [];
  for (let month = 1; month <= horizonMonths; month++) {
    if (isFiscalYearEnd(month) || month === horizonMonths) {
      const fy = fyForMonth(startFy, month);
      if (fys[fys.length - 1] !== fy) fys.push(fy);
    }
  }
  return fys;
}

/** The 1-based month range [start, end] (inclusive) that a given FY occupies within a comparison starting at startFy, clipped to `horizonMonths`. Returns null if that FY doesn't intersect the horizon at all. */
export function monthRangeForFy(startFy: string, fy: string, horizonMonths: number): { start: number; end: number } | null {
  let start: number | null = null;
  let end: number | null = null;
  for (let month = 1; month <= horizonMonths; month++) {
    if (fyForMonth(startFy, month) === fy) {
      if (start === null) start = month;
      end = month;
    }
  }
  if (start === null || end === null) return null;
  return { start, end };
}

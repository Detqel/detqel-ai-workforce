import { BRAIN_LIMITS, BRAIN_METRIC_AGGREGATIONS } from "../../../../../constants/brainConstants.js";
import { round } from "../../brain-types.js";

export interface DriverInput { readonly value: string; readonly current: number; readonly previous: number }
export interface Driver { readonly value: string; readonly current: number; readonly previous: number; readonly delta: number; readonly contributionPercent: number; readonly direction: "up" | "down" | "flat" }
export interface DecompositionResult {
    readonly totalCurrent: number;
    readonly totalPrevious: number;
    readonly delta: number;
    readonly deltaPercent: number | null;
    readonly drivers: Driver[];
    /** Share of the change explained by the top three drivers; high values mean the movement is concentrated. */
    readonly concentration: number;
    readonly additive: boolean;
    readonly caveats: string[];
}

/**
 * Variance decomposition of a metric's change between two periods across one dimension. For sums and counts the
 * contributions add up exactly to the total change. Averages and extremes are not additive, so their drivers are
 * ranked by movement and flagged as indicative.
 */
export function decompose(rows: ReadonlyArray<DriverInput>, aggregation: string, totals?: { current: number; previous: number }): DecompositionResult {
    const additive = aggregation === BRAIN_METRIC_AGGREGATIONS.sum || aggregation === BRAIN_METRIC_AGGREGATIONS.count;
    const totalCurrent = totals?.current ?? rows.reduce((sum, row) => sum + row.current, 0);
    const totalPrevious = totals?.previous ?? rows.reduce((sum, row) => sum + row.previous, 0);
    const delta = totalCurrent - totalPrevious;
    const movement = rows.reduce((sum, row) => sum + Math.abs(row.current - row.previous), 0);
    const drivers = rows.map(row => {
        const change = row.current - row.previous;
        const basis = additive && delta !== 0 ? delta : movement;
        return {
            value: row.value, current: round(row.current, 4), previous: round(row.previous, 4), delta: round(change, 4),
            contributionPercent: basis ? round(change / Math.abs(basis) * 100, 1) : 0,
            direction: change > 0 ? "up" as const : change < 0 ? "down" as const : "flat" as const,
        };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, BRAIN_LIMITS.maxRootCauseDrivers);
    const top = drivers.slice(0, 3).reduce((sum, driver) => sum + Math.abs(driver.delta), 0);
    const caveats: string[] = [];
    if (!additive) caveats.push("This metric is not additive, so contributions are indicative rather than an exact split of the change.");
    if (rows.length < 2) caveats.push("Only one dimension value has data, so no comparison between drivers is possible.");
    if (rows.some(row => row.previous === 0 && row.current !== 0)) caveats.push("Some values are new this period and have no prior baseline.");
    return {
        totalCurrent: round(totalCurrent, 4), totalPrevious: round(totalPrevious, 4), delta: round(delta, 4),
        deltaPercent: totalPrevious ? round(delta / Math.abs(totalPrevious) * 100, 2) : null,
        drivers, concentration: movement ? round(top / movement * 100, 1) : 0, additive, caveats,
    };
}

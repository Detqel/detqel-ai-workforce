import { BRAIN_LIMITS, BRAIN_SCENARIO_ASSUMPTION_TYPES, type BrainScenarioAssumptionType } from "../../../../../constants/brainConstants.js";
import { round } from "../../brain-types.js";
import type { ForecastPoint } from "./forecasting.js";

export interface ScenarioAssumption {
    readonly key: string;
    readonly label: string;
    readonly type: BrainScenarioAssumptionType;
    /** Percent for percent types, metric units for level_absolute. */
    readonly value: number;
    /** First affected period (1-based). */
    readonly startPeriod?: number;
    /** For ramp_percent: periods to reach the full effect. */
    readonly rampPeriods?: number;
}
export interface ScenarioConstraint { readonly label: string; readonly min?: number; readonly max?: number }
export interface SimulatedPeriod { readonly period: string; readonly baseline: number; readonly scenario: number; readonly lower: number; readonly upper: number; readonly delta: number }
export interface SimulationOutput {
    readonly periods: SimulatedPeriod[];
    readonly totals: { readonly baseline: number; readonly scenario: number; readonly delta: number; readonly deltaPercent: number | null; readonly scenarioLower: number; readonly scenarioUpper: number };
    readonly sensitivity: Array<{ readonly key: string; readonly label: string; readonly low: number; readonly high: number; readonly swing: number }>;
    readonly violations: Array<{ readonly period: string; readonly constraint: string; readonly value: number }>;
}

const BOUNDS: Readonly<Record<BrainScenarioAssumptionType, { min: number; max: number }>> = {
    [BRAIN_SCENARIO_ASSUMPTION_TYPES.levelPercent]: { min: -100, max: 500 },
    [BRAIN_SCENARIO_ASSUMPTION_TYPES.growthPercent]: { min: -50, max: 100 },
    [BRAIN_SCENARIO_ASSUMPTION_TYPES.rampPercent]: { min: -100, max: 500 },
    [BRAIN_SCENARIO_ASSUMPTION_TYPES.levelAbsolute]: { min: -Infinity, max: Infinity },
};

/**
 * Validates assumptions against their units and bounds before any run (FR-INT-002). Absolute changes are bounded
 * by the baseline's scale, so a typo of extra zeros is rejected instead of producing a meaningless result.
 */
export function validateAssumptions(assumptions: ReadonlyArray<ScenarioAssumption>, horizon: number, baseline: ReadonlyArray<ForecastPoint>, unit: string): string[] {
    const issues: string[] = [];
    if (!assumptions.length) issues.push("A scenario needs at least one assumption.");
    if (assumptions.length > BRAIN_LIMITS.maxScenarioAssumptions) issues.push(`A scenario can have at most ${BRAIN_LIMITS.maxScenarioAssumptions} assumptions.`);
    const keys = new Set<string>();
    const scale = Math.max(...baseline.map(point => Math.abs(point.value)), 1);
    for (const assumption of assumptions) {
        if (keys.has(assumption.key)) issues.push(`Assumption "${assumption.key}" is defined twice.`);
        keys.add(assumption.key);
        if (!Number.isFinite(assumption.value)) { issues.push(`"${assumption.label}" needs a numeric value.`); continue; }
        const bounds = BOUNDS[assumption.type];
        if (!bounds) { issues.push(`"${assumption.label}" has an unsupported type.`); continue; }
        if (assumption.value < bounds.min || assumption.value > bounds.max) issues.push(`"${assumption.label}" must be between ${bounds.min}% and ${bounds.max}%.`);
        if (assumption.type === BRAIN_SCENARIO_ASSUMPTION_TYPES.levelAbsolute) {
            if (unit === "percent" && Math.abs(assumption.value) > 100) issues.push(`"${assumption.label}" cannot move a percentage by more than 100 points.`);
            if (Math.abs(assumption.value) > scale * 10) issues.push(`"${assumption.label}" is more than ten times the baseline's size; check the unit.`);
        }
        const start = assumption.startPeriod ?? 1;
        if (!Number.isInteger(start) || start < 1 || start > horizon) issues.push(`"${assumption.label}" must start within the ${horizon}-period horizon.`);
        if (assumption.type === BRAIN_SCENARIO_ASSUMPTION_TYPES.rampPercent && (!assumption.rampPeriods || assumption.rampPeriods < 1 || assumption.rampPeriods > horizon)) {
            issues.push(`"${assumption.label}" needs a ramp of 1 to ${horizon} periods.`);
        }
    }
    return issues;
}

function effect(assumptions: ReadonlyArray<ScenarioAssumption>, step: number): { factor: number; offset: number } {
    let factor = 1;
    let offset = 0;
    for (const assumption of assumptions) {
        const start = assumption.startPeriod ?? 1;
        if (step < start) continue;
        const elapsed = step - start + 1;
        switch (assumption.type) {
            case BRAIN_SCENARIO_ASSUMPTION_TYPES.levelPercent: factor *= 1 + assumption.value / 100; break;
            case BRAIN_SCENARIO_ASSUMPTION_TYPES.growthPercent: factor *= (1 + assumption.value / 100) ** elapsed; break;
            case BRAIN_SCENARIO_ASSUMPTION_TYPES.rampPercent: factor *= 1 + (assumption.value / 100) * Math.min(1, elapsed / (assumption.rampPeriods ?? 1)); break;
            case BRAIN_SCENARIO_ASSUMPTION_TYPES.levelAbsolute: offset += assumption.value; break;
        }
    }
    return { factor, offset };
}

const total = (values: ReadonlyArray<number>) => values.reduce((sum, value) => sum + value, 0);

function apply(baseline: ReadonlyArray<ForecastPoint>, assumptions: ReadonlyArray<ScenarioAssumption>): SimulatedPeriod[] {
    return baseline.map((point, index) => {
        const { factor, offset } = effect(assumptions, index + 1);
        const scenario = point.value * factor + offset;
        const bounds = [point.lower * factor + offset, point.upper * factor + offset];
        return { period: point.period, baseline: round(point.value, 4), scenario: round(scenario, 4), lower: round(Math.min(...bounds), 4), upper: round(Math.max(...bounds), 4), delta: round(scenario - point.value, 4) };
    });
}

/**
 * Applies driver assumptions to a forecast baseline. The baseline's prediction interval is carried through the
 * same transformation, and each assumption is stressed at half and one-and-a-half times its value to show which
 * assumption the outcome depends on most.
 */
export function simulate(baseline: ReadonlyArray<ForecastPoint>, assumptions: ReadonlyArray<ScenarioAssumption>, constraints: ReadonlyArray<ScenarioConstraint> = []): SimulationOutput {
    const periods = apply(baseline, assumptions);
    const baselineTotal = total(periods.map(period => period.baseline));
    const scenarioTotal = total(periods.map(period => period.scenario));
    const sensitivity = assumptions.map(assumption => {
        const scaled = (multiplier: number) => total(apply(baseline, assumptions.map(item => item.key === assumption.key ? { ...item, value: item.value * multiplier } : item)).map(period => period.scenario));
        const low = scaled(0.5);
        const high = scaled(1.5);
        return { key: assumption.key, label: assumption.label, low: round(low, 2), high: round(high, 2), swing: round(Math.abs(high - low), 2) };
    }).sort((a, b) => b.swing - a.swing);
    const violations = periods.flatMap(period => constraints.flatMap(constraint => {
        if (constraint.min !== undefined && period.scenario < constraint.min) return [{ period: period.period, constraint: `${constraint.label} (minimum ${constraint.min})`, value: period.scenario }];
        if (constraint.max !== undefined && period.scenario > constraint.max) return [{ period: period.period, constraint: `${constraint.label} (maximum ${constraint.max})`, value: period.scenario }];
        return [];
    }));
    return {
        periods,
        totals: {
            baseline: round(baselineTotal, 2), scenario: round(scenarioTotal, 2), delta: round(scenarioTotal - baselineTotal, 2),
            deltaPercent: baselineTotal ? round((scenarioTotal - baselineTotal) / Math.abs(baselineTotal) * 100, 2) : null,
            scenarioLower: round(total(periods.map(period => period.lower)), 2), scenarioUpper: round(total(periods.map(period => period.upper)), 2),
        },
        sensitivity,
        violations,
    };
}

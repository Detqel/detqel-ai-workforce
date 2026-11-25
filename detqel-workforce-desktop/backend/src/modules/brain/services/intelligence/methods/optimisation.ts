import { BRAIN_LIMITS } from "../../../../../constants/brainConstants.js";
import { round } from "../../brain-types.js";

export interface AllocationOption {
    readonly key: string;
    readonly label: string;
    readonly currentSpend: number;
    readonly currentReturn: number;
    readonly min: number;
    readonly max: number;
}
export interface AllocationResult {
    readonly feasibility: { readonly status: "feasible" | "infeasible" | "capped"; readonly message: string };
    readonly allocations: Array<{ readonly key: string; readonly label: string; readonly current: number; readonly recommended: number; readonly change: number; readonly currentReturn: number; readonly expectedReturn: number }>;
    readonly totals: { readonly budget: number; readonly allocated: number; readonly currentReturn: number; readonly expectedReturn: number; readonly uplift: number; readonly upliftPercent: number | null };
    readonly assumptions: string[];
}

/**
 * Diminishing returns as r(x) = a·ln(1 + x/b), calibrated so the curve passes through today's spend and return
 * with today's spend as the half-saturation point. Options without spend history cannot be calibrated and stay
 * at their minimum.
 */
function responseCurve(option: AllocationOption): ((spend: number) => number) | null {
    if (option.currentSpend <= 0 || option.currentReturn < 0) return null;
    const b = option.currentSpend;
    const a = option.currentReturn / Math.log(2);
    return spend => a * Math.log(1 + Math.max(spend, 0) / b);
}

/**
 * Splits a budget across options to maximise modelled return under per-option bounds (greedy marginal
 * allocation, optimal for concave response curves). Reports infeasibility instead of guessing when the bounds
 * cannot hold the budget.
 */
export function allocate(options: ReadonlyArray<AllocationOption>, budget: number): AllocationResult {
    const assumptions = [
        "Each option has diminishing returns, modelled as a logarithmic curve through its current spend and return.",
        "Options are independent: moving budget between them does not change the others' response.",
    ];
    const minimum = options.reduce((total, option) => total + option.min, 0);
    const maximum = options.reduce((total, option) => total + option.max, 0);
    const curves = options.map(responseCurve);
    const current = options.reduce((total, option) => total + option.currentReturn, 0);
    if (!options.length || budget < minimum) {
        return {
            feasibility: { status: "infeasible", message: options.length ? `The minimum allocations need ${round(minimum, 2)}, more than the budget of ${round(budget, 2)}.` : "There are no options to allocate across." },
            allocations: [], totals: { budget, allocated: 0, currentReturn: round(current, 2), expectedReturn: 0, uplift: 0, upliftPercent: null }, assumptions,
        };
    }
    const target = Math.min(budget, maximum);
    const spend = options.map(option => option.min);
    let remaining = target - minimum;
    const step = remaining / BRAIN_LIMITS.optimisationSteps;
    for (let iteration = 0; iteration < BRAIN_LIMITS.optimisationSteps && remaining > 1e-9; iteration++) {
        let best = -1;
        let bestGain = -Infinity;
        options.forEach((option, index) => {
            const curve = curves[index];
            if (!curve) return;
            const increment = Math.min(step, remaining, option.max - spend[index]);
            if (increment <= 0) return;
            const gain = (curve(spend[index] + increment) - curve(spend[index])) / increment;
            if (gain > bestGain) { bestGain = gain; best = index; }
        });
        if (best < 0) break;
        const increment = Math.min(step, remaining, options[best].max - spend[best]);
        spend[best] += increment;
        remaining -= increment;
    }
    const allocations = options.map((option, index) => {
        const curve = curves[index];
        const expected = curve ? curve(spend[index]) : option.currentReturn;
        return { key: option.key, label: option.label, current: round(option.currentSpend, 2), recommended: round(spend[index], 2), change: round(spend[index] - option.currentSpend, 2), currentReturn: round(option.currentReturn, 2), expectedReturn: round(expected, 2) };
    });
    const expected = allocations.reduce((total, item) => total + item.expectedReturn, 0);
    const allocated = spend.reduce((total, value) => total + value, 0);
    const uncalibrated = options.filter((_, index) => !curves[index]).map(option => option.label);
    if (uncalibrated.length) assumptions.push(`No spend history for ${uncalibrated.join(", ")}; kept at minimum.`);
    return {
        feasibility: budget > maximum
            ? { status: "capped", message: `The option maximums hold ${round(maximum, 2)}; ${round(budget - maximum, 2)} of the budget is left unallocated.` }
            : { status: "feasible", message: "All bounds are satisfied." },
        allocations,
        totals: { budget: round(budget, 2), allocated: round(allocated, 2), currentReturn: round(current, 2), expectedReturn: round(expected, 2), uplift: round(expected - current, 2), upliftPercent: current ? round((expected - current) / current * 100, 2) : null },
        assumptions,
    };
}

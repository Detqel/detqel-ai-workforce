import { formatPercent, formatValue } from "../../brain-types.js";

export interface Recommendation {
    readonly title: string;
    readonly rationale: string;
    readonly expectedImpact: string;
    readonly effort: "low" | "medium" | "high";
    readonly dependencies: string[];
    readonly risks: string[];
    readonly confidence: "low" | "moderate" | "high";
    /** Implies an external or consequential change, so it must go through approval and workflow controls (FR-INT-007). */
    readonly requiresApproval: boolean;
    readonly followUpPrompt: string;
}
interface MetricInfo { readonly name: string; readonly key: string; readonly unit: string; readonly currency: string | null; readonly higherIsBetter: boolean }

const confidenceOf = (mape: number | null | undefined): Recommendation["confidence"] => mape === null || mape === undefined ? "low" : mape <= 10 ? "high" : mape <= 25 ? "moderate" : "low";

export function forecastRecommendations(metric: MetricInfo, summary: { changePercent: number | null; nextValue: number; mape: number | null }): Recommendation[] {
    if (summary.changePercent === null) return [];
    const worsening = metric.higherIsBetter ? summary.changePercent < -2 : summary.changePercent > 2;
    const improving = metric.higherIsBetter ? summary.changePercent > 2 : summary.changePercent < -2;
    if (worsening) return [{
        title: `Investigate the projected ${summary.changePercent < 0 ? "decline" : "rise"} in ${metric.name}`,
        rationale: `The forecast moves ${formatPercent(summary.changePercent)} against the last observed period.`,
        expectedImpact: `Protects about ${formatValue(Math.abs(summary.nextValue * summary.changePercent / 100), metric.unit, metric.currency)} next period if the drivers are addressed.`,
        effort: "medium", dependencies: ["A dimension breakdown of the metric"], risks: ["The trend may reverse without intervention"],
        confidence: confidenceOf(summary.mape), requiresApproval: false,
        followUpPrompt: `What is driving the change in ${metric.name}?`,
    }];
    if (improving) return [{
        title: `Plan capacity for the projected growth in ${metric.name}`,
        rationale: `The forecast moves ${formatPercent(summary.changePercent)} in the favourable direction.`,
        expectedImpact: `About ${formatValue(Math.abs(summary.nextValue * summary.changePercent / 100), metric.unit, metric.currency)} more next period.`,
        effort: "low", dependencies: ["Current capacity and targets"], risks: ["Forecast uncertainty; confirm with the next validated load"],
        confidence: confidenceOf(summary.mape), requiresApproval: false,
        followUpPrompt: `Run a what-if simulation for ${metric.name} with 10% more growth`,
    }];
    return [];
}

export function simulationRecommendations(metric: MetricInfo, totals: { delta: number; deltaPercent: number | null }, topAssumption: string | null, violations: number): Recommendation[] {
    if (totals.delta === 0) return [];
    const favourable = metric.higherIsBetter ? totals.delta > 0 : totals.delta < 0;
    return [{
        title: favourable ? `Turn the scenario into an execution plan` : `Avoid the conditions in this scenario`,
        rationale: `The scenario changes ${metric.name} by ${formatValue(totals.delta, metric.unit, metric.currency)}${totals.deltaPercent === null ? "" : ` (${formatPercent(totals.deltaPercent)})`} over the horizon.${topAssumption ? ` It depends most on "${topAssumption}".` : ""}`,
        expectedImpact: `${formatValue(totals.delta, metric.unit, metric.currency)} versus the baseline.`,
        effort: "high", dependencies: ["Owner sign-off on the assumptions", ...(violations ? ["Resolve the business-rule violations first"] : [])],
        risks: ["Assumptions may not hold", ...(violations ? [`${violations} period(s) break a business constraint`] : [])],
        confidence: violations ? "low" : "moderate", requiresApproval: favourable,
        followUpPrompt: favourable ? `Create a workflow to execute the ${metric.name} scenario with an approval step` : `What would offset the downside in ${metric.name}?`,
    }];
}

export function optimisationRecommendations(totals: { uplift: number; upliftPercent: number | null }, moves: Array<{ label: string; change: number }>, unit: string, currency: string | null): Recommendation[] {
    if (totals.uplift <= 0 || !moves.length) return [];
    const largest = [...moves].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 2);
    return [{
        title: "Rebalance the budget toward the highest marginal returns",
        rationale: `Moving spend (${largest.map(move => `${move.label} ${move.change > 0 ? "+" : ""}${formatValue(move.change, "currency", currency)}`).join(", ")}) raises the modelled return.`,
        expectedImpact: `${formatValue(totals.uplift, unit, currency)}${totals.upliftPercent === null ? "" : ` (${formatPercent(totals.upliftPercent)})`} more return for the same budget.`,
        effort: "medium", dependencies: ["Budget owner approval", "Channel capacity to absorb the change"],
        risks: ["The response curves are calibrated from one point per option and may overstate returns"],
        confidence: "moderate", requiresApproval: true,
        followUpPrompt: "Create a workflow to apply this budget reallocation with an approval step",
    }];
}

export function rootCauseRecommendations(metric: MetricInfo, drivers: Array<{ value: string; delta: number; contributionPercent: number }>, dimension: string | null): Recommendation[] {
    const adverse = drivers.filter(driver => (metric.higherIsBetter ? driver.delta < 0 : driver.delta > 0)).slice(0, 2);
    if (!adverse.length || !dimension) return [];
    return [{
        title: `Focus on ${adverse.map(driver => driver.value).join(" and ")}`,
        rationale: `These ${dimension} values account for ${adverse.map(driver => `${driver.contributionPercent}%`).join(" and ")} of the change in ${metric.name}.`,
        expectedImpact: `Recovering them would offset ${formatValue(Math.abs(adverse.reduce((sum, driver) => sum + driver.delta, 0)), metric.unit, metric.currency)}.`,
        effort: "medium", dependencies: ["Owners for the affected segments"], risks: ["Correlation in one period is not proof of cause"],
        confidence: "moderate", requiresApproval: false,
        followUpPrompt: `Forecast ${metric.name} for ${adverse[0].value}`,
    }];
}

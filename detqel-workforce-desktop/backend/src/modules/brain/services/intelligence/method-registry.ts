import { BRAIN_ANALYSIS_KINDS, BRAIN_LIMITS, BRAIN_METHODS } from "../../../../constants/brainConstants.js";

export interface MethodDescriptor {
    readonly key: string;
    readonly version: string;
    readonly kind: string;
    readonly name: string;
    readonly description: string;
    readonly minimumHistory: number;
    readonly evidence: readonly string[];
}

/**
 * The approved method registry (PRD 7.4 step 3). Only methods listed here can run; an LLM may choose among them
 * but never supplies its own calculation.
 */
export const METHOD_REGISTRY: ReadonlyArray<MethodDescriptor> = [
    { ...BRAIN_METHODS.holtLinear, kind: BRAIN_ANALYSIS_KINDS.forecast, name: "Holt linear smoothing", description: "Exponential smoothing of level and trend with grid-searched parameters and analytic prediction intervals.", minimumHistory: BRAIN_LIMITS.minHoltPoints, evidence: ["training window", "smoothing parameters", "backtest MAPE/RMSE", "prediction interval"] },
    { ...BRAIN_METHODS.linearTrend, kind: BRAIN_ANALYSIS_KINDS.forecast, name: "Linear trend regression", description: "Ordinary least squares on time with Student-t prediction intervals.", minimumHistory: BRAIN_LIMITS.minForecastPoints, evidence: ["training window", "slope and R²", "backtest MAPE/RMSE", "prediction interval"] },
    { ...BRAIN_METHODS.driverSimulation, kind: BRAIN_ANALYSIS_KINDS.simulation, name: "Driver-based what-if", description: "Applies validated level, growth and ramp assumptions to a forecast baseline and stresses each assumption.", minimumHistory: BRAIN_LIMITS.minForecastPoints, evidence: ["baseline run", "assumptions", "sensitivity", "constraint checks"] },
    { ...BRAIN_METHODS.marginalAllocation, kind: BRAIN_ANALYSIS_KINDS.optimisation, name: "Marginal budget allocation", description: "Greedy allocation under per-option bounds using calibrated diminishing-return curves.", minimumHistory: 1, evidence: ["objective", "bounds", "feasibility status", "response-curve assumptions"] },
    { ...BRAIN_METHODS.varianceDecomposition, kind: BRAIN_ANALYSIS_KINDS.rootCause, name: "Variance decomposition", description: "Splits a period-over-period change across a dimension's values.", minimumHistory: 2, evidence: ["compared periods", "dimension", "contributions", "caveats"] },
    { ...BRAIN_METHODS.recommendationRules, kind: BRAIN_ANALYSIS_KINDS.recommendation, name: "Recommendation rules", description: "Turns analysis results into scoped proposals with impact, effort, risks and approval routing.", minimumHistory: 0, evidence: ["source run", "expected impact", "approval requirement"] },
];

export const methodVersion = (key: string): string | null => METHOD_REGISTRY.find(method => method.key === key)?.version ?? null;

import { BRAIN_LIMITS, BRAIN_METHODS, BRAIN_METRIC_AGGREGATIONS, type BrainTimeGrain } from "../../../../../constants/brainConstants.js";
import { round } from "../../brain-types.js";

export interface SeriesValue { readonly period: string; readonly value: number }
export interface ForecastPoint { readonly period: string; readonly value: number; readonly lower: number; readonly upper: number }
export interface ForecastEvaluation { readonly mape: number | null; readonly rmse: number; readonly holdoutPoints: number }
export interface ForecastOutput {
    readonly method: { readonly key: string; readonly version: string };
    readonly points: ForecastPoint[];
    readonly evaluation: ForecastEvaluation;
    readonly parameters: Record<string, number>;
    readonly confidenceLevel: number;
    readonly residualStd: number;
    readonly clampedAtZero: boolean;
}
export type ForecastMethodKey = "auto" | typeof BRAIN_METHODS.holtLinear.key | typeof BRAIN_METHODS.linearTrend.key;

const Z_SCORES: Readonly<Record<string, number>> = { "0.8": 1.2816, "0.9": 1.6449, "0.95": 1.96 };

/** Student's t quantile from the normal quantile (Cornish-Fisher), accurate enough for interval widths at df ≥ 2. */
export function tQuantile(confidence: number, degreesOfFreedom: number): number {
    const z = Z_SCORES[String(confidence)] ?? 1.96;
    const df = Math.max(degreesOfFreedom, 1);
    return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2);
}

const parse = (period: string) => new Date(`${period}T00:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);

export function addPeriods(period: string, grain: BrainTimeGrain, count: number): string {
    const date = parse(period);
    if (grain === "day") date.setUTCDate(date.getUTCDate() + count);
    else if (grain === "week") date.setUTCDate(date.getUTCDate() + 7 * count);
    else if (grain === "month") date.setUTCMonth(date.getUTCMonth() + count);
    else date.setUTCMonth(date.getUTCMonth() + 3 * count);
    return format(date);
}

/** True when the period has not ended yet; its partial value would bias a forecast downward. */
export const isIncomplete = (period: string, grain: BrainTimeGrain, now = new Date()) => parse(addPeriods(period, grain, 1)).getTime() > now.getTime();

/**
 * Fills missing periods so the series is evenly spaced. For additive metrics a missing period means nothing
 * happened (zero); for averages and extremes it is interpolated between its neighbours.
 */
export function regularize(series: ReadonlyArray<SeriesValue>, grain: BrainTimeGrain, aggregation: string): { series: SeriesValue[]; filled: number } {
    if (series.length < 2) return { series: [...series], filled: 0 };
    const additive = aggregation === BRAIN_METRIC_AGGREGATIONS.sum || aggregation === BRAIN_METRIC_AGGREGATIONS.count;
    const byPeriod = new Map(series.map(point => [point.period, point.value]));
    const result: SeriesValue[] = [];
    let filled = 0;
    for (let period = series[0].period; period <= series[series.length - 1].period && result.length < BRAIN_LIMITS.maxObservationPeriods; period = addPeriods(period, grain, 1)) {
        const value = byPeriod.get(period);
        if (value !== undefined) { result.push({ period, value }); continue; }
        filled++;
        if (additive) { result.push({ period, value: 0 }); continue; }
        const previous = result[result.length - 1];
        const next = series.find(point => point.period > period);
        result.push({ period, value: previous && next ? (previous.value + next.value) / 2 : previous?.value ?? next?.value ?? 0 });
    }
    return { series: result, filled };
}

interface Fit { readonly predict: (step: number) => number; readonly variance: (step: number) => number; readonly parameters: Record<string, number>; readonly residualStd: number }

function holtFit(values: ReadonlyArray<number>, alpha: number, beta: number): { level: number; trend: number; sse: number } {
    let level = values[0];
    let trend = values[1] - values[0];
    let sse = 0;
    for (let index = 1; index < values.length; index++) {
        const error = values[index] - (level + trend);
        sse += error * error;
        const nextLevel = alpha * values[index] + (1 - alpha) * (level + trend);
        trend = beta * (nextLevel - level) + (1 - beta) * trend;
        level = nextLevel;
    }
    return { level, trend, sse };
}

/** Holt's linear exponential smoothing with grid-searched smoothing parameters and its analytic error variance. */
export function holtLinear(values: ReadonlyArray<number>): Fit {
    let best = { alpha: 0.5, beta: 0.1, fit: holtFit(values, 0.5, 0.1) };
    for (let alpha = 0.1; alpha <= 0.91; alpha += 0.1) {
        for (const beta of [0.05, 0.1, 0.2, 0.3, 0.4, 0.5]) {
            const fit = holtFit(values, alpha, beta);
            if (fit.sse < best.fit.sse) best = { alpha, beta, fit };
        }
    }
    const sigma2 = best.fit.sse / Math.max(values.length - 3, 1);
    const { alpha, beta } = best;
    return {
        predict: step => best.fit.level + step * best.fit.trend,
        variance: step => {
            let sum = 1;
            for (let j = 1; j < step; j++) sum += alpha ** 2 * (1 + j * beta) ** 2;
            return sigma2 * sum;
        },
        parameters: { alpha: round(alpha, 2), beta: round(beta, 2), level: round(best.fit.level, 4), trend: round(best.fit.trend, 4) },
        residualStd: Math.sqrt(sigma2),
    };
}

/** Ordinary least squares on time with the textbook prediction interval. */
export function linearTrend(values: ReadonlyArray<number>): Fit {
    const n = values.length;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((total, value) => total + value, 0) / n;
    let sxx = 0;
    let sxy = 0;
    values.forEach((value, index) => { sxx += (index - meanX) ** 2; sxy += (index - meanX) * (value - meanY); });
    const slope = sxx ? sxy / sxx : 0;
    const intercept = meanY - slope * meanX;
    const sse = values.reduce((total, value, index) => total + (value - (intercept + slope * index)) ** 2, 0);
    const sigma2 = sse / Math.max(n - 2, 1);
    return {
        predict: step => intercept + slope * (n - 1 + step),
        variance: step => sigma2 * (1 + 1 / n + (n - 1 + step - meanX) ** 2 / (sxx || 1)),
        parameters: { slope: round(slope, 4), intercept: round(intercept, 4), r2: round(1 - sse / (values.reduce((total, value) => total + (value - meanY) ** 2, 0) || 1), 4) },
        residualStd: Math.sqrt(sigma2),
    };
}

const FITTERS: Readonly<Record<string, { readonly fit: (values: ReadonlyArray<number>) => Fit; readonly minimum: number; readonly version: string; readonly dofLoss: number }>> = {
    [BRAIN_METHODS.holtLinear.key]: { fit: holtLinear, minimum: BRAIN_LIMITS.minHoltPoints, version: BRAIN_METHODS.holtLinear.version, dofLoss: 3 },
    [BRAIN_METHODS.linearTrend.key]: { fit: linearTrend, minimum: BRAIN_LIMITS.minForecastPoints, version: BRAIN_METHODS.linearTrend.version, dofLoss: 2 },
};

/** Out-of-sample accuracy: fit on all but the last few points and score the forecast of those points. */
export function backtest(method: string, values: ReadonlyArray<number>): ForecastEvaluation {
    const holdout = Math.min(6, Math.max(2, Math.round(values.length * 0.2)));
    const train = values.slice(0, values.length - holdout);
    const fitter = FITTERS[method];
    if (!fitter || train.length < Math.max(3, fitter.minimum - holdout)) return { mape: null, rmse: Number.NaN, holdoutPoints: 0 };
    const fit = fitter.fit(train);
    const actual = values.slice(values.length - holdout);
    const errors = actual.map((value, index) => value - fit.predict(index + 1));
    const rmse = Math.sqrt(errors.reduce((total, error) => total + error * error, 0) / errors.length);
    const nonzero = actual.map((value, index) => ({ value, error: errors[index] })).filter(item => item.value !== 0);
    const mape = nonzero.length ? nonzero.reduce((total, item) => total + Math.abs(item.error / item.value), 0) / nonzero.length : null;
    return { mape: mape === null ? null : round(mape * 100, 2), rmse: round(rmse, 4), holdoutPoints: holdout };
}

/**
 * Forecasts a regular series with an approved method (or picks the one with the better backtest). Every point
 * carries a prediction interval at the requested confidence (FR-INT-004). A series whose history is never
 * negative is not forecast below zero.
 */
export function forecastSeries(series: ReadonlyArray<SeriesValue>, grain: BrainTimeGrain, horizon: number, method: ForecastMethodKey, confidence: number): ForecastOutput | { insufficient: string } {
    const values = series.map(point => point.value);
    if (values.length < BRAIN_LIMITS.minForecastPoints) return { insufficient: `A forecast needs at least ${BRAIN_LIMITS.minForecastPoints} periods of validated history; ${values.length} are available.` };
    const candidates = method === "auto" ? Object.keys(FITTERS).filter(key => values.length >= FITTERS[key].minimum) : [method];
    const chosenKey = candidates.length === 1 ? candidates[0] : candidates
        .map(key => ({ key, evaluation: backtest(key, values) }))
        .sort((a, b) => (a.evaluation.mape ?? Infinity) - (b.evaluation.mape ?? Infinity) || a.evaluation.rmse - b.evaluation.rmse)[0].key;
    const fitter = FITTERS[chosenKey];
    if (!fitter) return { insufficient: "The requested forecasting method is not in the approved method registry." };
    if (values.length < fitter.minimum) return { insufficient: `This method needs at least ${fitter.minimum} periods of history; ${values.length} are available.` };
    const fit = fitter.fit(values);
    const t = tQuantile(confidence, values.length - fitter.dofLoss);
    const nonNegative = values.every(value => value >= 0);
    let clampedAtZero = false;
    const last = series[series.length - 1].period;
    const points: ForecastPoint[] = Array.from({ length: horizon }, (_, index) => {
        const step = index + 1;
        const value = fit.predict(step);
        const width = t * Math.sqrt(fit.variance(step));
        let point = { period: addPeriods(last, grain, step), value, lower: value - width, upper: value + width };
        if (nonNegative && (point.value < 0 || point.lower < 0)) {
            clampedAtZero = true;
            point = { ...point, value: Math.max(point.value, 0), lower: Math.max(point.lower, 0) };
        }
        return { period: point.period, value: round(point.value, 4), lower: round(point.lower, 4), upper: round(point.upper, 4) };
    });
    return {
        method: { key: chosenKey, version: fitter.version }, points, evaluation: backtest(chosenKey, values),
        parameters: fit.parameters, confidenceLevel: confidence, residualStd: round(fit.residualStd, 4), clampedAtZero,
    };
}

/** Average half-width of the interval relative to the value, as a percentage: the "±x%" shown to users. */
export function relativeUncertainty(points: ReadonlyArray<ForecastPoint>): number | null {
    const relevant = points.filter(point => point.value !== 0);
    if (!relevant.length) return null;
    return round(relevant.reduce((total, point) => total + (point.upper - point.lower) / 2 / Math.abs(point.value), 0) / relevant.length * 100, 1);
}

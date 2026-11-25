import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { addPeriods, backtest, forecastSeries, isIncomplete, regularize, relativeUncertainty } from "../../src/modules/brain/services/intelligence/methods/forecasting.js";
import { simulate, validateAssumptions } from "../../src/modules/brain/services/intelligence/methods/simulation.js";
import { allocate } from "../../src/modules/brain/services/intelligence/methods/optimisation.js";
import { decompose } from "../../src/modules/brain/services/intelligence/methods/root-cause.js";
import { METHOD_REGISTRY } from "../../src/modules/brain/services/intelligence/method-registry.js";

const monthly = (values: number[]) => values.map((value, index) => ({ period: addPeriods("2025-01-01", "month", index), value }));

describe("forecasting", () => {
    test("a perfect linear trend is extrapolated exactly with a narrow interval", () => {
        const series = monthly(Array.from({ length: 12 }, (_, index) => 100 + 10 * index));
        const output = forecastSeries(series, "month", 3, "ols-linear-trend", 0.8);
        assert.ok(!("insufficient" in output));
        assert.deepEqual(output.points.map(point => point.value), [220, 230, 240]);
        assert.deepEqual(output.points.map(point => point.period), ["2026-01-01", "2026-02-01", "2026-03-01"]);
        assert.ok(output.points.every(point => point.upper - point.lower < 1e-6));
        assert.equal(output.evaluation.mape, 0);
    });

    test("intervals widen with the horizon and never cross zero for non-negative metrics", () => {
        const noisy = monthly([5, 9, 4, 11, 6, 3, 8, 2, 7, 4, 3, 1]);
        const output = forecastSeries(noisy, "month", 6, "holt-linear", 0.95);
        assert.ok(!("insufficient" in output));
        const widths = output.points.map(point => point.upper - point.lower);
        assert.ok(widths[5] >= widths[0]);
        assert.ok(output.points.every(point => point.lower >= 0 && point.value >= 0));
        assert.ok(relativeUncertainty(output.points)! > 0);
    });

    test("too little history yields no estimate", () => {
        const output = forecastSeries(monthly([1, 2, 3]), "month", 3, "auto", 0.8);
        assert.ok("insufficient" in output);
        assert.equal(backtest("holt-linear", [1, 2, 3]).holdoutPoints, 0);
    });

    test("auto selects among registered methods only", () => {
        const output = forecastSeries(monthly(Array.from({ length: 14 }, (_, index) => 50 + 3 * index + (index % 2))), "month", 2, "auto", 0.9);
        assert.ok(!("insufficient" in output));
        assert.ok(METHOD_REGISTRY.some(method => method.key === output.method.key && method.version === output.method.version));
    });

    test("gaps are zero for additive metrics and interpolated otherwise; in-progress periods are detected", () => {
        const gappy = [{ period: "2026-01-01", value: 10 }, { period: "2026-03-01", value: 30 }];
        assert.deepEqual(regularize(gappy, "month", "sum").series.map(point => point.value), [10, 0, 30]);
        assert.deepEqual(regularize(gappy, "month", "avg").series.map(point => point.value), [10, 20, 30]);
        assert.equal(isIncomplete("2026-06-01", "month", new Date("2026-06-15T00:00:00Z")), true);
        assert.equal(isIncomplete("2026-05-01", "month", new Date("2026-06-15T00:00:00Z")), false);
        assert.equal(addPeriods("2026-11-01", "quarter", 1), "2027-02-01");
    });
});

describe("what-if simulation", () => {
    const baseline = [1, 2, 3].map(step => ({ period: addPeriods("2026-01-01", "month", step - 1), value: 100, lower: 90, upper: 110 }));

    test("level, growth, ramp and absolute assumptions apply from their start period", () => {
        const output = simulate(baseline, [
            { key: "level", label: "Price change", type: "level_percent", value: 10 },
            { key: "ramp", label: "New hires", type: "ramp_percent", value: 20, startPeriod: 2, rampPeriods: 2 },
            { key: "fixed", label: "One-off", type: "level_absolute", value: 5, startPeriod: 3 },
        ]);
        assert.deepEqual(output.periods.map(period => period.scenario), [110, 121, 137]);
        assert.equal(output.totals.baseline, 300);
        assert.equal(output.totals.scenario, 368);
        assert.equal(output.totals.deltaPercent, 22.67);
        assert.ok(output.periods.every(period => period.lower <= period.scenario && period.scenario <= period.upper));
        assert.equal(output.sensitivity.length, 3);
        assert.ok(output.sensitivity.every((item, index, list) => index === 0 || list[index - 1].swing >= item.swing), "sensitivity is ordered by swing");
        assert.ok(output.sensitivity.every(item => item.low <= item.high));
    });

    test("assumptions are validated against units, bounds and the horizon before running", () => {
        const issues = validateAssumptions([
            { key: "a", label: "Too big", type: "level_percent", value: 900 },
            { key: "b", label: "Late", type: "growth_percent", value: 5, startPeriod: 9 },
            { key: "c", label: "Typo", type: "level_absolute", value: 1e9 },
            { key: "d", label: "Ramp", type: "ramp_percent", value: 5 },
        ], 3, baseline, "currency");
        assert.equal(issues.length, 4);
        assert.deepEqual(validateAssumptions([{ key: "ok", label: "Fine", type: "level_percent", value: 15 }], 3, baseline, "currency"), []);
    });

    test("business constraints are reported, not silently enforced", () => {
        const output = simulate(baseline, [{ key: "cut", label: "Cut", type: "level_percent", value: -50 }], [{ label: "Minimum revenue", min: 80 }]);
        assert.equal(output.violations.length, 3);
    });
});

describe("optimisation", () => {
    test("moves budget toward the higher marginal return within bounds and never lowers the modelled return", () => {
        const result = allocate([
            { key: "search", label: "Search", currentSpend: 100, currentReturn: 400, min: 50, max: 300 },
            { key: "display", label: "Display", currentSpend: 100, currentReturn: 100, min: 50, max: 300 },
        ], 200);
        assert.equal(result.feasibility.status, "feasible");
        const search = result.allocations.find(item => item.key === "search")!;
        assert.ok(search.recommended > 100);
        assert.ok(result.totals.expectedReturn >= result.totals.currentReturn);
        assert.ok(Math.abs(result.totals.allocated - 200) < 1e-6);
        assert.ok(result.allocations.every(item => item.recommended >= 50 && item.recommended <= 300));
    });

    test("infeasible bounds are reported instead of guessed", () => {
        const result = allocate([{ key: "a", label: "A", currentSpend: 10, currentReturn: 10, min: 100, max: 200 }], 50);
        assert.equal(result.feasibility.status, "infeasible");
        assert.equal(result.allocations.length, 0);
    });
});

describe("root-cause decomposition", () => {
    test("additive contributions add up to the total change", () => {
        const result = decompose([
            { value: "EMEA", previous: 100, current: 80 },
            { value: "APAC", previous: 50, current: 90 },
            { value: "NA", previous: 70, current: 70 },
        ], "sum");
        assert.equal(result.delta, 20);
        assert.equal(result.drivers[0].value, "APAC");
        assert.equal(Math.round(result.drivers.reduce((sum, driver) => sum + driver.contributionPercent, 0)), 100);
        assert.equal(result.additive, true);
    });

    test("non-additive metrics are caveated", () => {
        const result = decompose([{ value: "A", previous: 2, current: 3 }, { value: "B", previous: 4, current: 4 }], "avg", { current: 3.5, previous: 3 });
        assert.equal(result.additive, false);
        assert.ok(result.caveats.some(caveat => caveat.includes("not additive")));
    });
});

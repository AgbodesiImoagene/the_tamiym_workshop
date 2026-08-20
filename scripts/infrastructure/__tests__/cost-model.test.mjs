import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NORMAL_MONTH_CEILING_USD,
  buildCostReport,
  evaluateAgainstCeiling,
  expectedTwelveMonthScenario,
  minimalBaselineScenario,
  stressScaleScenario,
  sumLineItems,
  temporaryValidationCost,
} from '../cost-model.mjs';

test('sumLineItems rejects negative amounts', () => {
  assert.throws(() => sumLineItems([{ name: 'bad', usdPerMonth: -1, source: 'x' }]));
});

test('mandatory baseline stays under the USD 50 ceiling', () => {
  const result = evaluateAgainstCeiling(minimalBaselineScenario());
  assert.equal(result.totalUsdPerMonth, 45.65);
  assert.equal(result.withinCeiling, true);
  assert.ok(result.headroomUsd > 0);
  assert.ok(result.totalUsdPerMonth <= NORMAL_MONTH_CEILING_USD);
});

test('expected low-traffic month stays under the ceiling', () => {
  const result = evaluateAgainstCeiling(expectedTwelveMonthScenario());
  assert.equal(result.withinCeiling, true);
  assert.ok(result.totalUsdPerMonth < NORMAL_MONTH_CEILING_USD);
});

test('stress scale-event month exceeds the normal ceiling', () => {
  const result = evaluateAgainstCeiling(stressScaleScenario());
  assert.equal(result.withinCeiling, false);
  assert.ok(result.totalUsdPerMonth > NORMAL_MONTH_CEILING_USD);
});

test('temporary validation cost scales with hours and includes Spaces subscription risk', () => {
  const eightHours = temporaryValidationCost(8);
  const sixteenHours = temporaryValidationCost(16);
  assert.ok(sixteenHours.usdEstimate > eightHours.usdEstimate);
  assert.ok(eightHours.usdEstimate >= 5);
});

test('buildCostReport exposes dated verdict', () => {
  const report = buildCostReport();
  assert.equal(report.priceAsOf, '2026-08-20');
  assert.equal(report.verdict.mandatoryBaselineFits, true);
  assert.equal(report.verdict.expectedLowTrafficFits, true);
  assert.equal(report.verdict.stressExceedsCeiling, true);
});

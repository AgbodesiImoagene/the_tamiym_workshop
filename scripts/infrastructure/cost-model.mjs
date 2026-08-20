#!/usr/bin/env node
/**
 * TTW-060 reproducible DigitalOcean launch cost model.
 * Prices are dated inputs; arithmetic is deterministic and unit-tested.
 */

import { fileURLToPath } from 'node:url';

/** @typedef {{ name: string, usdPerMonth: number, source: string, notes?: string }} LineItem */

/**
 * @typedef {object} CostScenario
 * @property {string} id
 * @property {string} label
 * @property {LineItem[]} items
 */

export const PRICE_AS_OF = '2026-08-20';

/** Official public list prices captured for TTW-060 (ex-tax). */
export const PRICE_CATALOG = Object.freeze({
  droplet_basic_4gib_2vcpu: {
    usdPerMonth: 24.0,
    source: 'https://www.digitalocean.com/pricing/droplets',
  },
  droplet_basic_8gib_4vcpu: {
    usdPerMonth: 48.0,
    source: 'https://www.digitalocean.com/pricing/droplets',
  },
  managed_postgres_basic_1gib: {
    usdPerMonth: 15.15,
    source: 'https://www.digitalocean.com/pricing/managed-databases',
  },
  managed_valkey_basic_1gib: {
    usdPerMonth: 15.0,
    source: 'https://www.digitalocean.com/pricing/managed-databases',
  },
  spaces_subscription: {
    usdPerMonth: 5.0,
    source: 'https://www.digitalocean.com/pricing/spaces-object-storage',
  },
  reserved_ip_assigned: {
    usdPerMonth: 0.0,
    source:
      'https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/',
  },
  reserved_ip_unassigned: {
    usdPerMonth: 5.0,
    source:
      'https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/',
  },
  monitoring_included: {
    usdPerMonth: 0.0,
    source: 'https://docs.digitalocean.com/products/monitoring/details/pricing/',
  },
  uptime_extra_check: {
    usdPerMonth: 1.0,
    source: 'https://docs.digitalocean.com/products/uptime/details/pricing/',
  },
  droplet_bandwidth_overage_per_gib: {
    usdPerMonth: 0.01,
    source: 'https://docs.digitalocean.com/platform/billing/bandwidth/',
  },
  spaces_storage_overage_per_gib: {
    usdPerMonth: 0.02,
    source: 'https://docs.digitalocean.com/products/spaces/details/pricing/',
  },
  spaces_transfer_overage_per_gib: {
    usdPerMonth: 0.01,
    source: 'https://docs.digitalocean.com/products/spaces/details/pricing/',
  },
  off_provider_backup_estimate: {
    usdPerMonth: 1.5,
    source: 'TTW-060 planning estimate for encrypted off-provider DB/config export',
  },
});

export const NORMAL_MONTH_CEILING_USD = 50;

/**
 * @param {LineItem[]} items
 * @returns {{ totalUsdPerMonth: number; items: LineItem[] }}
 */
export function sumLineItems(items) {
  const totalUsdPerMonth = items.reduce((sum, item) => {
    if (!Number.isFinite(item.usdPerMonth) || item.usdPerMonth < 0) {
      throw new Error(`Invalid line item amount for ${item.name}`);
    }
    return sum + item.usdPerMonth;
  }, 0);
  return {
    totalUsdPerMonth: Number(totalUsdPerMonth.toFixed(2)),
    items,
  };
}

/**
 * Mandatory always-on launch baseline under the owner ceiling.
 * @returns {CostScenario}
 */
export function minimalBaselineScenario() {
  const c = PRICE_CATALOG;
  return {
    id: 'minimal',
    label: 'Mandatory always-on launch baseline',
    items: [
      {
        name: 'Basic Droplet 4 GiB / 2 vCPU',
        usdPerMonth: c.droplet_basic_4gib_2vcpu.usdPerMonth,
        source: c.droplet_basic_4gib_2vcpu.source,
      },
      {
        name: 'Managed PostgreSQL basic 1 GiB (single-node)',
        usdPerMonth: c.managed_postgres_basic_1gib.usdPerMonth,
        source: c.managed_postgres_basic_1gib.source,
      },
      {
        name: 'Spaces subscription',
        usdPerMonth: c.spaces_subscription.usdPerMonth,
        source: c.spaces_subscription.source,
      },
      {
        name: 'Reserved IPv4 (assigned)',
        usdPerMonth: c.reserved_ip_assigned.usdPerMonth,
        source: c.reserved_ip_assigned.source,
      },
      {
        name: 'DigitalOcean Monitoring',
        usdPerMonth: c.monitoring_included.usdPerMonth,
        source: c.monitoring_included.source,
      },
      {
        name: 'Off-provider encrypted backup export (estimate)',
        usdPerMonth: c.off_provider_backup_estimate.usdPerMonth,
        source: c.off_provider_backup_estimate.source,
        notes: 'Excluded from provider invoice; counted toward ceiling discipline',
      },
    ],
  };
}

/**
 * Expected first 12 months under low Nigeria traffic.
 * @returns {CostScenario}
 */
export function expectedTwelveMonthScenario() {
  const base = minimalBaselineScenario();
  return {
    id: 'expected-12m',
    label: 'Expected low-traffic 12-month month',
    items: [
      ...base.items,
      {
        name: 'Uptime checks beyond free allowance (1 extra)',
        usdPerMonth: PRICE_CATALOG.uptime_extra_check.usdPerMonth,
        source: PRICE_CATALOG.uptime_extra_check.source,
      },
      {
        name: 'Spaces storage overage (25 GiB)',
        usdPerMonth: Number(
          (25 * PRICE_CATALOG.spaces_storage_overage_per_gib.usdPerMonth).toFixed(2),
        ),
        source: PRICE_CATALOG.spaces_storage_overage_per_gib.source,
      },
      {
        name: 'Droplet bandwidth overage (50 GiB)',
        usdPerMonth: Number(
          (50 * PRICE_CATALOG.droplet_bandwidth_overage_per_gib.usdPerMonth).toFixed(
            2,
          ),
        ),
        source: PRICE_CATALOG.droplet_bandwidth_overage_per_gib.source,
      },
    ],
  };
}

/**
 * Exceptional scale-event month (not the normal ceiling target).
 * @returns {CostScenario}
 */
export function stressScaleScenario() {
  const c = PRICE_CATALOG;
  return {
    id: 'stress',
    label: 'Exceptional scale-event month (exceeds normal ceiling)',
    items: [
      {
        name: 'Basic Droplet 8 GiB / 4 vCPU (vertical resize)',
        usdPerMonth: c.droplet_basic_8gib_4vcpu.usdPerMonth,
        source: c.droplet_basic_8gib_4vcpu.source,
      },
      {
        name: 'Managed PostgreSQL basic 1 GiB',
        usdPerMonth: c.managed_postgres_basic_1gib.usdPerMonth,
        source: c.managed_postgres_basic_1gib.source,
      },
      {
        name: 'Managed Valkey 1 GiB (isolation upgrade)',
        usdPerMonth: c.managed_valkey_basic_1gib.usdPerMonth,
        source: c.managed_valkey_basic_1gib.source,
      },
      {
        name: 'Spaces subscription',
        usdPerMonth: c.spaces_subscription.usdPerMonth,
        source: c.spaces_subscription.source,
      },
      {
        name: 'Reserved IPv4 (assigned)',
        usdPerMonth: c.reserved_ip_assigned.usdPerMonth,
        source: c.reserved_ip_assigned.source,
      },
      {
        name: 'Off-provider encrypted backup export (estimate)',
        usdPerMonth: c.off_provider_backup_estimate.usdPerMonth,
        source: c.off_provider_backup_estimate.source,
      },
      {
        name: 'Spaces transfer overage (500 GiB)',
        usdPerMonth: Number(
          (500 * c.spaces_transfer_overage_per_gib.usdPerMonth).toFixed(2),
        ),
        source: c.spaces_transfer_overage_per_gib.source,
      },
    ],
  };
}

/**
 * Temporary validation resources billed only while alive (hourly → monthly-equivalent).
 * @param {number} hoursAlive
 */
export function temporaryValidationCost(hoursAlive = 8) {
  if (!Number.isFinite(hoursAlive) || hoursAlive < 0) {
    throw new Error('hoursAlive must be a non-negative number');
  }
  const hourlyDroplet = 24 / 672; // DO monthly cap ≈ 672 hours
  const hourlyPg = 15.15 / 672;
  const fixedSpaces = 5; // Spaces bills for the subscription month once created
  const variable = (hourlyDroplet + hourlyPg) * hoursAlive;
  return {
    hoursAlive,
    usdEstimate: Number((fixedSpaces + variable).toFixed(2)),
    notes:
      'Destroy temporary Droplet/DB promptly; Spaces subscription remains until all buckets destroyed',
  };
}

/**
 * @param {CostScenario} scenario
 */
export function evaluateAgainstCeiling(scenario, ceiling = NORMAL_MONTH_CEILING_USD) {
  const { totalUsdPerMonth, items } = sumLineItems(scenario.items);
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    priceAsOf: PRICE_AS_OF,
    ceilingUsd: ceiling,
    totalUsdPerMonth,
    withinCeiling: totalUsdPerMonth <= ceiling,
    headroomUsd: Number((ceiling - totalUsdPerMonth).toFixed(2)),
    items,
  };
}

export function buildCostReport() {
  const scenarios = [
    minimalBaselineScenario(),
    expectedTwelveMonthScenario(),
    stressScaleScenario(),
  ].map((scenario) => evaluateAgainstCeiling(scenario));

  return {
    priceAsOf: PRICE_AS_OF,
    normalMonthCeilingUsd: NORMAL_MONTH_CEILING_USD,
    exclusions: [
      'tax',
      'payment-provider fees',
      'domain renewal',
      'exceptional scale events',
    ],
    scenarios,
    temporaryValidationExample: temporaryValidationCost(8),
    verdict: {
      mandatoryBaselineFits:
        scenarios.find((s) => s.scenarioId === 'minimal')?.withinCeiling === true,
      expectedLowTrafficFits:
        scenarios.find((s) => s.scenarioId === 'expected-12m')?.withinCeiling ===
        true,
      stressExceedsCeiling:
        scenarios.find((s) => s.scenarioId === 'stress')?.withinCeiling === false,
    },
  };
}

function main() {
  const report = buildCostReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.verdict.mandatoryBaselineFits || !report.verdict.expectedLowTrafficFits) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

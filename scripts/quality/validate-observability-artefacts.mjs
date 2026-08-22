#!/usr/bin/env node
/**
 * Validate observability artefacts: Prometheus alert rules and Grafana dashboards
 * reference canonical metric names from the API metrics manifest.
 *
 * Usage:
 *   node scripts/quality/validate-observability-artefacts.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  collectDashboardExpressions,
  loadMetricsManifest,
  parsePrometheusRulesYaml,
  validateExpressionMetrics,
} from './observability-metrics.mjs';

const repoRoot = process.cwd();
const alertsPath = resolve(repoRoot, 'docker/observability/prometheus/alerts.yml');
const dashboardsDir = resolve(
  repoRoot,
  'docker/observability/grafana/provisioning/dashboards/json',
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertExists(path, label) {
  if (!existsSync(path)) {
    fail(`Missing ${label}: ${path}`);
  }
}

assertExists(alertsPath, 'Prometheus alerts file');
assertExists(dashboardsDir, 'Grafana dashboards directory');

const manifest = loadMetricsManifest(repoRoot);
console.log(`Metrics manifest: ${manifest.version} (${manifest.baseMetrics.length} base metrics)`);

const alertsYaml = readFileSync(alertsPath, 'utf8');
const groups = parsePrometheusRulesYaml(alertsYaml);

if (groups.length === 0) {
  fail('No Prometheus rule groups parsed from alerts.yml');
}

const alertErrors = [];
for (const group of groups) {
  for (const rule of group.rules) {
    if (!rule.expr) {
      alertErrors.push(`${group.name}/${rule.name}: missing expr`);
      continue;
    }
    const unknown = validateExpressionMetrics(rule.expr, manifest);
    if (unknown.length > 0) {
      alertErrors.push(
        `${group.name}/${rule.name}: unknown metrics: ${unknown.join(', ')}`,
      );
    }
  }
}

if (alertErrors.length > 0) {
  console.error('Prometheus alert validation failed:');
  for (const err of alertErrors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(
  `Prometheus alerts OK (${groups.length} groups, ${groups.reduce((n, g) => n + g.rules.length, 0)} rules)`,
);

const dashboardErrors = [];
const dashboardFiles = readdirSync(dashboardsDir).filter((f) => f.endsWith('.json'));

if (dashboardFiles.length === 0) {
  fail(`No dashboard JSON files in ${dashboardsDir}`);
}

for (const file of dashboardFiles) {
  const fullPath = resolve(dashboardsDir, file);
  const dashboard = JSON.parse(readFileSync(fullPath, 'utf8'));
  const expressions = collectDashboardExpressions(dashboard);

  if (expressions.length === 0) {
    dashboardErrors.push(`${file}: no panel expressions found`);
    continue;
  }

  for (const expr of expressions) {
    const unknown = validateExpressionMetrics(expr, manifest);
    if (unknown.length > 0) {
      dashboardErrors.push(`${file}: unknown metrics in "${expr}": ${unknown.join(', ')}`);
    }
  }
}

if (dashboardErrors.length > 0) {
  console.error('Grafana dashboard validation failed:');
  for (const err of dashboardErrors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`Grafana dashboards OK (${dashboardFiles.length} files)`);
console.log('Observability artefact validation passed.');

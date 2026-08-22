import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAllowedMetricSet,
  collectDashboardExpressions,
  extractMetricTokens,
  loadMetricsManifest,
  normalizeMetricToken,
  parsePrometheusRulesYaml,
  validateExpressionMetrics,
} from '../observability-metrics.mjs';

test('loadMetricsManifest includes core API metrics', () => {
  const manifest = loadMetricsManifest();
  assert.ok(manifest.baseMetrics.includes('http_server_requests_total'));
  assert.ok(manifest.baseMetrics.includes('webhook_events_total'));
  assert.equal(manifest.namespace, 'tamiym');
});

test('extractMetricTokens finds prefixed and native metrics', () => {
  const tokens = extractMetricTokens(
    'sum(rate(tamiym_http_server_requests_total[5m])) and up{job="otel-collector"}',
  );
  assert.ok(tokens.includes('tamiym_http_server_requests_total'));
  assert.ok(tokens.includes('up'));
});

test('validateExpressionMetrics accepts known metrics and recording rules', () => {
  const manifest = loadMetricsManifest();
  const unknown = validateExpressionMetrics(
    'tamiym:http_5xx_rate:ratio5m > 0.05 or up{job="otel-collector"} == 0',
    manifest,
  );
  assert.deepEqual(unknown, []);
});

test('validateExpressionMetrics rejects unknown metrics', () => {
  const manifest = loadMetricsManifest();
  const unknown = validateExpressionMetrics('sum(tamiym_unknown_metric_total)', manifest);
  assert.ok(unknown.includes('tamiym_unknown_metric_total'));
});

test('normalizeMetricToken strips histogram suffixes', () => {
  assert.equal(
    normalizeMetricToken('tamiym_http_server_request_duration_ms_bucket'),
    'tamiym_http_server_request_duration_ms',
  );
});

test('parsePrometheusRulesYaml extracts alert and record expr blocks', () => {
  const yaml = `
groups:
  - name: test
    rules:
      - alert: TestAlert
        expr: up == 0
      - record: tamiym:test:rate5m
        expr: |
          sum(rate(tamiym_http_server_requests_total[5m]))
`;
  const groups = parsePrometheusRulesYaml(yaml);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rules.length, 2);
  assert.equal(groups[0].rules[0].expr, 'up == 0');
  assert.ok(groups[0].rules[1].expr.includes('tamiym_http_server_requests_total'));
});

test('collectDashboardExpressions reads panel targets', () => {
  const dashboard = {
    panels: [
      {
        targets: [{ expr: 'sum(rate(tamiym_auth_login_total[5m]))' }],
      },
    ],
  };
  const exprs = collectDashboardExpressions(dashboard);
  assert.equal(exprs.length, 1);
  assert.ok(exprs[0].includes('tamiym_auth_login_total'));
});

test('buildAllowedMetricSet includes histogram suffixes', () => {
  const manifest = loadMetricsManifest();
  const allowed = buildAllowedMetricSet(manifest);
  assert.ok(allowed.has('tamiym_http_server_request_duration_ms_bucket'));
  assert.ok(allowed.has('up'));
});

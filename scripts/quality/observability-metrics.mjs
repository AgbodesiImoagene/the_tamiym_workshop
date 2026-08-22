import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HISTOGRAM_SUFFIXES = ['_bucket', '_count', '_sum'];
const RECORDING_PREFIX = 'tamiym:';

/**
 * Load canonical observability metric names from the API metrics manifest.
 */
export function loadMetricsManifest(repoRoot = process.cwd()) {
  const manifestPath = resolve(repoRoot, 'apps/api/src/observability/metrics.manifest.json');
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const namespace = raw.namespace ?? 'tamiym';
  const baseMetrics = raw.metrics ?? [];
  const nativeMetrics = raw.prometheusNativeMetrics ?? ['up'];
  return { namespace, baseMetrics, nativeMetrics, version: raw.version };
}

/**
 * Build the set of allowed Prometheus metric identifiers (with namespace prefix).
 */
export function buildAllowedMetricSet(manifest) {
  const { namespace, baseMetrics, nativeMetrics } = manifest;
  const allowed = new Set(nativeMetrics);

  for (const base of baseMetrics) {
    allowed.add(`${namespace}_${base}`);
    for (const suffix of HISTOGRAM_SUFFIXES) {
      allowed.add(`${namespace}_${base}${suffix}`);
    }
  }

  // Recording rules use colon-separated names under tamiym: prefix
  allowed.add(RECORDING_PREFIX);

  return allowed;
}

/**
 * Extract Prometheus metric-like tokens from a PromQL expression or dashboard query.
 */
export function extractMetricTokens(expression) {
  const tokens = new Set();

  const prefixed = expression.matchAll(/\b(tamiym_[a-z][a-z0-9_]*)\b/g);
  for (const match of prefixed) {
    tokens.add(match[1]);
  }

  const recording = expression.matchAll(/\b(tamiym:[a-z][a-z0-9_:/]*)\b/g);
  for (const match of recording) {
    tokens.add(match[1]);
  }

  const native = expression.matchAll(/\b(up|scrape_duration_seconds|scrape_samples_scraped)\b/g);
  for (const match of native) {
    tokens.add(match[1]);
  }

  return [...tokens];
}

/**
 * Normalize a scraped token to its canonical base metric name for validation.
 */
export function normalizeMetricToken(token, namespace = 'tamiym') {
  if (token.startsWith(RECORDING_PREFIX)) {
    return token;
  }

  if (!token.startsWith(`${namespace}_`)) {
    return token;
  }

  let stripped = token.slice(namespace.length + 1);
  for (const suffix of HISTOGRAM_SUFFIXES) {
    if (stripped.endsWith(suffix)) {
      stripped = stripped.slice(0, -suffix.length);
      break;
    }
  }
  return `${namespace}_${stripped}`;
}

/**
 * Validate that every metric token in an expression is known.
 */
export function validateExpressionMetrics(expression, manifest) {
  const allowedBases = new Set([
    ...manifest.baseMetrics.map((m) => `${manifest.namespace}_${m}`),
    ...manifest.nativeMetrics,
  ]);
  const recordingAllowed = new Set([
    'tamiym:http_5xx_rate:ratio5m',
    'tamiym:http_request_duration_ms:p95_5m',
    'tamiym:webhook_failure_rate:5m',
    'tamiym:webhook_denied_rate:5m',
    'tamiym:queue_job_failure_rate:5m',
  ]);

  const unknown = [];
  for (const token of extractMetricTokens(expression)) {
    if (token.startsWith(RECORDING_PREFIX)) {
      if (!recordingAllowed.has(token)) {
        unknown.push(token);
      }
      continue;
    }

    const normalized = normalizeMetricToken(token, manifest.namespace);
    if (!allowedBases.has(normalized) && !manifest.nativeMetrics.includes(token)) {
      unknown.push(token);
    }
  }

  return unknown;
}

/**
 * Minimal YAML alert rule parser for Prometheus groups (no external YAML dep).
 */
export function parsePrometheusRulesYaml(yamlText) {
  const groups = [];
  let currentGroup = null;
  let currentRule = null;
  let exprLines = null;
  let inExprBlock = false;

  const lines = yamlText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') {
      continue;
    }

    if (trimmed.startsWith('- name:')) {
      currentGroup = { name: trimmed.replace('- name:', '').trim(), rules: [] };
      groups.push(currentGroup);
      currentRule = null;
      exprLines = null;
      inExprBlock = false;
      continue;
    }

    if (!currentGroup) {
      continue;
    }

    if (trimmed.startsWith('- alert:') || trimmed.startsWith('- record:')) {
      if (currentRule && exprLines !== null) {
        currentRule.expr = exprLines.join(' ').trim();
      }
      const type = trimmed.startsWith('- alert:') ? 'alert' : 'record';
      const name = trimmed.replace(/^- (alert|record):\s*/, '').trim();
      currentRule = { type, name, expr: '' };
      currentGroup.rules.push(currentRule);
      exprLines = null;
      inExprBlock = false;
      continue;
    }

    if (!currentRule) {
      continue;
    }

    if (trimmed.startsWith('expr:')) {
      const inline = trimmed.slice('expr:'.length).trim();
      if (inline === '|' || inline === '') {
        exprLines = [];
        inExprBlock = true;
      } else {
        currentRule.expr = inline;
        exprLines = null;
        inExprBlock = false;
      }
      continue;
    }

    if (inExprBlock && exprLines !== null) {
      // Continuation of multiline expr until a new top-level rule field at same indent
      if (/^(for|labels|annotations):/.test(trimmed)) {
        currentRule.expr = exprLines.join(' ').trim();
        exprLines = null;
        inExprBlock = false;
        i -= 1;
        continue;
      }
      if (trimmed) {
        exprLines.push(trimmed);
      }
      continue;
    }
  }

  if (currentRule && exprLines !== null) {
    currentRule.expr = exprLines.join(' ').trim();
  }

  return groups;
}

/**
 * Collect expr fields from Grafana dashboard JSON (panels.targets).
 */
export function collectDashboardExpressions(dashboard) {
  const expressions = [];
  const panels = dashboard.panels ?? [];
  for (const panel of panels) {
    const targets = panel.targets ?? [];
    for (const target of targets) {
      if (typeof target.expr === 'string' && target.expr.trim()) {
        expressions.push(target.expr);
      }
    }
  }
  return expressions;
}

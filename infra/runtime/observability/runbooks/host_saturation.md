# Runbook: host_saturation

**Alert:** `host_saturation` · **Severity:** ticket · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Sustained high CPU/memory; OOM killer risk; latency climb on the 4 GiB Droplet.

## Immediate actions

1. Identify top consumers (`docker stats`, process list).
2. Check for log storms, runaway jobs, or accidental observability stack on host.
3. Shed load: pause non-critical queues; defer heavy admin jobs.
4. Do not add permanent Prometheus/Grafana/Jaeger to prod host to “debug”.
5. If envelope exceeded repeatedly → owner capacity/incident review (scale event month).

## Escalation

OOM or thrashing → treat as page-level; consider temporary traffic controls.

## Related

- TTW-060 resource budget; TTW-066 cost warning.

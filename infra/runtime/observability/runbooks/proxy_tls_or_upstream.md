# Runbook: proxy_tls_or_upstream

**Alert:** `proxy_tls_or_upstream` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Caddy TLS errors, certificate renewal failure, or upstream 502/503 to Compose services.

## Immediate actions

1. Confirm public DNS still points at reserved IP (TTW-062).
2. Check `proxy` container logs (redact); verify upstreams `web`/`app`/`admin`/`api` healthy.
3. If cert issue → confirm HTTP-01/ports 80+443 open on Cloud Firewall only as designed.
4. Restart `proxy` only after upstreams are healthy; avoid flapping.

## Escalation

Sustained public outage with healthy Droplet → owner + DNS/edge review.

## Related

- `infra/runtime/edge/Caddyfile`; TTW-062 network/edge.

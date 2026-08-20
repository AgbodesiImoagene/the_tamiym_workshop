-- At most one non-terminal erasure request per user (concurrent DSAR safety).
CREATE UNIQUE INDEX "privacy_requests_one_active_erasure_per_user"
ON "privacy_requests" ("userId")
WHERE "type" = 'ERASURE' AND "status" IN ('PENDING', 'IN_PROGRESS', 'HELD');

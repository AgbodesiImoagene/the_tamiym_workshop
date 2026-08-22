/**
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 *
 * This file is generated from docs/openapi/openapi.json.
 * Run `pnpm openapi:generate` to regenerate.
 *
 * Source: docs/openapi/openapi.json
 */
export interface paths {
    "/v1/admin/analytics/campaigns/{campaignId}/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Campaign fundraising snapshot (admin)
         * @description Goal, gross currentAmount cache, ledger eligible balance, paid orders, last payout + meta.
         */
        get: operations["AnalyticsController_getCampaignSnapshot"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/drilldowns/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Drill-down: orders matching analytics filters (admin) */
        get: operations["AnalyticsController_drilldownOrders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/drilldowns/payouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Drill-down: succeeded payouts (admin) */
        get: operations["AnalyticsController_drilldownPayouts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/drilldowns/reconciliation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Drill-down: open/acknowledged reconciliation findings (admin)
         * @description Masked TTW-015 findings for KPI discrepancy investigation.
         */
        get: operations["AnalyticsController_drilldownReconciliation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/drilldowns/refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Drill-down: succeeded refunds (admin) */
        get: operations["AnalyticsController_drilldownRefunds"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/drilldowns/settlements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Drill-down: succeeded payment settlements (admin) */
        get: operations["AnalyticsController_drilldownSettlements"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export CSV (admin)
         * @description entity=orders|campaigns required vocabulary; unknown entities rejected. Same filters as overview. Max 10_000 rows. Audited.
         */
        get: operations["AnalyticsController_exportCsv"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/money-metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Money-truth metrics (admin)
         * @description Payout pipeline, gross cache vs ledger-eligible, paid-out value. Includes TTW-036 meta. Optional campaign/date filters apply to gross/paid-out/ledger slices.
         */
        get: operations["AnalyticsController_getMoneyMetrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get analytics overview (admin)
         * @description Versioned KPI overview (analytics-kpi/v1-interim-2026-08-21). Filters: Lagos date window, campaign, product, order/payment status, channel, currency. Returns catalogue metrics + meta (definitionVersion, cutoff, freshness).
         */
        get: operations["AnalyticsController_getOverview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/analytics/payouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get payout overview metrics (admin)
         * @description Subset of money-metrics (backward compatible). Prefer GET money-metrics for full snapshot.
         */
        get: operations["AnalyticsController_getPayoutOverview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/bulk-pricing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List bulk pricing tiers (optional filter by productId) */
        get: operations["AdminBulkPricingController_findAll"];
        put?: never;
        /** Create bulk pricing tier (validates no overlap) */
        post: operations["AdminBulkPricingController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/bulk-pricing/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete bulk pricing tier */
        delete: operations["AdminBulkPricingController_remove"];
        options?: never;
        head?: never;
        /** Update bulk pricing tier (re-validates no overlap) */
        patch: operations["AdminBulkPricingController_update"];
        trace?: never;
    };
    "/v1/admin/campaigns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List all campaigns (admin)
         * @description Filter by status=REVIEW to see campaigns awaiting human review.
         */
        get: operations["AdminCampaignsController_findAll"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/campaigns/{campaignId}/payouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Initiate payout for a campaign (admin) */
        post: operations["AdminPayoutsController_initiatePayout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/campaigns/{campaignId}/payouts/manual-adjustment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request off-ledger manual adjustment (requires second admin approval) */
        post: operations["AdminPayoutsController_requestManualAdjustment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/campaigns/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get full campaign detail for admin review */
        get: operations["AdminCampaignsController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/campaigns/{id}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Activate campaign after review (REVIEW → ACTIVE)
         * @description Requires TTW-034 activate readiness (approved designs, active products, sellable variants, future end date, valid priced offers). Stamps approvedRevision from draftRevision. Future startDate yields ACTIVE scheduled (not yet public until start).
         */
        post: operations["AdminCampaignsController_activate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/campaigns/{id}/payout-policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Set or clear campaign payout mode override (admin only)
         * @description Organizers cannot change payout mode. Send payoutModeOverride: null to use site default only.
         */
        patch: operations["AdminCampaignsController_updatePayoutPolicy"];
        trace?: never;
    };
    "/v1/admin/campaigns/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reject campaign after review (REVIEW → DRAFT)
         * @description Returns the campaign to DRAFT with a rejection reason shown to the organiser.
         */
        post: operations["AdminCampaignsController_reject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/campaigns/{id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resume paused campaign (PAUSED → ACTIVE)
         * @description Requires approvedRevision === draftRevision and zero activate-equivalent readiness blockers. Notifies the organiser.
         */
        post: operations["AdminCampaignsController_resume"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/campaigns/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update campaign status (admin)
         * @description For DISABLED, PAUSED, or ENDED transitions only. Use /activate and /reject for the review flow.
         */
        patch: operations["AdminCampaignsController_updateStatus"];
        trace?: never;
    };
    "/v1/admin/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List all categories (admin) */
        get: operations["AdminCategoriesController_findAll"];
        put?: never;
        /** Create category (admin) */
        post: operations["AdminCategoriesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete category (admin) */
        delete: operations["AdminCategoriesController_remove"];
        options?: never;
        head?: never;
        /** Update category (admin) */
        patch: operations["AdminCategoriesController_update"];
        trace?: never;
    };
    "/v1/admin/designs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List designs by moderation status (admin) */
        get: operations["AdminDesignsController_findAll"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/designs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get design detail (admin) */
        get: operations["AdminDesignsController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/designs/{id}/moderation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update design moderation status (admin) */
        patch: operations["AdminDesignsController_updateModeration"];
        trace?: never;
    };
    "/v1/admin/discounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List all discounts (admin) */
        get: operations["AdminDiscountsController_findAll"];
        put?: never;
        /** Create discount (enforces one active per subject, fixed/percentage mutual exclusion) */
        post: operations["AdminDiscountsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/discounts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get discount by id */
        get: operations["AdminDiscountsController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update discount (re-validates active rules) */
        patch: operations["AdminDiscountsController_update"];
        trace?: never;
    };
    "/v1/admin/geo/states": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List geo states (e.g. Nigeria) */
        get: operations["AdminShippingController_listStates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/geo/states/{code}/lgas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List LGAs for a state */
        get: operations["AdminShippingController_listLgas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/inventory/variant/{variantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update variant inventory (admin) */
        patch: operations["AdminInventoryController_updateVariant"];
        trace?: never;
    };
    "/v1/admin/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List media assets by moderation status (admin) */
        get: operations["AdminMediaController_findAll"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/media/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get media asset detail (admin) */
        get: operations["AdminMediaController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/media/{id}/moderation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update media asset moderation status (admin) */
        patch: operations["AdminMediaController_updateModeration"];
        trace?: never;
    };
    "/v1/admin/moderation/appeals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List moderation appeals (admin) */
        get: operations["AdminModerationAppealsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/moderation/appeals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get appeal detail including internal decision evidence */
        get: operations["AdminModerationAppealsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/moderation/appeals/{id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve a PENDING appeal (UPHELD or OVERTURNED) */
        post: operations["AdminModerationAppealsController_resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-dead-letters": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List failed notification dead letters (redacted) */
        get: operations["AdminNotificationDeadLettersController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-dead-letters/replay/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Replay up to 25 dead letters with one reason */
        post: operations["AdminNotificationDeadLettersController_bulkReplay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-dead-letters/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dead-letter detail with attempt history */
        get: operations["AdminNotificationDeadLettersController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-dead-letters/{id}/acknowledge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acknowledge a dead letter */
        post: operations["AdminNotificationDeadLettersController_acknowledge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-dead-letters/{id}/replay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Replay a failed notification as a new generation */
        post: operations["AdminNotificationDeadLettersController_replay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-routes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List configured notification routes */
        get: operations["AdminNotificationRoutesController_findAll"];
        put?: never;
        /** Create a notification route */
        post: operations["AdminNotificationRoutesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-routes/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List admin notification event keys and descriptions */
        get: operations["AdminNotificationRoutesController_eventCatalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/notification-routes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get one route by id */
        get: operations["AdminNotificationRoutesController_findOne"];
        put?: never;
        post?: never;
        /** Delete a notification route */
        delete: operations["AdminNotificationRoutesController_remove"];
        options?: never;
        head?: never;
        /** Update a notification route */
        patch: operations["AdminNotificationRoutesController_update"];
        trace?: never;
    };
    "/v1/admin/notifications/email/broadcast": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Queue a custom HTML email to a verified-user segment
         * @description Creates one notification_outbox row per recipient and enqueues mail delivery. Use dryRun first. Subject to hourly rate limit.
         */
        post: operations["AdminNotificationsController_broadcastEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List all orders (admin) */
        get: operations["AdminOrdersController_findAll"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get order by ID (admin) */
        get: operations["AdminOrdersController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update order status (admin) */
        patch: operations["AdminOrdersController_updateStatus"];
        trace?: never;
    };
    "/v1/admin/orders/{id}/refund": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Initiate a provider refund (admin). Settles only after Paystack confirmation. */
        post: operations["AdminOrdersController_refund"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/orders/{orderId}/shipments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List shipments for an order (admin) */
        get: operations["AdminShipmentsController_listForOrder"];
        put?: never;
        /** Create the active outbound shipment for an order (READY). Derives FULFILLED from PROCESSING. */
        post: operations["AdminShipmentsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/organiser/applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List organiser applications (admin queue) */
        get: operations["AdminOrganizerApplicationsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/organiser/applications/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get organiser application detail (includes internal notes) */
        get: operations["AdminOrganizerApplicationsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/organiser/applications/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve a PENDING organiser application */
        post: operations["AdminOrganizerApplicationsController_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/organiser/applications/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject a PENDING organiser application */
        post: operations["AdminOrganizerApplicationsController_reject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/payout-profiles/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Set payout profile lifecycle status (TTW-042 interim verify/suspend) */
        patch: operations["AdminPayoutProfilesController_setStatus"];
        trace?: never;
    };
    "/v1/admin/payout-runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List payout runs */
        get: operations["AdminPayoutRunsController_list"];
        put?: never;
        /** Create a payout run (DRAFT) from eligible balances */
        post: operations["AdminPayoutRunsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/payout-runs/payouts/{payoutId}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry a failed payout in a run (creates a new payout row; TTW-011) */
        post: operations["AdminPayoutRunsController_retryPayout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/payout-runs/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Preview eligible campaigns and totals for a payout run */
        get: operations["AdminPayoutRunsController_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/payout-runs/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve a payout run (DRAFT -> APPROVED) */
        post: operations["AdminPayoutRunsController_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/payout-runs/{id}/execute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Execute an approved payout run (call Paystack for each payout) */
        post: operations["AdminPayoutRunsController_execute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/payouts/{id}/approve-manual": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve and execute manual adjustment (second admin; requester cannot approve) */
        post: operations["AdminManualPayoutsController_approveManualAdjustment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List all products (admin, no status filter) */
        get: operations["AdminProductsController_findAll"];
        put?: never;
        /** Create product (admin) */
        post: operations["AdminProductsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get full product detail (admin) */
        get: operations["AdminProductsController_findOne"];
        put?: never;
        post?: never;
        /** Delete product (admin) */
        delete: operations["AdminProductsController_remove"];
        options?: never;
        head?: never;
        /** Update product (admin) */
        patch: operations["AdminProductsController_update"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/image-roles/{roleId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete image role (admin) */
        delete: operations["AdminProductsController_deleteImageRole"];
        options?: never;
        head?: never;
        /** Update image role (admin) */
        patch: operations["AdminProductsController_updateImageRole"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/images": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create product image from URL (admin, async) */
        post: operations["AdminProductsController_createImage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/images/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload product image (admin, async) */
        post: operations["AdminProductsController_uploadImage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/images/{imageId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete product image (admin) */
        delete: operations["AdminProductsController_deleteImage"];
        options?: never;
        head?: never;
        /** Update product image (admin) */
        patch: operations["AdminProductsController_updateImage"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/images/{imageId}/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Assign image role (admin) */
        post: operations["AdminProductsController_createImageRole"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List product options (admin)
         * @description Returns the same payload as GET /admin/products/:id (admin detail), including options for any product status.
         */
        get: operations["AdminProductsController_listOptions"];
        put?: never;
        /** Create product option (admin) */
        post: operations["AdminProductsController_createOption"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/options/{optionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete product option (admin) */
        delete: operations["AdminProductsController_deleteOption"];
        options?: never;
        head?: never;
        /** Update product option (admin) */
        patch: operations["AdminProductsController_updateOption"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/options/{optionId}/values": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create option value (admin) */
        post: operations["AdminProductsController_createOptionValue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/options/{optionId}/values/{valueId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete option value (admin) */
        delete: operations["AdminProductsController_deleteOptionValue"];
        options?: never;
        head?: never;
        /** Update option value (admin) */
        patch: operations["AdminProductsController_updateOptionValue"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upsert product price (admin) */
        post: operations["AdminProductsController_upsertProductPrice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/prices/{priceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete product price (admin) */
        delete: operations["AdminProductsController_deleteProductPrice"];
        options?: never;
        head?: never;
        /** Update product price (admin) */
        patch: operations["AdminProductsController_updateProductPrice"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/variants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List variants for product (admin) */
        get: operations["AdminProductsController_listVariants"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/variants/{variantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete variant (admin) */
        delete: operations["AdminProductsController_removeVariant"];
        options?: never;
        head?: never;
        /** Update variant (admin) */
        patch: operations["AdminProductsController_updateVariant"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/variants/{variantId}/prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upsert variant price (admin) */
        post: operations["AdminProductsController_upsertVariantPrice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/variants/{variantId}/prices/{priceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete variant price (admin) */
        delete: operations["AdminProductsController_deleteVariantPrice"];
        options?: never;
        head?: never;
        /** Update variant price (admin) */
        patch: operations["AdminProductsController_updateVariantPrice"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/views": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create product view (admin) */
        post: operations["AdminProductsController_createView"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/views/{viewId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete product view (admin) */
        delete: operations["AdminProductsController_deleteView"];
        options?: never;
        head?: never;
        /** Update product view (admin) */
        patch: operations["AdminProductsController_updateView"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/views/{viewId}/effects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create template effect (admin) */
        post: operations["AdminProductsController_createEffect"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/views/{viewId}/effects/{effectId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete template effect (admin) */
        delete: operations["AdminProductsController_deleteEffect"];
        options?: never;
        head?: never;
        /** Update template effect (admin) */
        patch: operations["AdminProductsController_updateEffect"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/views/{viewId}/layers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create template layer (admin) */
        post: operations["AdminProductsController_createLayer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/products/{productId}/views/{viewId}/layers/{layerId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete template layer (admin) */
        delete: operations["AdminProductsController_deleteLayer"];
        options?: never;
        head?: never;
        /** Update template layer (admin) */
        patch: operations["AdminProductsController_updateLayer"];
        trace?: never;
    };
    "/v1/admin/products/{productId}/views/{viewId}/print-area": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upsert print area (admin) */
        post: operations["AdminProductsController_upsertPrintArea"];
        delete?: never;
        options?: never;
        head?: never;
        /** Update print area (admin) */
        patch: operations["AdminProductsController_updatePrintArea"];
        trace?: never;
    };
    "/v1/admin/reconciliation/findings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List reconciliation findings (masked) */
        get: operations["AdminReconciliationController_listFindings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/findings/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** CSV export of findings (formula-injection safe) */
        get: operations["AdminReconciliationController_exportFindings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/findings/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Finding detail with masked evidence */
        get: operations["AdminReconciliationController_getFinding"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/findings/{id}/acknowledge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acknowledge a finding (single admin) */
        post: operations["AdminReconciliationController_acknowledge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/findings/{id}/repair-request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request a two-person repair for a finding */
        post: operations["AdminReconciliationController_requestRepair"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/repairs/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Second admin approves and applies a repair (≠ requester) */
        post: operations["AdminReconciliationController_approveRepair"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List reconciliation runs (TTW-015) */
        get: operations["AdminReconciliationController_listRuns"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/runs/internal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Trigger an internal reconciliation run now */
        post: operations["AdminReconciliationController_triggerInternal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/runs/provider": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Trigger a provider reconciliation run now */
        post: operations["AdminReconciliationController_triggerProvider"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/reconciliation/runs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get reconciliation run detail */
        get: operations["AdminReconciliationController_getRun"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/shipments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get shipment detail including private notes */
        get: operations["AdminShipmentsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Append a shipment status event (dispatch / progress / deliver / exception / cancel) */
        patch: operations["AdminShipmentsController_update"];
        trace?: never;
    };
    "/v1/admin/shipping-rates/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete shipping rate */
        delete: operations["AdminShippingController_deleteRate"];
        options?: never;
        head?: never;
        /** Update shipping rate */
        patch: operations["AdminShippingController_updateRate"];
        trace?: never;
    };
    "/v1/admin/shipping-rules/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete generic shipping rule */
        delete: operations["AdminShippingController_deleteRule"];
        options?: never;
        head?: never;
        /** Update generic shipping rule */
        patch: operations["AdminShippingController_updateRule"];
        trace?: never;
    };
    "/v1/admin/shipping-zones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List shipping zones */
        get: operations["AdminShippingController_listZones"];
        put?: never;
        /** Create shipping zone */
        post: operations["AdminShippingController_createZone"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/shipping-zones/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get shipping zone by ID */
        get: operations["AdminShippingController_getZone"];
        put?: never;
        post?: never;
        /** Delete shipping zone */
        delete: operations["AdminShippingController_deleteZone"];
        options?: never;
        head?: never;
        /** Update shipping zone */
        patch: operations["AdminShippingController_updateZone"];
        trace?: never;
    };
    "/v1/admin/shipping-zones/{zoneId}/areas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List areas for a zone */
        get: operations["AdminShippingController_listAreas"];
        put?: never;
        /** Add area to zone */
        post: operations["AdminShippingController_createArea"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/shipping-zones/{zoneId}/rates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List rates for a zone */
        get: operations["AdminShippingController_listRates"];
        put?: never;
        /** Add rate to zone */
        post: operations["AdminShippingController_createRate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/shipping-zones/{zoneId}/rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List generic shipping rules for a zone */
        get: operations["AdminShippingController_listRules"];
        put?: never;
        /** Add generic shipping rule to zone */
        post: operations["AdminShippingController_createRule"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/site-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get site settings */
        get: operations["AdminSiteSettingsController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update site settings */
        patch: operations["AdminSiteSettingsController_update"];
        trace?: never;
    };
    "/v1/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search users (admin) */
        get: operations["AdminUsersController_search"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/users/{id}/mfa/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset ADMIN MFA (clears TOTP + recovery codes and revokes sessions) */
        post: operations["AdminUsersController_resetMfa"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admin/users/{id}/role": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Change a user role (admin) */
        patch: operations["AdminUsersController_updateRole"];
        trace?: never;
    };
    "/v1/auth/admin/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Admin password login — returns MFA enrollment/challenge token (no session) */
        post: operations["AuthController_adminLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/admin/mfa/challenge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete admin MFA challenge with TOTP and issue session cookies */
        post: operations["AuthController_adminMfaChallenge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/admin/mfa/enroll/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm admin MFA enrollment with TOTP and issue session cookies */
        post: operations["AuthController_adminMfaEnrollConfirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/admin/mfa/enroll/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start admin MFA enrollment (otpauth URI + recovery codes once) */
        post: operations["AuthController_adminMfaEnrollStart"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/admin/mfa/recover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete admin MFA with a single-use recovery code and issue session cookies */
        post: operations["AuthController_adminMfaRecover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/change-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change password */
        post: operations["AuthController_changePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/forgot-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request password reset email */
        post: operations["AuthController_forgotPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Start Google OAuth (redirect to Google) */
        get: operations["GoogleOAuthController_googleStart"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/google/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Google OAuth callback */
        get: operations["GoogleOAuthController_googleCallback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login with email and password (customer surface) */
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Logout and clear auth cookies
         * @description Revokes and clears only the resolved surface. Cookie sessions must send the surface CSRF header (X-CSRF-Token) and an allowlisted Origin.
         */
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get current authenticated user
         * @description Also returns the session CSRF token for cookie-authenticated callers, so a frontend that lost its in-memory copy (new tab, OAuth redirect) can recover it without rotating the session.
         */
        get: operations["AuthController_getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refresh access token
         * @description Cookie sessions must send the surface CSRF header (X-CSRF-Token) and an allowlisted Origin; a body-only `refresh_token` call (no session cookies) is treated as a non-browser client and is CSRF-exempt.
         */
        post: operations["AuthController_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register a new user */
        post: operations["AuthController_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/resend-verification": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resend verification email */
        post: operations["AuthController_resendVerification"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset password with token */
        post: operations["AuthController_resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List active auth sessions
         * @description Returns live (non-revoked, non-expired) sessions for the current user. Does not include refresh tokens or hashes.
         */
        get: operations["AuthController_listSessions"];
        put?: never;
        post?: never;
        /**
         * Revoke all auth sessions
         * @description Revokes every live session for the user, including the current one. Access JWTs for revoked sessions fail on the next request.
         */
        delete: operations["AuthController_revokeAllSessions"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/sessions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Revoke one auth session */
        delete: operations["AuthController_revokeSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify email with token */
        post: operations["AuthController_verifyEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/banks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Nigerian banks (for payout profile setup) */
        get: operations["BanksController_listBanks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/banks/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Resolve account name from account number and bank code */
        get: operations["BanksController_resolveAccount"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List my campaigns */
        get: operations["CampaignsController_findAll"];
        put?: never;
        /** Create a campaign */
        post: operations["CampaignsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get owned campaign detail (offers + price guidance + revision) */
        get: operations["CampaignsController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update owned DRAFT campaign basics (expectedRevision required) */
        patch: operations["CampaignsController_update"];
        trace?: never;
    };
    "/v1/campaigns/{id}/offers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add campaign offer (product + owned design + price) atomically */
        post: operations["CampaignsController_addOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns/{id}/offers/{offerId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove campaign offer atomically */
        delete: operations["CampaignsController_removeOffer"];
        options?: never;
        head?: never;
        /** Update campaign offer atomically */
        patch: operations["CampaignsController_updateOffer"];
        trace?: never;
    };
    "/v1/campaigns/{id}/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List campaign orders (organizer) */
        get: operations["CampaignsController_getCampaignOrders"];
        put?: never;
        /** Create campaign order */
        post: operations["CampaignsController_createCampaignOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns/{id}/orders/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Get campaign order quote */
        post: operations["CampaignsController_quoteCampaignOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Owner DRAFT preview (TTW-031 shape, watermarked, non-purchasable) */
        get: operations["CampaignsController_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns/{id}/price-guidance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Minimum selling-price guidance (no cost leak) */
        get: operations["CampaignsController_priceGuidance"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns/{id}/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add product to campaign (deprecated — use POST :id/offers)
         * @deprecated
         */
        post: operations["CampaignsController_addProduct"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/campaigns/{id}/submit-for-review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit campaign for admin review (DRAFT → REVIEW) */
        post: operations["CampaignsController_submitForReview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List all categories */
        get: operations["CategoriesController_findAll"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get category by ID */
        get: operations["CategoriesController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/design-assets/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload a design asset (image layer) */
        post: operations["DesignAssetsController_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/designs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List my designs */
        get: operations["DesignsController_findAll"];
        put?: never;
        /** Create a design */
        post: operations["DesignsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/designs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get design by ID */
        get: operations["DesignsController_findOne"];
        put?: never;
        post?: never;
        /** Delete a design */
        delete: operations["DesignsController_remove"];
        options?: never;
        head?: never;
        /** Update a design */
        patch: operations["DesignsController_update"];
        trace?: never;
    };
    "/v1/designs/{id}/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Duplicate a design */
        post: operations["DesignsController_duplicate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/designs/{id}/share": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create an expiring digested share link for a design */
        post: operations["DesignsController_share"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/designs/{id}/share-links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List share links for a design (no plaintext tokens) */
        get: operations["DesignsController_listShareLinks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/designs/{id}/share-links/{linkId}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke a design share link (idempotent) */
        post: operations["DesignsController_revokeShareLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/designs/{id}/thumbnail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload design thumbnail */
        post: operations["DesignsController_uploadThumbnail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health check endpoint */
        get: operations["AppController_getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness — process is up (no dependency checks) */
        get: operations["AppController_getLive"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness — required dependencies are reachable */
        get: operations["AppController_getReady"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inventory/variant/{variantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get inventory for a variant */
        get: operations["InventoryController_getByVariantId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/moderation/appeals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List own moderation appeals */
        get: operations["ModerationAppealsController_list"];
        put?: never;
        /** Create an appeal for an eligible decision */
        post: operations["ModerationAppealsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/moderation/appeals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get one own appeal (customer-safe decision fields only) */
        get: operations["ModerationAppealsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/moderation/appeals/{id}/withdraw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Withdraw a PENDING appeal */
        post: operations["ModerationAppealsController_withdraw"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/notifications/unsubscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Apply signed unsubscribe token (optional categories only)
         * @description Public endpoint using HMAC token — no session required. Returns generic success to avoid user enumeration.
         */
        post: operations["NotificationUnsubscribeController_unsubscribe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List my orders */
        get: operations["OrdersController_findAll"];
        put?: never;
        /** Create an order */
        post: operations["OrdersController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders/quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Get order quote (standard) */
        post: operations["OrdersController_quote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get my order detail (customer-safe projection)
         * @description Returns the TTW-033 customer order detail DTO. Other-user and missing ids both yield 404. Does not expose provider raw events, idempotency keys, internal notes, or the mutable address relation.
         */
        get: operations["OrdersController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders/{id}/initiate-payment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Initiate payment for order */
        post: operations["OrdersController_initiatePayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organiser/applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit an organiser application */
        post: operations["OrganizerApplicationsController_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organiser/applications/eligibility": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get organiser application eligibility and status */
        get: operations["OrganizerApplicationsController_getEligibility"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organiser/applications/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get latest organiser application status */
        get: operations["OrganizerApplicationsController_getStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organiser/applications/{id}/withdraw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Withdraw a PENDING organiser application */
        post: operations["OrganizerApplicationsController_withdraw"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payout-profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List my payout profiles */
        get: operations["PayoutProfilesController_findAll"];
        put?: never;
        /** Create payout profile */
        post: operations["PayoutProfilesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payout-profiles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get payout profile by ID */
        get: operations["PayoutProfilesController_findOne"];
        put?: never;
        post?: never;
        /** Delete payout profile */
        delete: operations["PayoutProfilesController_remove"];
        options?: never;
        head?: never;
        /** Update payout profile */
        patch: operations["PayoutProfilesController_update"];
        trace?: never;
    };
    "/v1/privacy/erasure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Close account and erase/anonymise personal data (password re-auth; blocked by open obligations) */
        post: operations["PrivacyController_requestErasure"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacy/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request a personal data export (password re-auth required) */
        post: operations["PrivacyController_requestExport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacy/requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List own privacy / DSAR requests */
        get: operations["PrivacyController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacy/requests/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get one privacy request with action evidence */
        get: operations["PrivacyController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacy/requests/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel a pending export or revoke an unexpired completed export */
        post: operations["PrivacyController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/privacy/requests/{id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Download a packaged export (password re-auth; TTL-bound) */
        post: operations["PrivacyController_downloadExport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List products (catalogue) */
        get: operations["ProductsController_findAll"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get product by ID */
        get: operations["ProductsController_findOne"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/products/{id}/workshop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Design Workshop context for a product */
        get: operations["ProductsController_getWorkshop"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/public/designs/{shareToken}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get shared design by share token */
        get: operations["PublicDesignsController_findByShareToken"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/public/fundraisers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List indexable public fundraiser slugs
         * @description Returns ACTIVE, in-window campaign slugs for sitemap generation. Does not expose private campaign fields.
         */
        get: operations["PublicFundraisersController_listIndexable"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/public/fundraisers/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get public fundraiser by slug
         * @description Returns ACTIVE, in-window campaigns with disclosure-safe sellable offers (policy public-campaign-offer/v1-interim-2026-08-21). Does not expose SKU, cost basis, moderation notes, or exact inventory.
         */
        get: operations["PublicFundraisersController_getBySlug"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/users/addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get all shipping addresses */
        get: operations["AddressesController_findAll"];
        put?: never;
        /** Create a new shipping address */
        post: operations["AddressesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/users/addresses/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get a shipping address by ID */
        get: operations["AddressesController_findUnique"];
        put?: never;
        post?: never;
        /** Delete a shipping address */
        delete: operations["AddressesController_remove"];
        options?: never;
        head?: never;
        /** Update a shipping address */
        patch: operations["AddressesController_update"];
        trace?: never;
    };
    "/v1/users/notification-preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get optional notification preferences (TTW-043)
         * @description Returns mutable category/channel preferences. Required security/transactional notices are not listed as disableable.
         */
        get: operations["NotificationPreferencesController_getPreferences"];
        /** Update optional notification preferences */
        put: operations["NotificationPreferencesController_updatePreferences"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/users/notification-preferences/marketing-consent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record explicit marketing email/SMS consent before opt-in */
        post: operations["NotificationPreferencesController_grantMarketingConsent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/users/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get current user profile */
        get: operations["UsersController_getProfile"];
        /** Update current user profile */
        put: operations["UsersController_updateProfile"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AddCampaignOfferDto: {
            /** @example design-1 */
            designId: string;
            /**
             * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
             * @example 1
             */
            expectedRevision: number;
            /**
             * @description Selling price in NGN major units (≥ current server floor)
             * @example 15000
             */
            price: number;
            /** @example prod-1 */
            productId: string;
        };
        AddCampaignProductDto: {
            /** @example design-1 */
            designId?: string;
            /**
             * @description Campaign selling price (NGN)
             * @example 15000
             */
            price?: number;
            /** @example prod-1 */
            productId: string;
        };
        AdminBroadcastEmailDto: {
            /** @enum {string} */
            audience: "USER_IDS" | "VERIFIED_CUSTOMERS" | "VERIFIED_CUSTOMERS_AND_ORGANIZERS" | "VERIFIED_ORGANIZERS";
            /**
             * @description If true, returns recipient count and sample emails only; no rows queued.
             * @default false
             */
            dryRun: boolean;
            /** @description HTML body (sanitized server-side). Use simple markup; scripts removed. */
            htmlBody: string;
            /** @example Holiday shipping update */
            subject: string;
            /** @description Required when audience is USER_IDS */
            userIds?: string[];
        };
        AdminMfaRecoverDto: {
            /** @description Short-lived MFA challenge JWT from POST /auth/admin/login (not a session) */
            mfa_token: string;
            /**
             * @description Single-use recovery code (XXXX-XXXX)
             * @example A1B2-C3D4
             */
            recovery_code: string;
        };
        AdminMfaTokenDto: {
            /** @description Short-lived MFA challenge JWT from POST /auth/admin/login (not a session) */
            mfa_token: string;
        };
        AdminMfaTotpDto: {
            /** @description Short-lived MFA challenge JWT from POST /auth/admin/login (not a session) */
            mfa_token: string;
            /**
             * @description 6-digit TOTP code from the authenticator app
             * @example 123456
             */
            totp: string;
        };
        AdminUpdatePayoutProfileStatusDto: {
            /**
             * @description VERIFIED required for selection. SUSPENDED/REJECTED block payouts. SUPERSEDED is for superseded destinations.
             * @enum {string}
             */
            status: "PENDING_VERIFICATION" | "REJECTED" | "SUPERSEDED" | "SUSPENDED" | "VERIFIED";
        };
        ApproveManualAdjustmentDto: {
            /** @description Approver note */
            approvalReason?: string;
        };
        ApproveOrganizerApplicationDto: {
            internalNotes?: string;
        };
        ChangePasswordDto: {
            /** @description Current password */
            currentPassword: string;
            /** @example NewPassword123! */
            newPassword: string;
        };
        CreateAddressDto: {
            /** @example 123 Main Street */
            addressLine1: string;
            /** @example Apt 4B */
            addressLine2?: string;
            /** @example Lagos */
            administrativeAreaLevel1?: string;
            /** @example Ikeja */
            administrativeAreaLevel2?: string;
            /** @example Lagos */
            city: string;
            /**
             * @default Nigeria
             * @example Nigeria
             */
            country: string;
            /**
             * @default NG
             * @example NG
             */
            countryCode: string;
            /** @example Victoria Island */
            dependentLocality?: string;
            /** @example 12 Broad Street, Lagos, Nigeria */
            formattedAddress?: string;
            /** @example ChIJrTLr-GyuEmsRBfy61i59si0 */
            googlePlaceId?: string;
            /** @example Leave at gate */
            instructions?: string;
            /**
             * @default false
             * @example false
             */
            isDefault: boolean;
            /** @example Near the roundabout */
            landmark?: string;
            /** @example 6.5244 */
            latitude?: number;
            /** @example cme4abcd1234 */
            lgaId?: string;
            /** @example Lagos */
            locality?: string;
            /** @example 3.3792 */
            longitude?: number;
            /** @example +2348012345678 */
            phone?: string;
            /** @example 100001 */
            postalCode?: string;
            /**
             * @default MANUAL
             * @enum {string}
             */
            provider: "GOOGLE_PLACES" | "MANUAL" | "OTHER";
            /** @example John Doe */
            recipientName?: string;
            /** @example Lagos */
            state: string;
            /** @example LA */
            stateCode?: string;
        };
        CreateAdminNotificationRouteDto: {
            /** @description Handlebars HTML body; omit to use built-in default */
            emailBodyTemplate?: Record<string, never>;
            /** @default [] */
            emailRecipients: string[];
            /** @default true */
            enabled: boolean;
            /** @example admin.order.placed */
            eventKey: string;
            /** @default default */
            name: string;
            /** @default false */
            notifyEmail: boolean;
            /** @default false */
            notifySlack: boolean;
            /** @default false */
            notifySms: boolean;
            slackWebhookUrl?: Record<string, never>;
            /** @description Handlebars SMS body; omit to use built-in default */
            smsBodyTemplate?: Record<string, never>;
            /** @default [] */
            smsRecipients: string[];
            /** @description Handlebars subject; omit to use built-in default for eventKey */
            subjectTemplate?: Record<string, never>;
        };
        CreateAppealDto: {
            /** @description Moderation decision id to appeal */
            decisionId: string;
            /** @description Owner statement (no binary evidence in slice 1) */
            statement: string;
        };
        CreateBulkPricingDto: {
            /** @example NGN */
            currency: string;
            /**
             * @description Maximum quantity (inclusive); omit for open-ended
             * @example 24
             */
            maxQuantity?: number;
            /**
             * @description Minimum quantity for this tier
             * @example 10
             */
            minQuantity: number;
            /**
             * @description Price per unit in this tier
             * @example 4500
             */
            pricePerUnit: number;
            productId: string;
            /** @description Variant-specific tier; omit for product-level */
            variantId?: string;
        };
        CreateCampaignDto: {
            /** @example Raising funds for our school */
            description?: string;
            /** @example 2025-02-28T23:59:59Z */
            endDate?: string;
            /** @example 500000 */
            goalAmount?: number;
            /** @example school-fundraiser-2025 */
            slug?: string;
            /** @example 2025-02-01T00:00:00Z */
            startDate?: string;
            /** @example Our story... */
            story?: string;
            /** @example School Fundraiser 2025 */
            title: string;
        };
        CreateCategoryDto: {
            /** @example Comfortable cotton t-shirts */
            description?: string;
            /** @example T-Shirts */
            name: string;
            /** @example t-shirts */
            slug?: string;
        };
        CreateDesignDto: {
            /**
             * @description Structured design data (version, views, layers per view)
             * @example {
             *       "productId": "prod-1",
             *       "version": 1,
             *       "views": {}
             *     }
             */
            designData: Record<string, never>;
            /** @example My Tee Design */
            name: string;
            /** @example prod-1 */
            productId: string;
            /** @example https://cdn.example.com/thumb.png */
            thumbnailUrl?: string;
        };
        CreateDesignShareDto: {
            /**
             * @default 7
             * @enum {number}
             */
            ttlDays: 1 | 30 | 7;
        };
        CreateDiscountDto: {
            /** @description Campaign IDs when scope is CAMPAIGN */
            campaignIds?: string[];
            /** @example SAVE10 */
            code?: string;
            /**
             * @description Required when type is FIXED
             * @example NGN
             */
            currency?: string;
            endAt?: string;
            maxRedemptions?: number;
            minOrderAmount?: number;
            /** @description Product IDs when scope is PRODUCT */
            productIds?: string[];
            /** @enum {string} */
            scope: "CAMPAIGN" | "ORDER" | "PRODUCT" | "VARIANT";
            startAt?: string;
            /**
             * @default ACTIVE
             * @enum {string}
             */
            status: "ACTIVE" | "INACTIVE";
            /** @enum {string} */
            type: "BULK" | "FIXED" | "PERCENTAGE";
            /**
             * @description For FIXED: amount; requires currency
             * @example 500
             */
            valueAmount?: number;
            /**
             * @description For PERCENTAGE: 0–100
             * @example 10
             */
            valuePercent?: number;
            /** @description Variant IDs when scope is VARIANT */
            variantIds?: string[];
        };
        CreateOptionDto: {
            /** @example size */
            code: string;
            /** @example Size */
            name: string;
            /** @example 0 */
            sortOrder?: number;
        };
        CreateOptionValueDto: {
            /** @example Large */
            displayName: string;
            /**
             * @example {
             *       "hex": "#000000"
             *     }
             */
            metadata?: Record<string, never>;
            /** @example 0 */
            sortOrder?: number;
            /** @example L */
            valueCode: string;
        };
        CreateOrderDto: {
            idempotencyKey?: string;
            items: {
                /** @example campaign-1 */
                campaignId?: string;
                /** @example design-1 */
                designId?: string;
                /** @example 2 */
                quantity: number;
                /** @example var-1 */
                variantId: string;
            }[];
            /** @example addr-1 */
            shippingAddressId: string;
        };
        CreateOrderItemDto: {
            /** @example campaign-1 */
            campaignId?: string;
            /** @example design-1 */
            designId?: string;
            /** @example 2 */
            quantity: number;
            /** @example var-1 */
            variantId: string;
        };
        CreatePayoutProfileDto: {
            /** @example Account Name */
            accountName: string;
            /** @example 0123456789 */
            accountNumber: string;
            /**
             * @description Nigerian bank code. Slice 1 stub resolution may auto-verify; live mode leaves PENDING_VERIFICATION (TTW-042).
             * @example 058
             */
            bankCode: string;
            /** @example GTBank */
            bankName?: string;
            /** @example Personal */
            label: string;
        };
        CreatePayoutRunDto: {
            /**
             * @description Settlement cutoff (orders paid before this count)
             * @example 2025-03-15T23:59:59Z
             */
            cutoffAt: string;
            /**
             * @description MANUAL, AUTO_APPROVAL_REQUIRED, or AUTO_EXECUTE
             * @enum {string}
             */
            mode: "AUTO_APPROVAL_REQUIRED" | "AUTO_EXECUTE" | "MANUAL";
            /**
             * @description Scheduled execution time
             * @example 2025-03-22T00:00:00Z
             */
            scheduledFor: string;
        };
        CreatePrintAreaDto: {
            /** @example 0.5 */
            height: number;
            /** @example 6 */
            maxColors?: number;
            /** @example 5 */
            maxLayers?: number;
            /** @example false */
            rotationAllowed?: boolean;
            /** @example 0.6 */
            width: number;
            /** @example 0.1 */
            x: number;
            /** @example 0.2 */
            y: number;
        };
        CreateProductDto: {
            /** @example prod-cat-1 */
            categoryId: string;
            /** @example Soft cotton t-shirt */
            description?: string;
            /** @example Classic Cotton Tee */
            name: string;
            /** @example 40 */
            packageHeightMm?: number;
            /** @example 320 */
            packageLengthMm?: number;
            /** @example 240 */
            packageWidthMm?: number;
            /** @example classic-cotton-tee */
            slug?: string;
            /**
             * @default DRAFT
             * @enum {string}
             */
            status: "ACTIVE" | "ARCHIVED" | "DRAFT";
            /** @example 300 */
            weightGrams?: number;
        };
        CreateProductImageDto: {
            /** @example Front view */
            altText?: string;
            /** @example 0 */
            sortOrder?: number;
            /**
             * @description Source URL to import asynchronously
             * @example https://cdn.example.com/img.png
             */
            sourceUrl: string;
            /** @example variant-id */
            variantId?: string;
        };
        CreateProductImageRoleDto: {
            /** @example product-view-id */
            productViewId?: string;
            /**
             * @example THUMBNAIL
             * @enum {string}
             */
            role: "GALLERY" | "THUMBNAIL" | "WORKSHOP_TEMPLATE";
            /** @example 0 */
            sortOrder?: number;
        };
        CreateProductPriceDto: {
            /** @example 15000 */
            amount: number;
            /** @example 20000 */
            compareAt?: number;
            /**
             * @example NGN
             * @enum {string}
             */
            currency: "NGN";
        };
        CreateProductViewDto: {
            /** @example Front */
            displayName: string;
            /** @example false */
            isDefault?: boolean;
            /** @example true */
            isDesignable?: boolean;
            /** @example front */
            key: string;
            /** @example 0 */
            sortOrder?: number;
        };
        CreateRefundDto: {
            /**
             * @description Refund amount in major currency (e.g. NGN)
             * @example 5000
             */
            amount: number;
            /** @description Optional idempotency key so retries reuse the same refund attempt (TTW-013) */
            idempotencyKey?: string;
            /** @description Optional free-text note (not used for eligibility) */
            reason?: string;
            /**
             * @description Stable TTW-041 refund reason code (server policy authority; required)
             * @example DEFECT_OR_NOT_AS_DESCRIBED
             * @enum {string}
             */
            reasonCode: "ADDRESS_FAILURE_PLATFORM" | "ADMIN_GOODWILL" | "CARRIER_LOSS_OR_DAMAGE" | "CHANGE_OF_MIND" | "DEFECT_OR_NOT_AS_DESCRIBED" | "DUPLICATE_OR_PRICING_ERROR" | "PRODUCTION_FAILURE";
        };
        CreateShipmentDto: {
            /**
             * @description Carrier vocabulary code (no live carrier adapter in v1)
             * @default MANUAL
             * @enum {string}
             */
            carrierCode: "DHL" | "FEDEX" | "GIG" | "MANUAL" | "NIPOST" | "OTHER" | "UPS";
            /** @description Optional calendar estimated delivery (ISO-8601) */
            estimatedDeliveryAt?: string;
            /** @description Client idempotency key for the READY event */
            idempotencyKey?: string;
            privateNotes?: string;
            serviceCode?: string;
        };
        CreateShippingRateDto: {
            /**
             * @default NGN
             * @enum {string}
             */
            currency: "NGN";
            /** @description ISO date string */
            effectiveFrom?: Record<string, never>;
            /** @description ISO date string */
            effectiveTo?: Record<string, never>;
            /**
             * @description Flat fee amount
             * @example 1500
             */
            flatFee: number;
            /** @default true */
            isActive: boolean;
            /** @example 5 */
            maxDeliveryDays?: Record<string, never>;
            /** @example 2 */
            minDeliveryDays?: Record<string, never>;
            /**
             * @default 100
             * @example 100
             */
            priority: number;
            /** @enum {string} */
            provider?: "INTERNAL";
            /**
             * @default STANDARD
             * @example STANDARD
             */
            serviceLevel: string;
        };
        CreateShippingRuleDto: {
            /**
             * @description ISO 3166-1 alpha-2 country code
             * @example NG
             */
            countryCode: string;
            /** @default true */
            isActive: boolean;
            /**
             * @description Optional context to disambiguate the rule, such as the parent ADMIN1 code for ADMIN2.
             * @example LA
             */
            matchContext?: Record<string, never>;
            /** @enum {string} */
            matchType: "ADMIN1" | "ADMIN2" | "CITY" | "POSTAL_CODE" | "POSTAL_PREFIX";
            /**
             * @description Canonical match value. For Nigeria ADMIN1 use state code; for ADMIN2 use LGA id or name.
             * @example LA
             */
            matchValue: string;
            /**
             * @default 100
             * @example 100
             */
            priority: number;
        };
        CreateShippingZoneAreaDto: {
            /** @description LGA ID for LGA-specific area; omit for state-wide */
            lgaId?: Record<string, never>;
            /**
             * @description State code (e.g. LA for Lagos)
             * @example LA
             */
            stateCode: string;
        };
        CreateShippingZoneDto: {
            /** @default true */
            isActive: boolean;
            /** @example Lagos */
            name: string;
        };
        CreateTemplateEffectDto: {
            /** @enum {string} */
            effectType: "HIDE" | "REPLACE_IMAGE" | "SHOW" | "TINT";
            /**
             * @example {
             *       "opacity": 0.8
             *     }
             */
            meta?: Record<string, never>;
            /** @example option-id */
            optionId: string;
            /** @example option-value-id */
            optionValueId: string;
            /** @example replacement-image-id */
            replacementImageId?: string;
            /** @example template-layer-id */
            templateLayerId: string;
            /** @example #00FF00 */
            tintHex?: string;
        };
        CreateTemplateLayerDto: {
            /** @enum {string} */
            blendMode?: "DARKEN" | "LIGHTEN" | "MULTIPLY" | "NORMAL" | "OVERLAY" | "SCREEN";
            /** @example Base layer */
            displayName?: string;
            /** @example image-id */
            imageId: string;
            /** @example base */
            key: string;
            /**
             * @example BASE
             * @enum {string}
             */
            layerType: "BASE" | "DETAIL" | "HIGHLIGHT" | "MASK_OVERLAY" | "OUTLINE" | "SHADOW";
            /**
             * @example {
             *       "scale": 1
             *     }
             */
            meta?: Record<string, never>;
            /** @example 1 */
            opacity?: number;
            /** @example 0 */
            zIndex?: number;
        };
        CreateVariantPriceDto: {
            /** @example 16000 */
            amount: number;
            /** @example 20000 */
            compareAt?: number;
            /**
             * @example NGN
             * @enum {string}
             */
            currency: "NGN";
        };
        CustomerOrderCampaignAttributionDto: {
            /** @example camp-1 */
            id: string;
            /** @example school-fundraiser */
            slug: string;
            /** @example School Fundraiser */
            title: string;
        };
        CustomerOrderDetailDto: {
            campaign?: {
                /** @example camp-1 */
                id: string;
                /** @example school-fundraiser */
                slug: string;
                /** @example School Fundraiser */
                title: string;
            } | null;
            /** @description Campaign id when this is a fundraiser order */
            campaignId?: Record<string, never> | null;
            cancelledAt?: Record<string, never> | null;
            createdAt: string;
            /** @enum {string} */
            currency: "NGN";
            /** @example 0 */
            discountAmount: number;
            expiresAt?: Record<string, never> | null;
            /** @example order-1 */
            id: string;
            items: {
                /** @example camp-1 */
                campaignId?: Record<string, never> | null;
                /** @example design-1 */
                designId?: Record<string, never> | null;
                /** @example oi-1 */
                id: string;
                /** @description True when snapshotSource is BACKFILLED_CURRENT_CATALOG — display may not match what the buyer originally saw. */
                legacySnapshotDisclosure?: boolean;
                /** @example 10000 */
                lineTotal: number;
                optionPresentationSnapshot?: {
                    /** @example Size */
                    option: string;
                    /** @example size */
                    optionCode: string;
                    /** @example Large */
                    value: string;
                    /** @example L */
                    valueCode: string;
                }[] | null;
                /** @example prod-1 */
                productId: string;
                /** @example Classic Tee */
                productNameSnapshot: string;
                /** @example 2 */
                quantity: number;
                /** @enum {string} */
                snapshotSource: "BACKFILLED_CURRENT_CATALOG" | "PURCHASE";
                /** @example 1 */
                snapshotVersion: number;
                /**
                 * @description Unit price charged (major units)
                 * @example 5000
                 */
                unitFinalPrice: number;
                /** @example Small / Red (SKU-1) */
                variantDisplaySnapshot: string;
                /** @example var-1 */
                variantId: string;
            }[];
            /** @description Order-level Paystack reference when set */
            paymentReference?: Record<string, never> | null;
            /** @description True when the server allows starting or continuing payment for this owned order */
            paymentRetryEligible: boolean;
            /** @enum {string} */
            paymentStatus: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
            payments: {
                /** @example 12500 */
                amount: number;
                createdAt: string;
                /** @enum {string} */
                currency: "NGN";
                expiresAt?: Record<string, never> | null;
                /** @example pay-1 */
                id: string;
                /** @description Public-facing provider reference when present */
                providerRef?: Record<string, never> | null;
                /** @enum {string} */
                status: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
            }[];
            /**
             * @description Interim policy / response contract version
             * @example customer-order-detail/v1-interim-2026-08-21
             */
            policyVersion: string;
            /**
             * @description Sum of SUCCEEDED refund amounts (major units)
             * @example 0
             */
            refundedAmountConfirmed: number;
            refunds: {
                /** @example 2500 */
                amount: number;
                createdAt: string;
                /** @enum {string} */
                currency: "NGN";
                /** @example ref-1 */
                id: string;
                reason?: Record<string, never> | null;
                /** @enum {string} */
                status: "FAILED" | "INITIATED" | "NEEDS_ATTENTION" | "PROCESSING" | "SUCCEEDED";
            }[];
            /** @description Server-authoritative cancel/refund/return eligibility (TTW-041). Clients must not invent eligibility. */
            resolution: Record<string, never>;
            /** @description Customer-safe shipment summary + timeline when an active outbound shipment exists (TTW-040) */
            shipment?: {
                /** @example Manual dispatch */
                carrierName: string;
                estimatedDeliveryAt?: Record<string, never> | null;
                events: {
                    customerMessage?: Record<string, never> | null;
                    exceptionCode?: Record<string, never> | null;
                    /** @example evt-1 */
                    id: string;
                    occurredAt: string;
                    /** @enum {string} */
                    type: "CANCELLED" | "CORRECTION" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "READY";
                }[];
                exceptionCode?: Record<string, never> | null;
                exceptionMessage?: Record<string, never> | null;
                /** @example ship-1 */
                id: string;
                /** @example shipment-lifecycle/v1-interim-2026-08-21 */
                policyVersion: string;
                /** @enum {string} */
                status: "CANCELLED" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "READY";
                /** @description Present only after dispatch */
                trackingNumber?: Record<string, never> | null;
                trackingUrl?: Record<string, never> | null;
            } | null;
            /**
             * @description Honest absent-state copy when no shipment exists; null when shipment is present
             * @example Shipping updates will appear here when available.
             */
            shipmentPlaceholder?: Record<string, never> | null;
            shipping: {
                city: string;
                /** @example Nigeria */
                country: string;
                landmark?: Record<string, never> | null;
                line1: string;
                line2?: Record<string, never> | null;
                phone?: Record<string, never> | null;
                postalCode?: Record<string, never> | null;
                recipientName?: Record<string, never> | null;
                state: string;
            };
            /** @example 2500 */
            shippingFee: number;
            /** @enum {string} */
            status: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
            /** @example 10000 */
            subtotalAmount: number;
            /** @example 12500 */
            totalAmount: number;
            updatedAt: string;
            /** @example 750 */
            vatAmount?: Record<string, never> | null;
        };
        CustomerOrderItemDetailDto: {
            /** @example camp-1 */
            campaignId?: Record<string, never> | null;
            /** @example design-1 */
            designId?: Record<string, never> | null;
            /** @example oi-1 */
            id: string;
            /** @description True when snapshotSource is BACKFILLED_CURRENT_CATALOG — display may not match what the buyer originally saw. */
            legacySnapshotDisclosure?: boolean;
            /** @example 10000 */
            lineTotal: number;
            optionPresentationSnapshot?: {
                /** @example Size */
                option: string;
                /** @example size */
                optionCode: string;
                /** @example Large */
                value: string;
                /** @example L */
                valueCode: string;
            }[] | null;
            /** @example prod-1 */
            productId: string;
            /** @example Classic Tee */
            productNameSnapshot: string;
            /** @example 2 */
            quantity: number;
            /** @enum {string} */
            snapshotSource: "BACKFILLED_CURRENT_CATALOG" | "PURCHASE";
            /** @example 1 */
            snapshotVersion: number;
            /**
             * @description Unit price charged (major units)
             * @example 5000
             */
            unitFinalPrice: number;
            /** @example Small / Red (SKU-1) */
            variantDisplaySnapshot: string;
            /** @example var-1 */
            variantId: string;
        };
        CustomerOrderOptionPresentationDto: {
            /** @example Size */
            option: string;
            /** @example size */
            optionCode: string;
            /** @example Large */
            value: string;
            /** @example L */
            valueCode: string;
        };
        CustomerOrderPaymentSummaryDto: {
            /** @example 12500 */
            amount: number;
            createdAt: string;
            /** @enum {string} */
            currency: "NGN";
            expiresAt?: Record<string, never> | null;
            /** @example pay-1 */
            id: string;
            /** @description Public-facing provider reference when present */
            providerRef?: Record<string, never> | null;
            /** @enum {string} */
            status: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
        };
        CustomerOrderRefundSummaryDto: {
            /** @example 2500 */
            amount: number;
            createdAt: string;
            /** @enum {string} */
            currency: "NGN";
            /** @example ref-1 */
            id: string;
            reason?: Record<string, never> | null;
            /** @enum {string} */
            status: "FAILED" | "INITIATED" | "NEEDS_ATTENTION" | "PROCESSING" | "SUCCEEDED";
        };
        CustomerOrderShippingSnapshotDto: {
            city: string;
            /** @example Nigeria */
            country: string;
            landmark?: Record<string, never> | null;
            line1: string;
            line2?: Record<string, never> | null;
            phone?: Record<string, never> | null;
            postalCode?: Record<string, never> | null;
            recipientName?: Record<string, never> | null;
            state: string;
        };
        CustomerShipmentEventDto: {
            customerMessage?: Record<string, never> | null;
            exceptionCode?: Record<string, never> | null;
            /** @example evt-1 */
            id: string;
            occurredAt: string;
            /** @enum {string} */
            type: "CANCELLED" | "CORRECTION" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "READY";
        };
        CustomerShipmentSummaryDto: {
            /** @example Manual dispatch */
            carrierName: string;
            estimatedDeliveryAt?: Record<string, never> | null;
            events: {
                customerMessage?: Record<string, never> | null;
                exceptionCode?: Record<string, never> | null;
                /** @example evt-1 */
                id: string;
                occurredAt: string;
                /** @enum {string} */
                type: "CANCELLED" | "CORRECTION" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "READY";
            }[];
            exceptionCode?: Record<string, never> | null;
            exceptionMessage?: Record<string, never> | null;
            /** @example ship-1 */
            id: string;
            /** @example shipment-lifecycle/v1-interim-2026-08-21 */
            policyVersion: string;
            /** @enum {string} */
            status: "CANCELLED" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "READY";
            /** @description Present only after dispatch */
            trackingNumber?: Record<string, never> | null;
            trackingUrl?: Record<string, never> | null;
        };
        DeadLetterAcknowledgeDto: {
            note?: string;
        };
        DeadLetterBulkReplayDto: {
            ids: string[];
            /** @description Operator reason recorded on acknowledgement. */
            reason: string;
        };
        DeadLetterReplayDto: {
            /** @description Operator reason recorded on acknowledgement. */
            reason: string;
        };
        ForgotPasswordDto: {
            /** @example user@example.com */
            email: string;
        };
        GrantMarketingConsentDto: {
            /** @enum {string} */
            channel: "EMAIL" | "SMS";
        };
        InitiatePaymentDto: {
            /**
             * @description Customer email for Paystack (defaults to user email if omitted)
             * @example customer@example.com
             */
            customerEmail?: string;
        };
        InitiatePaymentResponseDto: {
            /**
             * @description Paystack access_code for the same checkout session
             * @example access_xxx
             */
            accessCode: string;
            /**
             * @description created = new provider session after reserve; reused = returned an existing INITIATED session; reconciled = recovered a lost PENDING response via same-ref initialize
             * @enum {string}
             */
            attemptOutcome: "created" | "reconciled" | "reused";
            /**
             * @description Paystack authorization URL for redirect checkout
             * @example https://checkout.paystack.com/xxx
             */
            authorizationUrl: string;
            /**
             * @description Stable payment attempt / Paystack transaction reference
             * @example ord-clxyz-ab12cd
             */
            reference: string;
        };
        InitiatePayoutDto: {
            /** @example 5000 */
            amount: number;
            reason?: string;
        };
        LoginDto: {
            /** @example user@example.com */
            email: string;
            /** @example password123 */
            password: string;
        };
        ModerationActionDto: {
            /**
             * @description Optional admin notes stored alongside the moderation decision (internal only)
             * @example Contains prohibited text in front-view layer
             */
            notes?: string;
            /**
             * @description Moderation outcome (APPROVED, REJECTED, or FLAGGED)
             * @enum {string}
             */
            status: "APPROVED" | "FLAGGED" | "REJECTED";
        };
        NotificationPreferenceItemDto: {
            /** @enum {string} */
            category: "MARKETING" | "ORGANISER_OPERATIONAL" | "SECURITY" | "TRANSACTIONAL";
            /** @enum {string} */
            channel: "EMAIL" | "SMS";
            enabled: boolean;
        };
        NotificationUnsubscribeDto: {
            /** @description Signed unsubscribe token from email footer (HMAC, scoped, expiring). */
            token: string;
        };
        PrivacyReauthDto: {
            password: string;
        };
        PublicCampaignDesignDto: {
            /** @example design-1 */
            id: string;
            /** @example School crest */
            name: string;
            thumbnailUrl?: Record<string, never> | null;
        };
        PublicCampaignOfferDto: {
            /**
             * @description Campaign base price in integer minor units (before upcharges)
             * @example 500000
             */
            baseAmountMinor: number;
            /** @example cp-1 */
            campaignProductId: string;
            /** @example NGN */
            currency: string;
            design: {
                /** @example design-1 */
                id: string;
                /** @example School crest */
                name: string;
                thumbnailUrl?: Record<string, never> | null;
            };
            options: {
                /** @example color */
                code: string;
                /** @example opt-1 */
                id: string;
                /** @example Color */
                name: string;
                /** @example 0 */
                sortOrder: number;
                values: {
                    /** @example Black */
                    displayName: string;
                    /** @example ov-1 */
                    id: string;
                    /** @description Safe display metadata only (e.g. { hex: "#000000" }) */
                    metadata?: Record<string, never> | null;
                    /** @example 0 */
                    sortOrder: number;
                    /** @example BLACK */
                    valueCode: string;
                }[];
            }[];
            /**
             * @description before discounts, shipping and VAT
             * @example before discounts, shipping and VAT
             */
            priceDisclosure: string;
            product: {
                description?: Record<string, never> | null;
                /** @example prod-1 */
                id: string;
                /** @example Classic Tee */
                name: string;
                /** @example classic-tee */
                slug: string;
            };
            /** @example prod-1 */
            productId: string;
            variants: {
                /** @description Whether the variant is currently selectable. Never includes exact stock counts. */
                available: boolean;
                /** @example NGN */
                currency: string;
                /** @example var-1 */
                id: string;
                /**
                 * @description Value codes aligned with optionValueIds
                 * @example [
                 *       "BLACK",
                 *       "L"
                 *     ]
                 */
                optionValueCodes: string[];
                /**
                 * @description ProductOptionValue ids that define this variant
                 * @example [
                 *       "ov-1",
                 *       "ov-2"
                 *     ]
                 */
                optionValueIds: string[];
                /**
                 * @description Display unit price in integer minor units (campaign base + option upcharges)
                 * @example 550000
                 */
                unitAmountMinor: number;
            }[];
        };
        PublicCampaignOptionDto: {
            /** @example color */
            code: string;
            /** @example opt-1 */
            id: string;
            /** @example Color */
            name: string;
            /** @example 0 */
            sortOrder: number;
            values: {
                /** @example Black */
                displayName: string;
                /** @example ov-1 */
                id: string;
                /** @description Safe display metadata only (e.g. { hex: "#000000" }) */
                metadata?: Record<string, never> | null;
                /** @example 0 */
                sortOrder: number;
                /** @example BLACK */
                valueCode: string;
            }[];
        };
        PublicCampaignOptionValueDto: {
            /** @example Black */
            displayName: string;
            /** @example ov-1 */
            id: string;
            /** @description Safe display metadata only (e.g. { hex: "#000000" }) */
            metadata?: Record<string, never> | null;
            /** @example 0 */
            sortOrder: number;
            /** @example BLACK */
            valueCode: string;
        };
        PublicCampaignProductSummaryDto: {
            description?: Record<string, never> | null;
            /** @example prod-1 */
            id: string;
            /** @example Classic Tee */
            name: string;
            /** @example classic-tee */
            slug: string;
        };
        PublicCampaignVariantOfferDto: {
            /** @description Whether the variant is currently selectable. Never includes exact stock counts. */
            available: boolean;
            /** @example NGN */
            currency: string;
            /** @example var-1 */
            id: string;
            /**
             * @description Value codes aligned with optionValueIds
             * @example [
             *       "BLACK",
             *       "L"
             *     ]
             */
            optionValueCodes: string[];
            /**
             * @description ProductOptionValue ids that define this variant
             * @example [
             *       "ov-1",
             *       "ov-2"
             *     ]
             */
            optionValueIds: string[];
            /**
             * @description Display unit price in integer minor units (campaign base + option upcharges)
             * @example 550000
             */
            unitAmountMinor: number;
        };
        PublicFundraiserOrganizerDto: {
            firstName?: Record<string, never> | null;
            lastName?: Record<string, never> | null;
        };
        PublicFundraiserPerformanceDto: {
            /** @example NGN */
            currency: string;
            /** @example 120000 */
            currentAmount: number;
            /** @example 500000 */
            goalAmount?: Record<string, never> | null;
        };
        PublicFundraiserResponseDto: {
            /** @example NGN */
            currency: string;
            /** @example 120000 */
            currentAmount: number;
            description?: Record<string, never> | null;
            /** Format: date-time */
            endDate?: string | null;
            goalAmount?: Record<string, never> | null;
            /** @example camp-1 */
            id: string;
            /**
             * @description Versioned offer/disclosure policy identifier
             * @example public-campaign-offer/v1-interim-2026-08-21
             */
            offerPolicyVersion: string;
            organizer?: {
                firstName?: Record<string, never> | null;
                lastName?: Record<string, never> | null;
            } | null;
            performance: {
                /** @example NGN */
                currency: string;
                /** @example 120000 */
                currentAmount: number;
                /** @example 500000 */
                goalAmount?: Record<string, never> | null;
            };
            /** @description Sellable campaign product offers only */
            products: {
                /**
                 * @description Campaign base price in integer minor units (before upcharges)
                 * @example 500000
                 */
                baseAmountMinor: number;
                /** @example cp-1 */
                campaignProductId: string;
                /** @example NGN */
                currency: string;
                design: {
                    /** @example design-1 */
                    id: string;
                    /** @example School crest */
                    name: string;
                    thumbnailUrl?: Record<string, never> | null;
                };
                options: {
                    /** @example color */
                    code: string;
                    /** @example opt-1 */
                    id: string;
                    /** @example Color */
                    name: string;
                    /** @example 0 */
                    sortOrder: number;
                    values: {
                        /** @example Black */
                        displayName: string;
                        /** @example ov-1 */
                        id: string;
                        /** @description Safe display metadata only (e.g. { hex: "#000000" }) */
                        metadata?: Record<string, never> | null;
                        /** @example 0 */
                        sortOrder: number;
                        /** @example BLACK */
                        valueCode: string;
                    }[];
                }[];
                /**
                 * @description before discounts, shipping and VAT
                 * @example before discounts, shipping and VAT
                 */
                priceDisclosure: string;
                product: {
                    description?: Record<string, never> | null;
                    /** @example prod-1 */
                    id: string;
                    /** @example Classic Tee */
                    name: string;
                    /** @example classic-tee */
                    slug: string;
                };
                /** @example prod-1 */
                productId: string;
                variants: {
                    /** @description Whether the variant is currently selectable. Never includes exact stock counts. */
                    available: boolean;
                    /** @example NGN */
                    currency: string;
                    /** @example var-1 */
                    id: string;
                    /**
                     * @description Value codes aligned with optionValueIds
                     * @example [
                     *       "BLACK",
                     *       "L"
                     *     ]
                     */
                    optionValueCodes: string[];
                    /**
                     * @description ProductOptionValue ids that define this variant
                     * @example [
                     *       "ov-1",
                     *       "ov-2"
                     *     ]
                     */
                    optionValueIds: string[];
                    /**
                     * @description Display unit price in integer minor units (campaign base + option upcharges)
                     * @example 550000
                     */
                    unitAmountMinor: number;
                }[];
            }[];
            /** @example school-fundraiser */
            slug: string;
            /** Format: date-time */
            startDate?: string | null;
            /** @example ACTIVE */
            status: string;
            story?: Record<string, never> | null;
            /** @example School Fundraiser */
            title: string;
        };
        PublicFundraiserSitemapItemDto: {
            /** @example school-fundraiser */
            slug: string;
            /** @example 2026-08-22T12:00:00.000Z */
            updatedAt: string;
        };
        PublicFundraiserSitemapResponseDto: {
            items: {
                /** @example school-fundraiser */
                slug: string;
                /** @example 2026-08-22T12:00:00.000Z */
                updatedAt: string;
            }[];
        };
        QuoteItemDto: {
            /** @example campaign-1 */
            campaignId?: string;
            /** @example design-1 */
            designId?: string;
            /** @example 2 */
            quantity: number;
            /** @example var-1 */
            variantId: string;
        };
        QuoteRequestDto: {
            items: {
                /** @example campaign-1 */
                campaignId?: string;
                /** @example design-1 */
                designId?: string;
                /** @example 2 */
                quantity: number;
                /** @example var-1 */
                variantId: string;
            }[];
            /**
             * @description Address ID for shipping zone lookup
             * @example addr-1
             */
            shippingAddressId: string;
        };
        RegisterDto: {
            /** @example user@example.com */
            email: string;
            /** @example John */
            firstName: string;
            /** @example Doe */
            lastName: string;
            /** @example password123 */
            password: string;
            /** @example +2348012345678 */
            phone?: string;
        };
        RejectCampaignDto: {
            /**
             * @description Internal admin notes (not shown to organiser)
             * @example Flagged for misleading charity claims
             */
            notes?: string;
            /**
             * @description Reason shown to the organiser explaining why their campaign was rejected
             * @example Campaign description contains prohibited content. Please revise and resubmit.
             */
            rejectionReason: string;
        };
        RejectOrganizerApplicationDto: {
            /** @description Customer-safe rejection reason (no internal notes) */
            customerVisibleReason: string;
            internalNotes?: string;
        };
        RemoveCampaignOfferDto: {
            /**
             * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
             * @example 1
             */
            expectedRevision: number;
        };
        RequestManualAdjustmentDto: {
            /**
             * @description Payout amount (NGN)
             * @example 5000
             */
            amount: number;
            /**
             * @description Required reason for off-ledger payout
             * @example Goodwill adjustment per organizer request
             */
            reason: string;
        };
        ResendVerificationDto: {
            /** @example user@example.com */
            email: string;
        };
        ResetPasswordDto: {
            /** @example NewPassword123! */
            newPassword: string;
            /** @description Token from password reset email link */
            token: string;
        };
        ResolveAppealDto: {
            /** @description Optional customer-safe explanation override */
            customerExplanation?: string;
            /** @description Internal reviewer notes (not returned to owners) */
            notes?: string;
            /** @enum {string} */
            resolution: "OVERTURNED" | "UPHELD";
            /**
             * @description When OVERTURNED, optional new outcome (defaults to APPROVED)
             * @enum {string}
             */
            status?: "APPROVED" | "FLAGGED" | "REJECTED";
        };
        SubmitOrganizerApplicationDto: {
            intendedUse: string;
            organisationName: string;
            /** @description ISO timestamp when the applicant accepted terms */
            termsAcceptedAt: string;
            /** @example organiser-terms/v1-interim-2026-08-21 */
            termsVersion: string;
        };
        UpdateAddressDto: {
            /** @example 123 Main Street */
            addressLine1?: string;
            /** @example Apt 4B */
            addressLine2?: string;
            /** @example Lagos */
            administrativeAreaLevel1?: string;
            /** @example Ikeja */
            administrativeAreaLevel2?: string;
            /** @example Lagos */
            city?: string;
            /** @example Nigeria */
            country?: string;
            /** @example NG */
            countryCode?: string;
            /** @example Victoria Island */
            dependentLocality?: string;
            /** @example 12 Broad Street, Lagos, Nigeria */
            formattedAddress?: string;
            /** @example ChIJrTLr-GyuEmsRBfy61i59si0 */
            googlePlaceId?: string;
            /** @example Leave at gate */
            instructions?: string;
            /** @example false */
            isDefault?: boolean;
            /** @example Near the roundabout */
            landmark?: string;
            /** @example 6.5244 */
            latitude?: number;
            /** @example cme4abcd1234 */
            lgaId?: string;
            /** @example Lagos */
            locality?: string;
            /** @example 3.3792 */
            longitude?: number;
            /** @example +2348012345678 */
            phone?: string;
            /** @example 100001 */
            postalCode?: string;
            /** @enum {string} */
            provider?: "GOOGLE_PLACES" | "MANUAL" | "OTHER";
            /** @example John Doe */
            recipientName?: string;
            /** @example Lagos */
            state?: string;
            /** @example LA */
            stateCode?: string;
        };
        UpdateAdminNotificationRouteDto: {
            emailBodyTemplate?: Record<string, never>;
            emailRecipients?: string[];
            enabled?: boolean;
            notifyEmail?: boolean;
            notifySlack?: boolean;
            notifySms?: boolean;
            slackWebhookUrl?: Record<string, never>;
            smsBodyTemplate?: Record<string, never>;
            smsRecipients?: string[];
            subjectTemplate?: Record<string, never>;
        };
        UpdateAdminUserRoleDto: {
            /** @description Required when promoting CUSTOMER → ORGANIZER (creates equivalent APPROVED application). */
            reason?: string;
            /** @enum {string} */
            role: "ADMIN" | "CUSTOMER" | "ORGANIZER";
        };
        UpdateBulkPricingDto: {
            /** @example NGN */
            currency?: string;
            /**
             * @description Maximum quantity (inclusive); omit for open-ended
             * @example 24
             */
            maxQuantity?: number;
            /**
             * @description Minimum quantity for this tier
             * @example 10
             */
            minQuantity?: number;
            /**
             * @description Price per unit in this tier
             * @example 4500
             */
            pricePerUnit?: number;
            productId?: string;
            /** @description Variant-specific tier; omit for product-level */
            variantId?: string;
        };
        UpdateCampaignBasicsDto: {
            /** @example Raising funds for our school */
            description?: Record<string, never>;
            /** @example 2025-02-28T23:59:59Z */
            endDate?: Record<string, never> | null;
            /**
             * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
             * @example 1
             */
            expectedRevision: number;
            /**
             * @description Goal in NGN major units; omit or null to clear
             * @example 500000
             */
            goalAmount?: Record<string, never> | null;
            /** @example school-fundraiser-2025 */
            slug?: string;
            /** @example 2025-02-01T00:00:00Z */
            startDate?: Record<string, never> | null;
            /** @example Our story... */
            story?: Record<string, never>;
            /** @example School Fundraiser 2025 */
            title?: string;
        };
        UpdateCampaignOfferDto: {
            /** @example design-2 */
            designId?: string;
            /**
             * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
             * @example 1
             */
            expectedRevision: number;
            /**
             * @description Selling price in NGN major units (≥ current server floor)
             * @example 16000
             */
            price?: number;
        };
        UpdateCampaignPayoutPolicyDto: {
            /**
             * @description Override site payout mode for this campaign, or null to clear and use site default (admin only)
             * @enum {string|null}
             */
            payoutModeOverride?: "AUTO_APPROVAL_REQUIRED" | "AUTO_EXECUTE" | "MANUAL" | null;
        };
        UpdateCampaignStatusDto: {
            /** @enum {string} */
            status: "ACTIVE" | "DISABLED" | "DRAFT" | "ENDED" | "PAUSED" | "REVIEW";
        };
        UpdateCategoryDto: {
            /** @example Comfortable cotton t-shirts */
            description?: string;
            /** @example T-Shirts */
            name?: string;
            /** @example t-shirts */
            slug?: string;
        };
        UpdateDesignDto: {
            /** @description Structured design data (version, views, layers per view) */
            designData?: Record<string, never>;
            /** @example My Tee Design */
            name?: string;
            /** @example https://cdn.example.com/thumb.png */
            thumbnailUrl?: string;
        };
        UpdateDiscountDto: {
            /** @description Campaign IDs when scope is CAMPAIGN */
            campaignIds?: string[];
            /** @example SAVE10 */
            code?: string;
            /**
             * @description Required when type is FIXED
             * @example NGN
             */
            currency?: string;
            endAt?: string;
            maxRedemptions?: number;
            minOrderAmount?: number;
            /** @description Product IDs when scope is PRODUCT */
            productIds?: string[];
            /** @enum {string} */
            scope?: "CAMPAIGN" | "ORDER" | "PRODUCT" | "VARIANT";
            startAt?: string;
            /**
             * @default ACTIVE
             * @enum {string}
             */
            status: "ACTIVE" | "INACTIVE";
            /** @enum {string} */
            type?: "BULK" | "FIXED" | "PERCENTAGE";
            /**
             * @description For FIXED: amount; requires currency
             * @example 500
             */
            valueAmount?: number;
            /**
             * @description For PERCENTAGE: 0–100
             * @example 10
             */
            valuePercent?: number;
            /** @description Variant IDs when scope is VARIANT */
            variantIds?: string[];
        };
        UpdateInventoryDto: {
            /**
             * @description Variant isAvailable flag
             * @example true
             */
            isAvailable?: boolean;
            /** @example 10 */
            lowStockThreshold?: number;
            /** @example 5 */
            reserved?: number;
            /** @example 100 */
            stockOnHand?: number;
            /** @example true */
            trackInventory?: boolean;
        };
        UpdateNotificationPreferencesDto: {
            preferences: {
                /** @enum {string} */
                category: "MARKETING" | "ORGANISER_OPERATIONAL" | "SECURITY" | "TRANSACTIONAL";
                /** @enum {string} */
                channel: "EMAIL" | "SMS";
                enabled: boolean;
            }[];
        };
        UpdateOptionDto: {
            /** @example size */
            code?: string;
            /** @example Size */
            name?: string;
            /** @example 0 */
            sortOrder?: number;
        };
        UpdateOptionValueDto: {
            /** @example Large */
            displayName?: string;
            /**
             * @example {
             *       "hex": "#000000"
             *     }
             */
            metadata?: Record<string, never>;
            /** @example 0 */
            sortOrder?: number;
            /** @example L */
            valueCode?: string;
        };
        UpdateOrderStatusDto: {
            /** @enum {string} */
            status: "CANCELLED" | "PROCESSING";
        };
        UpdatePayoutProfileDto: {
            accountName?: string;
            accountNumber?: string;
            /** @description Changing bank identity clears recipient codes, bumps destinationVersion, and requires re-verification (TTW-042). Existing payout snapshots are unaffected. */
            bankCode?: string;
            bankName?: string;
            isDefault?: boolean;
            label?: string;
        };
        UpdatePrintAreaDto: {
            /** @example 0.5 */
            height?: number;
            /** @example 6 */
            maxColors?: number;
            /** @example 5 */
            maxLayers?: number;
            /** @example false */
            rotationAllowed?: boolean;
            /** @example 0.6 */
            width?: number;
            /** @example 0.1 */
            x?: number;
            /** @example 0.2 */
            y?: number;
        };
        UpdateProductDto: {
            /** @example prod-cat-1 */
            categoryId?: string;
            /** @example Soft cotton t-shirt */
            description?: string;
            /** @example Classic Cotton Tee */
            name?: string;
            /** @example 40 */
            packageHeightMm?: number;
            /** @example 320 */
            packageLengthMm?: number;
            /** @example 240 */
            packageWidthMm?: number;
            /** @example classic-cotton-tee */
            slug?: string;
            /** @enum {string} */
            status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
            /** @example 300 */
            weightGrams?: number;
        };
        UpdateProductImageDto: {
            /** @example Front view */
            altText?: string;
            /** @example media-asset-id */
            mediaAssetId?: string;
            /** @example 0 */
            sortOrder?: number;
            /** @example variant-id */
            variantId?: string;
        };
        UpdateProductImageRoleDto: {
            /** @example product-view-id */
            productViewId?: string;
            /** @enum {string} */
            role?: "GALLERY" | "THUMBNAIL" | "WORKSHOP_TEMPLATE";
            /** @example 0 */
            sortOrder?: number;
        };
        UpdateProductPriceDto: {
            /** @example 15000 */
            amount?: number;
            /** @example 20000 */
            compareAt?: number;
            /** @enum {string} */
            currency?: "NGN";
        };
        UpdateProductViewDto: {
            /** @example Front */
            displayName?: string;
            /** @example false */
            isDefault?: boolean;
            /** @example true */
            isDesignable?: boolean;
            /** @example front */
            key?: string;
            /** @example 0 */
            sortOrder?: number;
        };
        UpdateProfileDto: {
            /** @example John */
            firstName?: string;
            /** @example Doe */
            lastName?: string;
            /** @example +2348012345678 */
            phone?: string;
        };
        UpdateShipmentStatusDto: {
            /** @description Required with supersedesEventId — audit reason */
            correctionReason?: string;
            /** @description Customer-safe exception override (max 500) */
            customerMessage?: string;
            /** @enum {string} */
            exceptionCode?: "ADDRESS_FAILURE" | "CUSTOMER_UNAVAILABLE" | "DAMAGED" | "LATE" | "LOST" | "OTHER";
            /** @description Idempotency key unique per shipment for this transition */
            idempotencyKey: string;
            occurredAt?: string;
            privateNotes?: string;
            /** @enum {string} */
            status: "CANCELLED" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY";
            /** @description Required when correcting a prior mistaken event */
            supersedesEventId?: string;
            /** @description Required when status is DISPATCHED (and later non-cancel) */
            trackingNumber?: string;
            /** @description https URL on the interim allowlist */
            trackingUrl?: string;
        };
        UpdateShippingRateDto: {
            /**
             * @default NGN
             * @enum {string}
             */
            currency: "NGN";
            /** @description ISO date string */
            effectiveFrom?: Record<string, never>;
            /** @description ISO date string */
            effectiveTo?: Record<string, never>;
            /**
             * @description Flat fee amount
             * @example 1500
             */
            flatFee?: number;
            isActive?: boolean;
            /** @example 5 */
            maxDeliveryDays?: Record<string, never>;
            /** @example 2 */
            minDeliveryDays?: Record<string, never>;
            /**
             * @default 100
             * @example 100
             */
            priority: number;
            /** @enum {string} */
            provider?: "INTERNAL";
            /** @example STANDARD */
            serviceLevel?: string;
        };
        UpdateShippingRuleDto: {
            /**
             * @description ISO 3166-1 alpha-2 country code
             * @example NG
             */
            countryCode?: string;
            isActive?: boolean;
            /** @example LA */
            matchContext?: Record<string, never>;
            /** @enum {string} */
            matchType?: "ADMIN1" | "ADMIN2" | "CITY" | "POSTAL_CODE" | "POSTAL_PREFIX";
            /** @example LA */
            matchValue?: string;
            /** @example 100 */
            priority?: number;
        };
        UpdateShippingZoneDto: {
            isActive?: boolean;
            name?: string;
        };
        UpdateSiteSettingsDto: {
            /**
             * @description Auto-retry failed Paystack transfers
             * @default true
             */
            autoRetryFailedPayouts: boolean;
            /** @enum {string} */
            currency?: "NGN";
            /**
             * @description Minimum payout amount in NGN
             * @example 1000
             */
            minimumPayoutAmount?: number;
            /**
             * @description Payout cadence in days (e.g. 7 = weekly)
             * @example 7
             */
            payoutCadenceDays?: number;
            /**
             * @description Fundraiser payout mode: MANUAL, AUTO_APPROVAL_REQUIRED, AUTO_EXECUTE. AUTO_EXECUTE requires PAYOUT_AUTO_EXECUTE_ENABLED=true (TTW-042).
             * @enum {string}
             */
            payoutMode?: "AUTO_APPROVAL_REQUIRED" | "AUTO_EXECUTE" | "MANUAL";
            /**
             * @description Settlement hold days before payout eligibility
             * @example 7
             */
            payoutSettlementHoldDays?: number;
            /** @default true */
            pricesIncludeVat: boolean;
            /** @default true */
            vatAppliesToShipping: boolean;
            /**
             * @description VAT rate (e.g. 0.075 for 7.5%)
             * @example 0.075
             */
            vatRate?: number;
        };
        UpdateTemplateEffectDto: {
            /** @enum {string} */
            effectType?: "HIDE" | "REPLACE_IMAGE" | "SHOW" | "TINT";
            /**
             * @example {
             *       "opacity": 0.8
             *     }
             */
            meta?: Record<string, never>;
            /** @example option-id */
            optionId?: string;
            /** @example option-value-id */
            optionValueId?: string;
            /** @example replacement-image-id */
            replacementImageId?: string;
            /** @example template-layer-id */
            templateLayerId?: string;
            /** @example #00FF00 */
            tintHex?: string;
        };
        UpdateTemplateLayerDto: {
            /** @enum {string} */
            blendMode?: "DARKEN" | "LIGHTEN" | "MULTIPLY" | "NORMAL" | "OVERLAY" | "SCREEN";
            /** @example Base layer */
            displayName?: string;
            /** @example image-id */
            imageId?: string;
            /** @example base */
            key?: string;
            /** @enum {string} */
            layerType?: "BASE" | "DETAIL" | "HIGHLIGHT" | "MASK_OVERLAY" | "OUTLINE" | "SHADOW";
            /**
             * @example {
             *       "scale": 1
             *     }
             */
            meta?: Record<string, never>;
            /** @example 1 */
            opacity?: number;
            /** @example 0 */
            zIndex?: number;
        };
        UpdateVariantDto: {
            /** @example true */
            isAvailable?: boolean;
            /** @example Small / Red */
            name?: string;
            /** @example 40 */
            packageHeightMm?: number;
            /** @example 320 */
            packageLengthMm?: number;
            /** @example 240 */
            packageWidthMm?: number;
            /** @example SKU-TEE-S-RED */
            sku?: string;
            /** @example 320 */
            weightGrams?: number;
        };
        UpdateVariantPriceDto: {
            /** @example 16000 */
            amount?: number;
            /** @example 20000 */
            compareAt?: number;
            /** @enum {string} */
            currency?: "NGN";
        };
        VerifyEmailDto: {
            /**
             * @description Email verification token
             * @example clx...
             */
            token: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    AnalyticsController_getCampaignSnapshot: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaignId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Campaign snapshot */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_drilldownOrders: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Paginated order rows + meta */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_drilldownPayouts: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_drilldownReconciliation: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_drilldownRefunds: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_drilldownSettlements: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_exportCsv: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description CSV file */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unknown entity / limit / filters */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_getMoneyMetrics: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Money metrics with meta */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_getOverview: {
        parameters: {
            query?: {
                /** @description Inclusive Lagos calendar start date (YYYY-MM-DD) */
                dateFrom?: string;
                /** @description Inclusive Lagos calendar end date (YYYY-MM-DD) */
                dateTo?: string;
                /** @description Filter to a single campaign id */
                campaignId?: string;
                /** @description Orders that include at least one line for this product */
                productId?: string;
                orderStatus?: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                paymentStatus?: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                /** @description STORE = no campaign; FUNDRAISER = campaign order */
                channel?: "FUNDRAISER" | "STORE";
                /** @description v1 supports NGN only */
                currency?: "NGN";
                /** @description Export entity (orders|campaigns). Unknown values rejected. */
                entity?: "campaigns" | "orders";
                /** @description Opaque cursor (entity id) for drill-down pagination */
                cursor?: string;
                /** @description Drill-down page size (1–100) */
                take?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Overview metrics with meta */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid filters / reversed window */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AnalyticsController_getPayoutOverview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Payout run and payout counts */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminBulkPricingController_findAll: {
        parameters: {
            query?: {
                productId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of tiers */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminBulkPricingController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example NGN */
                    currency: string;
                    /**
                     * @description Maximum quantity (inclusive); omit for open-ended
                     * @example 24
                     */
                    maxQuantity?: number;
                    /**
                     * @description Minimum quantity for this tier
                     * @example 10
                     */
                    minQuantity: number;
                    /**
                     * @description Price per unit in this tier
                     * @example 4500
                     */
                    pricePerUnit: number;
                    productId: string;
                    /** @description Variant-specific tier; omit for product-level */
                    variantId?: string;
                };
            };
        };
        responses: {
            /** @description Tier created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Overlap or invalid range */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminBulkPricingController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Bulk pricing tier ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Tier deleted */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Tier not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminBulkPricingController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Bulk pricing tier ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example NGN */
                    currency?: string;
                    /**
                     * @description Maximum quantity (inclusive); omit for open-ended
                     * @example 24
                     */
                    maxQuantity?: number;
                    /**
                     * @description Minimum quantity for this tier
                     * @example 10
                     */
                    minQuantity?: number;
                    /**
                     * @description Price per unit in this tier
                     * @example 4500
                     */
                    pricePerUnit?: number;
                    productId?: string;
                    /** @description Variant-specific tier; omit for product-level */
                    variantId?: string;
                };
            };
        };
        responses: {
            /** @description Tier updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Overlap or invalid range */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Tier not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCampaignsController_findAll: {
        parameters: {
            query?: {
                /** @description Filter by campaign status (use REVIEW for the moderation queue) */
                status?: "ACTIVE" | "DISABLED" | "DRAFT" | "ENDED" | "PAUSED" | "REVIEW";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of campaigns */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutsController_initiatePayout: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaignId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 5000 */
                    amount: number;
                    reason?: string;
                };
            };
        };
        responses: {
            /** @description Payout initiated */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid amount or no payout profile */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutsController_requestManualAdjustment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                campaignId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Payout amount (NGN)
                     * @example 5000
                     */
                    amount: number;
                    /**
                     * @description Required reason for off-ledger payout
                     * @example Goodwill adjustment per organizer request
                     */
                    reason: string;
                };
            };
        };
        responses: {
            /** @description Manual adjustment requested */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid amount or no payout profile */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCampaignsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Campaign detail with organizer, products, and designs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCampaignsController_activate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Campaign activated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not in REVIEW status, or readiness blockers (stable CAMPAIGN_READINESS_* codes) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCampaignsController_updatePayoutPolicy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Override site payout mode for this campaign, or null to clear and use site default (admin only)
                     * @enum {string|null}
                     */
                    payoutModeOverride?: "AUTO_APPROVAL_REQUIRED" | "AUTO_EXECUTE" | "MANUAL" | null;
                };
            };
        };
        responses: {
            /** @description Campaign payout policy updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid payoutModeOverride value (must be MANUAL, AUTO_APPROVAL_REQUIRED, AUTO_EXECUTE, or null) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCampaignsController_reject: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Internal admin notes (not shown to organiser)
                     * @example Flagged for misleading charity claims
                     */
                    notes?: string;
                    /**
                     * @description Reason shown to the organiser explaining why their campaign was rejected
                     * @example Campaign description contains prohibited content. Please revise and resubmit.
                     */
                    rejectionReason: string;
                };
            };
        };
        responses: {
            /** @description Campaign rejected and returned to DRAFT */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not in REVIEW status */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCampaignsController_resume: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Campaign resumed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not PAUSED, revision mismatch, or readiness blockers (stable CAMPAIGN_READINESS_* codes) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCampaignsController_updateStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    status: "ACTIVE" | "DISABLED" | "DRAFT" | "ENDED" | "PAUSED" | "REVIEW";
                };
            };
        };
        responses: {
            /** @description Campaign status updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid status transition */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCategoriesController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of categories */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCategoriesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Comfortable cotton t-shirts */
                    description?: string;
                    /** @example T-Shirts */
                    name: string;
                    /** @example t-shirts */
                    slug?: string;
                };
            };
        };
        responses: {
            /** @description Category created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCategoriesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Category ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Category deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Category not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminCategoriesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Category ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Comfortable cotton t-shirts */
                    description?: string;
                    /** @example T-Shirts */
                    name?: string;
                    /** @example t-shirts */
                    slug?: string;
                };
            };
        };
        responses: {
            /** @description Category updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Category not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminDesignsController_findAll: {
        parameters: {
            query?: {
                /** @description Filter by moderation status */
                status?: "APPROVED" | "FLAGGED" | "PENDING" | "REJECTED";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of designs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminDesignsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Design detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminDesignsController_updateModeration: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Optional admin notes stored alongside the moderation decision (internal only)
                     * @example Contains prohibited text in front-view layer
                     */
                    notes?: string;
                    /**
                     * @description Moderation outcome (APPROVED, REJECTED, or FLAGGED)
                     * @enum {string}
                     */
                    status: "APPROVED" | "FLAGGED" | "REJECTED";
                };
            };
        };
        responses: {
            /** @description Design moderation updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminDiscountsController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of discounts */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminDiscountsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Campaign IDs when scope is CAMPAIGN */
                    campaignIds?: string[];
                    /** @example SAVE10 */
                    code?: string;
                    /**
                     * @description Required when type is FIXED
                     * @example NGN
                     */
                    currency?: string;
                    endAt?: string;
                    maxRedemptions?: number;
                    minOrderAmount?: number;
                    /** @description Product IDs when scope is PRODUCT */
                    productIds?: string[];
                    /** @enum {string} */
                    scope: "CAMPAIGN" | "ORDER" | "PRODUCT" | "VARIANT";
                    startAt?: string;
                    /**
                     * @default ACTIVE
                     * @enum {string}
                     */
                    status?: "ACTIVE" | "INACTIVE";
                    /** @enum {string} */
                    type: "BULK" | "FIXED" | "PERCENTAGE";
                    /**
                     * @description For FIXED: amount; requires currency
                     * @example 500
                     */
                    valueAmount?: number;
                    /**
                     * @description For PERCENTAGE: 0–100
                     * @example 10
                     */
                    valuePercent?: number;
                    /** @description Variant IDs when scope is VARIANT */
                    variantIds?: string[];
                };
            };
        };
        responses: {
            /** @description Discount created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation failed (e.g. currency required for FIXED, or conflict) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminDiscountsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Discount ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Discount */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Discount not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminDiscountsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Discount ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Campaign IDs when scope is CAMPAIGN */
                    campaignIds?: string[];
                    /** @example SAVE10 */
                    code?: string;
                    /**
                     * @description Required when type is FIXED
                     * @example NGN
                     */
                    currency?: string;
                    endAt?: string;
                    maxRedemptions?: number;
                    minOrderAmount?: number;
                    /** @description Product IDs when scope is PRODUCT */
                    productIds?: string[];
                    /** @enum {string} */
                    scope?: "CAMPAIGN" | "ORDER" | "PRODUCT" | "VARIANT";
                    startAt?: string;
                    /**
                     * @default ACTIVE
                     * @enum {string}
                     */
                    status?: "ACTIVE" | "INACTIVE";
                    /** @enum {string} */
                    type?: "BULK" | "FIXED" | "PERCENTAGE";
                    /**
                     * @description For FIXED: amount; requires currency
                     * @example 500
                     */
                    valueAmount?: number;
                    /**
                     * @description For PERCENTAGE: 0–100
                     * @example 10
                     */
                    valuePercent?: number;
                    /** @description Variant IDs when scope is VARIANT */
                    variantIds?: string[];
                };
            };
        };
        responses: {
            /** @description Discount updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation failed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Discount not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_listStates: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of states */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_listLgas: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description State code (e.g. LA) */
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of LGAs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description State not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminInventoryController_updateVariant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Variant ID */
                variantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Variant isAvailable flag
                     * @example true
                     */
                    isAvailable?: boolean;
                    /** @example 10 */
                    lowStockThreshold?: number;
                    /** @example 5 */
                    reserved?: number;
                    /** @example 100 */
                    stockOnHand?: number;
                    /** @example true */
                    trackInventory?: boolean;
                };
            };
        };
        responses: {
            /** @description Inventory updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Variant not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminMediaController_findAll: {
        parameters: {
            query?: {
                /** @description Filter by moderation status */
                status?: "APPROVED" | "FLAGGED" | "PENDING" | "REJECTED";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of media assets */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminMediaController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Media asset ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Media asset detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminMediaController_updateModeration: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Media asset ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Optional admin notes stored alongside the moderation decision (internal only)
                     * @example Contains prohibited text in front-view layer
                     */
                    notes?: string;
                    /**
                     * @description Moderation outcome (APPROVED, REJECTED, or FLAGGED)
                     * @enum {string}
                     */
                    status: "APPROVED" | "FLAGGED" | "REJECTED";
                };
            };
        };
        responses: {
            /** @description Moderation status updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminModerationAppealsController_list: {
        parameters: {
            query?: {
                status?: "ESCALATED" | "OVERTURNED" | "PENDING" | "UPHELD" | "WITHDRAWN";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Appeal queue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminModerationAppealsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Appeal ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Appeal detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminModerationAppealsController_resolve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Appeal ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Optional customer-safe explanation override */
                    customerExplanation?: string;
                    /** @description Internal reviewer notes (not returned to owners) */
                    notes?: string;
                    /** @enum {string} */
                    resolution: "OVERTURNED" | "UPHELD";
                    /**
                     * @description When OVERTURNED, optional new outcome (defaults to APPROVED)
                     * @enum {string}
                     */
                    status?: "APPROVED" | "FLAGGED" | "REJECTED";
                };
            };
        };
        responses: {
            /** @description Appeal resolved */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Reviewer independence violation */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationDeadLettersController_list: {
        parameters: {
            query?: {
                channel?: "EMAIL" | "SLACK" | "SMS";
                eventName?: string;
                ackStatus?: "ACKNOWLEDGED" | "OPEN";
                limit?: string;
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationDeadLettersController_bulkReplay: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
                    /** @description Operator reason recorded on acknowledgement. */
                    reason: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationDeadLettersController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationDeadLettersController_acknowledge: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    note?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationDeadLettersController_replay: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Operator reason recorded on acknowledgement. */
                    reason: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationRoutesController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationRoutesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Handlebars HTML body; omit to use built-in default */
                    emailBodyTemplate?: Record<string, never>;
                    /** @default [] */
                    emailRecipients?: string[];
                    /** @default true */
                    enabled?: boolean;
                    /** @example admin.order.placed */
                    eventKey: string;
                    /** @default default */
                    name?: string;
                    /** @default false */
                    notifyEmail?: boolean;
                    /** @default false */
                    notifySlack?: boolean;
                    /** @default false */
                    notifySms?: boolean;
                    slackWebhookUrl?: Record<string, never>;
                    /** @description Handlebars SMS body; omit to use built-in default */
                    smsBodyTemplate?: Record<string, never>;
                    /** @default [] */
                    smsRecipients?: string[];
                    /** @description Handlebars subject; omit to use built-in default for eventKey */
                    subjectTemplate?: Record<string, never>;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationRoutesController_eventCatalog: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationRoutesController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationRoutesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationRoutesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    emailBodyTemplate?: Record<string, never>;
                    emailRecipients?: string[];
                    enabled?: boolean;
                    notifyEmail?: boolean;
                    notifySlack?: boolean;
                    notifySms?: boolean;
                    slackWebhookUrl?: Record<string, never>;
                    smsBodyTemplate?: Record<string, never>;
                    smsRecipients?: string[];
                    subjectTemplate?: Record<string, never>;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminNotificationsController_broadcastEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    audience: "USER_IDS" | "VERIFIED_CUSTOMERS" | "VERIFIED_CUSTOMERS_AND_ORGANIZERS" | "VERIFIED_ORGANIZERS";
                    /**
                     * @description If true, returns recipient count and sample emails only; no rows queued.
                     * @default false
                     */
                    dryRun?: boolean;
                    /** @description HTML body (sanitized server-side). Use simple markup; scripts removed. */
                    htmlBody: string;
                    /** @example Holiday shipping update */
                    subject: string;
                    /** @description Required when audience is USER_IDS */
                    userIds?: string[];
                };
            };
        };
        responses: {
            /** @description Preview or queued send result */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrdersController_findAll: {
        parameters: {
            query?: {
                /** @description Filter by order status */
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of orders */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrdersController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Order ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Order */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrdersController_updateStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Order ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    status: "CANCELLED" | "PROCESSING";
                };
            };
        };
        responses: {
            /** @description Order updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrdersController_refund: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Order ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Refund amount in major currency (e.g. NGN)
                     * @example 5000
                     */
                    amount: number;
                    /** @description Optional idempotency key so retries reuse the same refund attempt (TTW-013) */
                    idempotencyKey?: string;
                    /** @description Optional free-text note (not used for eligibility) */
                    reason?: string;
                    /**
                     * @description Stable TTW-041 refund reason code (server policy authority; required)
                     * @example DEFECT_OR_NOT_AS_DESCRIBED
                     * @enum {string}
                     */
                    reasonCode: "ADDRESS_FAILURE_PLATFORM" | "ADMIN_GOODWILL" | "CARRIER_LOSS_OR_DAMAGE" | "CHANGE_OF_MIND" | "DEFECT_OR_NOT_AS_DESCRIBED" | "DUPLICATE_OR_PRICING_ERROR" | "PRODUCTION_FAILURE";
                };
            };
        };
        responses: {
            /** @description Refund reserved/initiated; financial effects apply on refund.processed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid amount, missing/illegal reasonCode, or order not refundable (stable TTW-041 code) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Provider transient failure — retry with same idempotency key */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShipmentsController_listForOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Order ID */
                orderId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shipments with event history */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShipmentsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Order ID */
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Carrier vocabulary code (no live carrier adapter in v1)
                     * @default MANUAL
                     * @enum {string}
                     */
                    carrierCode: "DHL" | "FEDEX" | "GIG" | "MANUAL" | "NIPOST" | "OTHER" | "UPS";
                    /** @description Optional calendar estimated delivery (ISO-8601) */
                    estimatedDeliveryAt?: string;
                    /** @description Client idempotency key for the READY event */
                    idempotencyKey?: string;
                    privateNotes?: string;
                    serviceCode?: string;
                };
            };
        };
        responses: {
            /** @description Shipment created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not eligible */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Active outbound shipment already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrganizerApplicationsController_list: {
        parameters: {
            query?: {
                status?: "APPROVED" | "PENDING" | "REJECTED" | "WITHDRAWN";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Application queue */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrganizerApplicationsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Application id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Application detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrganizerApplicationsController_approve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Application id */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    internalNotes?: string;
                };
            };
        };
        responses: {
            /** @description Application approved */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Self-review blocked */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not pending */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminOrganizerApplicationsController_reject: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Application id */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Customer-safe rejection reason (no internal notes) */
                    customerVisibleReason: string;
                    internalNotes?: string;
                };
            };
        };
        responses: {
            /** @description Application rejected */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Self-review blocked */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not pending */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutProfilesController_setStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description VERIFIED required for selection. SUSPENDED/REJECTED block payouts. SUPERSEDED is for superseded destinations.
                     * @enum {string}
                     */
                    status: "PENDING_VERIFICATION" | "REJECTED" | "SUPERSEDED" | "SUSPENDED" | "VERIFIED";
                };
            };
        };
        responses: {
            /** @description Updated payout profile */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Profile not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutRunsController_list: {
        parameters: {
            query?: {
                status?: "APPROVED" | "CANCELLED" | "COMPLETED" | "DRAFT" | "EXECUTING" | "PENDING_APPROVAL";
                limit?: string;
                offset?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutRunsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Settlement cutoff (orders paid before this count)
                     * @example 2025-03-15T23:59:59Z
                     */
                    cutoffAt: string;
                    /**
                     * @description MANUAL, AUTO_APPROVAL_REQUIRED, or AUTO_EXECUTE
                     * @enum {string}
                     */
                    mode: "AUTO_APPROVAL_REQUIRED" | "AUTO_EXECUTE" | "MANUAL";
                    /**
                     * @description Scheduled execution time
                     * @example 2025-03-22T00:00:00Z
                     */
                    scheduledFor: string;
                };
            };
        };
        responses: {
            /** @description Payout run created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No eligible campaigns */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutRunsController_retryPayout: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payoutId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description New payout created and executed; returns the new payout id */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Payout not failed or not in a run */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Payout not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutRunsController_preview: {
        parameters: {
            query?: {
                /** @description ISO date for settlement cutoff */
                cutoffAt?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Preview with line items and total */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutRunsController_approve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Run approved */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Run not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminPayoutRunsController_execute: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Execution started or completed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Run not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminManualPayoutsController_approveManualAdjustment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Payout ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Approver note */
                    approvalReason?: string;
                };
            };
        };
        responses: {
            /** @description Manual adjustment approved and executed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not a manual adjustment or wrong status */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Requester cannot approve own request */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Payout not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Product list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example prod-cat-1 */
                    categoryId: string;
                    /** @example Soft cotton t-shirt */
                    description?: string;
                    /** @example Classic Cotton Tee */
                    name: string;
                    /** @example 40 */
                    packageHeightMm?: number;
                    /** @example 320 */
                    packageLengthMm?: number;
                    /** @example 240 */
                    packageWidthMm?: number;
                    /** @example classic-cotton-tee */
                    slug?: string;
                    /**
                     * @default DRAFT
                     * @enum {string}
                     */
                    status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
                    /** @example 300 */
                    weightGrams?: number;
                };
            };
        };
        responses: {
            /** @description Product created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Product detail with views, layers, and images */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Product not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Product deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Product not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example prod-cat-1 */
                    categoryId?: string;
                    /** @example Soft cotton t-shirt */
                    description?: string;
                    /** @example Classic Cotton Tee */
                    name?: string;
                    /** @example 40 */
                    packageHeightMm?: number;
                    /** @example 320 */
                    packageLengthMm?: number;
                    /** @example 240 */
                    packageWidthMm?: number;
                    /** @example classic-cotton-tee */
                    slug?: string;
                    /** @enum {string} */
                    status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
                    /** @example 300 */
                    weightGrams?: number;
                };
            };
        };
        responses: {
            /** @description Product updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Product not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteImageRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                roleId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateImageRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                roleId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example product-view-id */
                    productViewId?: string;
                    /** @enum {string} */
                    role?: "GALLERY" | "THUMBNAIL" | "WORKSHOP_TEMPLATE";
                    /** @example 0 */
                    sortOrder?: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_createImage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Front view */
                    altText?: string;
                    /** @example 0 */
                    sortOrder?: number;
                    /**
                     * @description Source URL to import asynchronously
                     * @example https://cdn.example.com/img.png
                     */
                    sourceUrl: string;
                    /** @example variant-id */
                    variantId?: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_uploadImage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    altText?: string;
                    /** Format: binary */
                    file?: string;
                    sortOrder?: number;
                    variantId?: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteImage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                imageId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateImage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                imageId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Front view */
                    altText?: string;
                    /** @example media-asset-id */
                    mediaAssetId?: string;
                    /** @example 0 */
                    sortOrder?: number;
                    /** @example variant-id */
                    variantId?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_createImageRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                imageId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example product-view-id */
                    productViewId?: string;
                    /**
                     * @example THUMBNAIL
                     * @enum {string}
                     */
                    role: "GALLERY" | "THUMBNAIL" | "WORKSHOP_TEMPLATE";
                    /** @example 0 */
                    sortOrder?: number;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_listOptions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                productId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_createOption: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                productId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example size */
                    code: string;
                    /** @example Size */
                    name: string;
                    /** @example 0 */
                    sortOrder?: number;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteOption: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                /** @description Option ID */
                optionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateOption: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                /** @description Option ID */
                optionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example size */
                    code?: string;
                    /** @example Size */
                    name?: string;
                    /** @example 0 */
                    sortOrder?: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_createOptionValue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                /** @description Option ID */
                optionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Large */
                    displayName: string;
                    /**
                     * @example {
                     *       "hex": "#000000"
                     *     }
                     */
                    metadata?: Record<string, never>;
                    /** @example 0 */
                    sortOrder?: number;
                    /** @example L */
                    valueCode: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteOptionValue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                /** @description Option value ID */
                valueId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateOptionValue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                /** @description Option value ID */
                valueId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Large */
                    displayName?: string;
                    /**
                     * @example {
                     *       "hex": "#000000"
                     *     }
                     */
                    metadata?: Record<string, never>;
                    /** @example 0 */
                    sortOrder?: number;
                    /** @example L */
                    valueCode?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_upsertProductPrice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 15000 */
                    amount: number;
                    /** @example 20000 */
                    compareAt?: number;
                    /**
                     * @example NGN
                     * @enum {string}
                     */
                    currency: "NGN";
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteProductPrice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                priceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateProductPrice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                priceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 15000 */
                    amount?: number;
                    /** @example 20000 */
                    compareAt?: number;
                    /** @enum {string} */
                    currency?: "NGN";
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_listVariants: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                productId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Variants list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_removeVariant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Variant ID */
                variantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Variant deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Variant not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateVariant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Variant ID */
                variantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example true */
                    isAvailable?: boolean;
                    /** @example Small / Red */
                    name?: string;
                    /** @example 40 */
                    packageHeightMm?: number;
                    /** @example 320 */
                    packageLengthMm?: number;
                    /** @example 240 */
                    packageWidthMm?: number;
                    /** @example SKU-TEE-S-RED */
                    sku?: string;
                    /** @example 320 */
                    weightGrams?: number;
                };
            };
        };
        responses: {
            /** @description Variant updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Variant not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_upsertVariantPrice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                variantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 16000 */
                    amount: number;
                    /** @example 20000 */
                    compareAt?: number;
                    /**
                     * @example NGN
                     * @enum {string}
                     */
                    currency: "NGN";
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteVariantPrice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                priceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateVariantPrice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                priceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 16000 */
                    amount?: number;
                    /** @example 20000 */
                    compareAt?: number;
                    /** @enum {string} */
                    currency?: "NGN";
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_createView: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Front */
                    displayName: string;
                    /** @example false */
                    isDefault?: boolean;
                    /** @example true */
                    isDesignable?: boolean;
                    /** @example front */
                    key: string;
                    /** @example 0 */
                    sortOrder?: number;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteView: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                viewId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateView: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                viewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Front */
                    displayName?: string;
                    /** @example false */
                    isDefault?: boolean;
                    /** @example true */
                    isDesignable?: boolean;
                    /** @example front */
                    key?: string;
                    /** @example 0 */
                    sortOrder?: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_createEffect: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                viewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    effectType: "HIDE" | "REPLACE_IMAGE" | "SHOW" | "TINT";
                    /**
                     * @example {
                     *       "opacity": 0.8
                     *     }
                     */
                    meta?: Record<string, never>;
                    /** @example option-id */
                    optionId: string;
                    /** @example option-value-id */
                    optionValueId: string;
                    /** @example replacement-image-id */
                    replacementImageId?: string;
                    /** @example template-layer-id */
                    templateLayerId: string;
                    /** @example #00FF00 */
                    tintHex?: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteEffect: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                effectId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateEffect: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                effectId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    effectType?: "HIDE" | "REPLACE_IMAGE" | "SHOW" | "TINT";
                    /**
                     * @example {
                     *       "opacity": 0.8
                     *     }
                     */
                    meta?: Record<string, never>;
                    /** @example option-id */
                    optionId?: string;
                    /** @example option-value-id */
                    optionValueId?: string;
                    /** @example replacement-image-id */
                    replacementImageId?: string;
                    /** @example template-layer-id */
                    templateLayerId?: string;
                    /** @example #00FF00 */
                    tintHex?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_createLayer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                viewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    blendMode?: "DARKEN" | "LIGHTEN" | "MULTIPLY" | "NORMAL" | "OVERLAY" | "SCREEN";
                    /** @example Base layer */
                    displayName?: string;
                    /** @example image-id */
                    imageId: string;
                    /** @example base */
                    key: string;
                    /**
                     * @example BASE
                     * @enum {string}
                     */
                    layerType: "BASE" | "DETAIL" | "HIGHLIGHT" | "MASK_OVERLAY" | "OUTLINE" | "SHADOW";
                    /**
                     * @example {
                     *       "scale": 1
                     *     }
                     */
                    meta?: Record<string, never>;
                    /** @example 1 */
                    opacity?: number;
                    /** @example 0 */
                    zIndex?: number;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_deleteLayer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                layerId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updateLayer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                layerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    blendMode?: "DARKEN" | "LIGHTEN" | "MULTIPLY" | "NORMAL" | "OVERLAY" | "SCREEN";
                    /** @example Base layer */
                    displayName?: string;
                    /** @example image-id */
                    imageId?: string;
                    /** @example base */
                    key?: string;
                    /** @enum {string} */
                    layerType?: "BASE" | "DETAIL" | "HIGHLIGHT" | "MASK_OVERLAY" | "OUTLINE" | "SHADOW";
                    /**
                     * @example {
                     *       "scale": 1
                     *     }
                     */
                    meta?: Record<string, never>;
                    /** @example 1 */
                    opacity?: number;
                    /** @example 0 */
                    zIndex?: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_upsertPrintArea: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                viewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 0.5 */
                    height: number;
                    /** @example 6 */
                    maxColors?: number;
                    /** @example 5 */
                    maxLayers?: number;
                    /** @example false */
                    rotationAllowed?: boolean;
                    /** @example 0.6 */
                    width: number;
                    /** @example 0.1 */
                    x: number;
                    /** @example 0.2 */
                    y: number;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminProductsController_updatePrintArea: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                productId: string;
                viewId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 0.5 */
                    height?: number;
                    /** @example 6 */
                    maxColors?: number;
                    /** @example 5 */
                    maxLayers?: number;
                    /** @example false */
                    rotationAllowed?: boolean;
                    /** @example 0.6 */
                    width?: number;
                    /** @example 0.1 */
                    x?: number;
                    /** @example 0.2 */
                    y?: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_listFindings: {
        parameters: {
            query: {
                status: string;
                runId: string;
                severity: string;
                cursor: string;
                take: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_exportFindings: {
        parameters: {
            query: {
                status: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_getFinding: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_acknowledge: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_requestRepair: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_approveRepair: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_listRuns: {
        parameters: {
            query: {
                kind: string;
                status: string;
                cursor: string;
                take: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_triggerInternal: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_triggerProvider: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminReconciliationController_getRun: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShipmentsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Shipment ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shipment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Shipment not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShipmentsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Shipment ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Required with supersedesEventId — audit reason */
                    correctionReason?: string;
                    /** @description Customer-safe exception override (max 500) */
                    customerMessage?: string;
                    /** @enum {string} */
                    exceptionCode?: "ADDRESS_FAILURE" | "CUSTOMER_UNAVAILABLE" | "DAMAGED" | "LATE" | "LOST" | "OTHER";
                    /** @description Idempotency key unique per shipment for this transition */
                    idempotencyKey: string;
                    occurredAt?: string;
                    privateNotes?: string;
                    /** @enum {string} */
                    status: "CANCELLED" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY";
                    /** @description Required when correcting a prior mistaken event */
                    supersedesEventId?: string;
                    /** @description Required when status is DISPATCHED (and later non-cancel) */
                    trackingNumber?: string;
                    /** @description https URL on the interim allowlist */
                    trackingUrl?: string;
                };
            };
        };
        responses: {
            /** @description Shipment updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid transition or evidence */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Shipment not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Conflict (idempotency / tracking) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_deleteRate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Shipping rate ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rate deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rate not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_updateRate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Shipping rate ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default NGN
                     * @enum {string}
                     */
                    currency?: "NGN";
                    /** @description ISO date string */
                    effectiveFrom?: Record<string, never>;
                    /** @description ISO date string */
                    effectiveTo?: Record<string, never>;
                    /**
                     * @description Flat fee amount
                     * @example 1500
                     */
                    flatFee?: number;
                    isActive?: boolean;
                    /** @example 5 */
                    maxDeliveryDays?: Record<string, never>;
                    /** @example 2 */
                    minDeliveryDays?: Record<string, never>;
                    /**
                     * @default 100
                     * @example 100
                     */
                    priority?: number;
                    /** @enum {string} */
                    provider?: "INTERNAL";
                    /** @example STANDARD */
                    serviceLevel?: string;
                };
            };
        };
        responses: {
            /** @description Rate updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rate not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_deleteRule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Shipping rule ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rule deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rule not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_updateRule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Shipping rule ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description ISO 3166-1 alpha-2 country code
                     * @example NG
                     */
                    countryCode?: string;
                    isActive?: boolean;
                    /** @example LA */
                    matchContext?: Record<string, never>;
                    /** @enum {string} */
                    matchType?: "ADMIN1" | "ADMIN2" | "CITY" | "POSTAL_CODE" | "POSTAL_PREFIX";
                    /** @example LA */
                    matchValue?: string;
                    /** @example 100 */
                    priority?: number;
                };
            };
        };
        responses: {
            /** @description Rule updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rule not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_listZones: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of zones with legacy areas, generic rules, and rates */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_createZone: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default true */
                    isActive?: boolean;
                    /** @example Lagos */
                    name: string;
                };
            };
        };
        responses: {
            /** @description Zone created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_getZone: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zone with legacy areas, generic rules, and rates */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Zone not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_deleteZone: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zone deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Zone not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_updateZone: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    isActive?: boolean;
                    name?: string;
                };
            };
        };
        responses: {
            /** @description Zone updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Zone not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_listAreas: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                zoneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of legacy Nigeria areas */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_createArea: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                zoneId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description LGA ID for LGA-specific area; omit for state-wide */
                    lgaId?: Record<string, never>;
                    /**
                     * @description State code (e.g. LA for Lagos)
                     * @example LA
                     */
                    stateCode: string;
                };
            };
        };
        responses: {
            /** @description Area created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid state/LGA */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_listRates: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                zoneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of rates */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_createRate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                zoneId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default NGN
                     * @enum {string}
                     */
                    currency?: "NGN";
                    /** @description ISO date string */
                    effectiveFrom?: Record<string, never>;
                    /** @description ISO date string */
                    effectiveTo?: Record<string, never>;
                    /**
                     * @description Flat fee amount
                     * @example 1500
                     */
                    flatFee: number;
                    /** @default true */
                    isActive?: boolean;
                    /** @example 5 */
                    maxDeliveryDays?: Record<string, never>;
                    /** @example 2 */
                    minDeliveryDays?: Record<string, never>;
                    /**
                     * @default 100
                     * @example 100
                     */
                    priority?: number;
                    /** @enum {string} */
                    provider?: "INTERNAL";
                    /**
                     * @default STANDARD
                     * @example STANDARD
                     */
                    serviceLevel?: string;
                };
            };
        };
        responses: {
            /** @description Rate created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_listRules: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                zoneId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of shipping rules */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminShippingController_createRule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Zone ID */
                zoneId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description ISO 3166-1 alpha-2 country code
                     * @example NG
                     */
                    countryCode: string;
                    /** @default true */
                    isActive?: boolean;
                    /**
                     * @description Optional context to disambiguate the rule, such as the parent ADMIN1 code for ADMIN2.
                     * @example LA
                     */
                    matchContext?: Record<string, never>;
                    /** @enum {string} */
                    matchType: "ADMIN1" | "ADMIN2" | "CITY" | "POSTAL_CODE" | "POSTAL_PREFIX";
                    /**
                     * @description Canonical match value. For Nigeria ADMIN1 use state code; for ADMIN2 use LGA id or name.
                     * @example LA
                     */
                    matchValue: string;
                    /**
                     * @default 100
                     * @example 100
                     */
                    priority?: number;
                };
            };
        };
        responses: {
            /** @description Rule created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid rule input */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminSiteSettingsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Site settings */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminSiteSettingsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Auto-retry failed Paystack transfers
                     * @default true
                     */
                    autoRetryFailedPayouts?: boolean;
                    /** @enum {string} */
                    currency?: "NGN";
                    /**
                     * @description Minimum payout amount in NGN
                     * @example 1000
                     */
                    minimumPayoutAmount?: number;
                    /**
                     * @description Payout cadence in days (e.g. 7 = weekly)
                     * @example 7
                     */
                    payoutCadenceDays?: number;
                    /**
                     * @description Fundraiser payout mode: MANUAL, AUTO_APPROVAL_REQUIRED, AUTO_EXECUTE. AUTO_EXECUTE requires PAYOUT_AUTO_EXECUTE_ENABLED=true (TTW-042).
                     * @enum {string}
                     */
                    payoutMode?: "AUTO_APPROVAL_REQUIRED" | "AUTO_EXECUTE" | "MANUAL";
                    /**
                     * @description Settlement hold days before payout eligibility
                     * @example 7
                     */
                    payoutSettlementHoldDays?: number;
                    /** @default true */
                    pricesIncludeVat?: boolean;
                    /** @default true */
                    vatAppliesToShipping?: boolean;
                    /**
                     * @description VAT rate (e.g. 0.075 for 7.5%)
                     * @example 0.075
                     */
                    vatRate?: number;
                };
            };
        };
        responses: {
            /** @description Updated site settings */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminUsersController_search: {
        parameters: {
            query?: {
                /** @description Email or name substring */
                q?: string;
                /** @description Max rows (1–100) */
                take?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Matching users */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminUsersController_resetMfa: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Target ADMIN user id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description MFA reset */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example true */
                        reset?: boolean;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description User not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminUsersController_updateRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description User id */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Required when promoting CUSTOMER → ORGANIZER (creates equivalent APPROVED application). */
                    reason?: string;
                    /** @enum {string} */
                    role: "ADMIN" | "CUSTOMER" | "ORGANIZER";
                };
            };
        };
        responses: {
            /** @description Updated user */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad request (e.g. last admin) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description User not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_adminLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example user@example.com */
                    email: string;
                    /** @example password123 */
                    password: string;
                };
            };
        };
        responses: {
            /** @description Password accepted; MFA enrollment or challenge required before session cookies */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        mfa?: {
                            /** @enum {string} */
                            status?: "CHALLENGE_REQUIRED" | "ENROLLMENT_REQUIRED";
                        };
                        /** @description Short-lived JWT (5m); not a session */
                        mfa_token?: string;
                    };
                };
            };
            /** @description Invalid credentials, or role not permitted on this surface */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_adminMfaChallenge: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Short-lived MFA challenge JWT from POST /auth/admin/login (not a session) */
                    mfa_token: string;
                    /**
                     * @description 6-digit TOTP code from the authenticator app
                     * @example 123456
                     */
                    totp: string;
                };
            };
        };
        responses: {
            /** @description Admin session cookies set */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests. */
                        csrf_token?: string;
                        user?: {
                            email?: string;
                            firstName?: string | null;
                            id?: string;
                            lastName?: string | null;
                            phone?: string | null;
                            /** @enum {string} */
                            role?: "ADMIN";
                            /** @example ACTIVE */
                            status?: string;
                        };
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_adminMfaEnrollConfirm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Short-lived MFA challenge JWT from POST /auth/admin/login (not a session) */
                    mfa_token: string;
                    /**
                     * @description 6-digit TOTP code from the authenticator app
                     * @example 123456
                     */
                    totp: string;
                };
            };
        };
        responses: {
            /** @description MFA enabled; admin session cookies set */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests. */
                        csrf_token?: string;
                        user?: {
                            email?: string;
                            firstName?: string | null;
                            id?: string;
                            lastName?: string | null;
                            phone?: string | null;
                            /** @enum {string} */
                            role?: "ADMIN";
                            /** @example ACTIVE */
                            status?: string;
                        };
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_adminMfaEnrollStart: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Short-lived MFA challenge JWT from POST /auth/admin/login (not a session) */
                    mfa_token: string;
                };
            };
        };
        responses: {
            /** @description Pending TOTP secret + recovery codes (plaintext once) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        otpauth_uri?: string;
                        recovery_codes?: string[];
                        secret?: string;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_adminMfaRecover: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Short-lived MFA challenge JWT from POST /auth/admin/login (not a session) */
                    mfa_token: string;
                    /**
                     * @description Single-use recovery code (XXXX-XXXX)
                     * @example A1B2-C3D4
                     */
                    recovery_code: string;
                };
            };
        };
        responses: {
            /** @description Recovery code consumed; admin session cookies set */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests. */
                        csrf_token?: string;
                        user?: {
                            email?: string;
                            firstName?: string | null;
                            id?: string;
                            lastName?: string | null;
                            phone?: string | null;
                            /** @enum {string} */
                            role?: "ADMIN";
                            /** @example ACTIVE */
                            status?: string;
                        };
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_changePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Current password */
                    currentPassword: string;
                    /** @example NewPassword123! */
                    newPassword: string;
                };
            };
        };
        responses: {
            /** @description Password changed successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example Password has been changed successfully */
                        message?: string;
                    };
                };
            };
            /** @description Current password incorrect */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_forgotPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example user@example.com */
                    email: string;
                };
            };
        };
        responses: {
            /** @description If account exists, reset email sent */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example If an account exists with this email, a password reset link has been sent */
                        message?: string;
                    };
                };
            };
        };
    };
    GoogleOAuthController_googleStart: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    GoogleOAuthController_googleCallback: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example user@example.com */
                    email: string;
                    /** @example password123 */
                    password: string;
                };
            };
        };
        responses: {
            /** @description Successfully authenticated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests. */
                        csrf_token?: string;
                        user?: {
                            email?: string;
                            firstName?: string | null;
                            id?: string;
                            lastName?: string | null;
                            phone?: string | null;
                            /** @enum {string} */
                            role?: "ADMIN" | "CUSTOMER" | "ORGANIZER";
                            /** @example ACTIVE */
                            status?: string;
                        };
                    };
                };
            };
            /** @description Invalid credentials, or role not permitted on this surface */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successfully logged out */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example Logged out successfully */
                        message?: string;
                    };
                };
            };
            /** @description Session surface could not be resolved for the presented cookies */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing/invalid CSRF token or disallowed Origin */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current user information */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests. Absent for bearer-only callers, which hold no cookie session. */
                        csrf_token?: string;
                        email?: string;
                        /** @description True when the account email is verified (TTW-023). Used by web checkout gates. */
                        emailVerified?: boolean;
                        firstName?: string | null;
                        id?: string;
                        lastName?: string | null;
                        phone?: string | null;
                        /** @enum {string} */
                        role?: "ADMIN" | "CUSTOMER" | "ORGANIZER";
                        /** @description Live AuthSession id bound to this access JWT */
                        sessionId?: string;
                        /** @example ACTIVE */
                        status?: string;
                        /** @enum {string} */
                        surface?: "ADMIN" | "CUSTOMER";
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description New access and refresh tokens issued */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests. */
                        csrf_token?: string;
                        user?: {
                            email?: string;
                            firstName?: string | null;
                            id?: string;
                            lastName?: string | null;
                            phone?: string | null;
                            /** @enum {string} */
                            role?: "ADMIN" | "CUSTOMER" | "ORGANIZER";
                            /** @example ACTIVE */
                            status?: string;
                        };
                    };
                };
            };
            /** @description Invalid or expired refresh token */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing/invalid CSRF token or disallowed Origin */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example user@example.com */
                    email: string;
                    /** @example John */
                    firstName: string;
                    /** @example Doe */
                    lastName: string;
                    /** @example password123 */
                    password: string;
                    /** @example +2348012345678 */
                    phone?: string;
                };
            };
        };
        responses: {
            /** @description User successfully registered */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests. */
                        csrf_token?: string;
                        user?: {
                            /** Format: date-time */
                            createdAt?: string;
                            email?: string;
                            firstName?: string | null;
                            id?: string;
                            lastName?: string | null;
                            phone?: string | null;
                            /** @enum {string} */
                            role?: "ADMIN" | "CUSTOMER" | "ORGANIZER";
                            /** @example ACTIVE */
                            status?: string;
                            /** Format: date-time */
                            updatedAt?: string;
                        };
                    };
                };
            };
            /** @description Invalid input data */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Email already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_resendVerification: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example user@example.com */
                    email: string;
                };
            };
        };
        responses: {
            /** @description If account exists, verification email sent */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example If an account exists with this email, a verification link has been sent */
                        message?: string;
                    };
                };
            };
        };
    };
    AuthController_resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example NewPassword123! */
                    newPassword: string;
                    /** @description Token from password reset email link */
                    token: string;
                };
            };
        };
        responses: {
            /** @description Password reset successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example Password has been reset successfully */
                        message?: string;
                    };
                };
            };
            /** @description Invalid or expired token */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_listSessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Active sessions (metadata only) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        authSurface?: "ADMIN" | "CUSTOMER";
                        /** Format: date-time */
                        createdAt?: string;
                        /** @description True when this row is the session for the present access JWT */
                        current?: boolean;
                        deviceLabel?: string | null;
                        /** Format: date-time */
                        expiresAt?: string;
                        id?: string;
                        /** Format: date-time */
                        lastSeenAt?: string;
                    }[];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_revokeAllSessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description All sessions revoked */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example All sessions revoked */
                        message?: string;
                        revoked?: number;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_revokeSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description AuthSession id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session revoked */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example Session revoked */
                        message?: string;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Session not found for this user */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_verifyEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Email verification token
                     * @example clx...
                     */
                    token: string;
                };
            };
        };
        responses: {
            /** @description Email verified successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example Email verified successfully */
                        message?: string;
                    };
                };
            };
            /** @description Invalid or expired token */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    BanksController_listBanks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of banks with code and name */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    BanksController_resolveAccount: {
        parameters: {
            query: {
                accountNumber: string;
                bankCode: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Resolved account name */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Account not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of campaigns */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Raising funds for our school */
                    description?: string;
                    /** @example 2025-02-28T23:59:59Z */
                    endDate?: string;
                    /** @example 500000 */
                    goalAmount?: number;
                    /** @example school-fundraiser-2025 */
                    slug?: string;
                    /** @example 2025-02-01T00:00:00Z */
                    startDate?: string;
                    /** @example Our story... */
                    story?: string;
                    /** @example School Fundraiser 2025 */
                    title: string;
                };
            };
        };
        responses: {
            /** @description Campaign created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden: ORGANIZER or ADMIN only */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Slug already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Owner campaign detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Raising funds for our school */
                    description?: Record<string, never>;
                    /** @example 2025-02-28T23:59:59Z */
                    endDate?: Record<string, never> | null;
                    /**
                     * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
                     * @example 1
                     */
                    expectedRevision: number;
                    /**
                     * @description Goal in NGN major units; omit or null to clear
                     * @example 500000
                     */
                    goalAmount?: Record<string, never> | null;
                    /** @example school-fundraiser-2025 */
                    slug?: string;
                    /** @example 2025-02-01T00:00:00Z */
                    startDate?: Record<string, never> | null;
                    /** @example Our story... */
                    story?: Record<string, never>;
                    /** @example School Fundraiser 2025 */
                    title?: string;
                };
            };
        };
        responses: {
            /** @description Campaign updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input / not DRAFT */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Stale revision (CAMPAIGN_STALE_REVISION) or slug taken */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_addOffer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example design-1 */
                    designId: string;
                    /**
                     * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
                     * @example 1
                     */
                    expectedRevision: number;
                    /**
                     * @description Selling price in NGN major units (≥ current server floor)
                     * @example 15000
                     */
                    price: number;
                    /** @example prod-1 */
                    productId: string;
                };
            };
        };
        responses: {
            /** @description Offer added; returns owner detail */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation / floor / ownership failure */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Stale revision or duplicate offer */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_removeOffer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
                /** @description Campaign product (offer) ID */
                offerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
                     * @example 1
                     */
                    expectedRevision: number;
                };
            };
        };
        responses: {
            /** @description Offer removed; returns owner detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Offer not found / not DRAFT */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Stale revision */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_updateOffer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
                /** @description Campaign product (offer) ID */
                offerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example design-2 */
                    designId?: string;
                    /**
                     * @description Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION
                     * @example 1
                     */
                    expectedRevision: number;
                    /**
                     * @description Selling price in NGN major units (≥ current server floor)
                     * @example 16000
                     */
                    price?: number;
                };
            };
        };
        responses: {
            /** @description Offer updated; returns owner detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation failure */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Stale revision or duplicate offer */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_getCampaignOrders: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of orders (redacted) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_createCampaignOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    idempotencyKey?: string;
                    items: {
                        /** @example campaign-1 */
                        campaignId?: string;
                        /** @example design-1 */
                        designId?: string;
                        /** @example 2 */
                        quantity: number;
                        /** @example var-1 */
                        variantId: string;
                    }[];
                    /** @example addr-1 */
                    shippingAddressId: string;
                };
            };
        };
        responses: {
            /** @description Order created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input or insufficient stock */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden — EMAIL_NOT_VERIFIED when the account must verify before ordering */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_quoteCampaignOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    items: {
                        /** @example campaign-1 */
                        campaignId?: string;
                        /** @example design-1 */
                        designId?: string;
                        /** @example 2 */
                        quantity: number;
                        /** @example var-1 */
                        variantId: string;
                    }[];
                    /**
                     * @description Address ID for shipping zone lookup
                     * @example addr-1
                     */
                    shippingAddressId: string;
                };
            };
        };
        responses: {
            /** @description Quote with line items, shipping, VAT, and total */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input or address */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_preview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Draft preview payload */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_priceGuidance: {
        parameters: {
            query: {
                productId: string;
                designId: string;
            };
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Currency + minimumPrice + guidance */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid product/design */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_addProduct: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example design-1 */
                    designId?: string;
                    /**
                     * @description Campaign selling price (NGN)
                     * @example 15000
                     */
                    price?: number;
                    /** @example prod-1 */
                    productId: string;
                };
            };
        };
        responses: {
            /** @description Product added */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CampaignsController_submitForReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Campaign submitted for review or auto-rejected */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not in DRAFT status, or readiness blockers (stable CAMPAIGN_READINESS_* codes) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CategoriesController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of categories */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        createdAt?: string;
                        description?: string | null;
                        id?: string;
                        name?: string;
                        slug?: string;
                        /** Format: date-time */
                        updatedAt?: string;
                    }[];
                };
            };
        };
    };
    CategoriesController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Category ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Category with products */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        createdAt?: string;
                        description?: string | null;
                        id?: string;
                        name?: string;
                        products?: {
                            id?: string;
                            name?: string;
                            slug?: string;
                            status?: string;
                        }[];
                        slug?: string;
                        /** Format: date-time */
                        updatedAt?: string;
                    };
                };
            };
            /** @description Category not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignAssetsController_upload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file?: string;
                };
            };
        };
        responses: {
            /** @description Asset upload initiated */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        designAssetId?: string;
                        originalUrl?: string | null;
                        /** @example processing */
                        status?: string;
                    };
                };
            };
            /** @description Missing or unsupported file */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of designs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Structured design data (version, views, layers per view)
                     * @example {
                     *       "productId": "prod-1",
                     *       "version": 1,
                     *       "views": {}
                     *     }
                     */
                    designData: Record<string, never>;
                    /** @example My Tee Design */
                    name: string;
                    /** @example prod-1 */
                    productId: string;
                    /** @example https://cdn.example.com/thumb.png */
                    thumbnailUrl?: string;
                };
            };
        };
        responses: {
            /** @description Design created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input or product not found */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Design */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Design deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Structured design data (version, views, layers per view) */
                    designData?: Record<string, never>;
                    /** @example My Tee Design */
                    name?: string;
                    /** @example https://cdn.example.com/thumb.png */
                    thumbnailUrl?: string;
                };
            };
        };
        responses: {
            /** @description Design updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_duplicate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Duplicated design */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_share: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default 7
                     * @enum {number}
                     */
                    ttlDays?: 1 | 30 | 7;
                };
            };
        };
        responses: {
            /** @description Share link created (plaintext token returned once) */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Disallowed TTL or moderation state */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_listShareLinks: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_revokeShareLink: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                linkId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    DesignsController_uploadThumbnail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Design ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    thumbnail?: string;
                };
            };
        };
        responses: {
            /** @description Thumbnail uploaded */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        thumbnailUrl?: string;
                    };
                };
            };
            /** @description Invalid file or missing */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AppController_getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AppController_getLive: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AppController_getReady: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    InventoryController_getByVariantId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product variant ID */
                variantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Variant inventory (stock, reserved, lowStockThreshold) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        inventory?: {
                            lowStockThreshold?: number;
                            reserved?: number;
                            stockOnHand?: number;
                            trackInventory?: boolean;
                        };
                        isAvailable?: boolean;
                        product?: {
                            id?: string;
                            name?: string;
                            slug?: string;
                        };
                        sku?: string;
                        variantId?: string;
                        variantName?: string;
                    };
                };
            };
            /** @description Variant not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ModerationAppealsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Appeals for the current user */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ModerationAppealsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Moderation decision id to appeal */
                    decisionId: string;
                    /** @description Owner statement (no binary evidence in slice 1) */
                    statement: string;
                };
            };
        };
        responses: {
            /** @description Appeal created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not eligible / window expired */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Active appeal already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ModerationAppealsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Appeal ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Appeal detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ModerationAppealsController_withdraw: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Appeal ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Appeal withdrawn */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationUnsubscribeController_unsubscribe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Signed unsubscribe token from email footer (HMAC, scoped, expiring). */
                    token: string;
                };
            };
        };
        responses: {
            /** @description Unsubscribe applied */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid or expired token */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrdersController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of orders */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrdersController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    idempotencyKey?: string;
                    items: {
                        /** @example campaign-1 */
                        campaignId?: string;
                        /** @example design-1 */
                        designId?: string;
                        /** @example 2 */
                        quantity: number;
                        /** @example var-1 */
                        variantId: string;
                    }[];
                    /** @example addr-1 */
                    shippingAddressId: string;
                };
            };
        };
        responses: {
            /** @description Order created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input or insufficient stock */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden — EMAIL_NOT_VERIFIED when the account must verify before ordering */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrdersController_quote: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    items: {
                        /** @example campaign-1 */
                        campaignId?: string;
                        /** @example design-1 */
                        designId?: string;
                        /** @example 2 */
                        quantity: number;
                        /** @example var-1 */
                        variantId: string;
                    }[];
                    /**
                     * @description Address ID for shipping zone lookup
                     * @example addr-1
                     */
                    shippingAddressId: string;
                };
            };
        };
        responses: {
            /** @description Quote with line items, shipping, VAT, and total */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid input or address */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrdersController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Order ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Customer-safe order detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        campaign?: {
                            /** @example camp-1 */
                            id: string;
                            /** @example school-fundraiser */
                            slug: string;
                            /** @example School Fundraiser */
                            title: string;
                        } | null;
                        /** @description Campaign id when this is a fundraiser order */
                        campaignId?: Record<string, never> | null;
                        cancelledAt?: Record<string, never> | null;
                        createdAt: string;
                        /** @enum {string} */
                        currency: "NGN";
                        /** @example 0 */
                        discountAmount: number;
                        expiresAt?: Record<string, never> | null;
                        /** @example order-1 */
                        id: string;
                        items: {
                            /** @example camp-1 */
                            campaignId?: Record<string, never> | null;
                            /** @example design-1 */
                            designId?: Record<string, never> | null;
                            /** @example oi-1 */
                            id: string;
                            /** @description True when snapshotSource is BACKFILLED_CURRENT_CATALOG — display may not match what the buyer originally saw. */
                            legacySnapshotDisclosure?: boolean;
                            /** @example 10000 */
                            lineTotal: number;
                            optionPresentationSnapshot?: {
                                /** @example Size */
                                option: string;
                                /** @example size */
                                optionCode: string;
                                /** @example Large */
                                value: string;
                                /** @example L */
                                valueCode: string;
                            }[] | null;
                            /** @example prod-1 */
                            productId: string;
                            /** @example Classic Tee */
                            productNameSnapshot: string;
                            /** @example 2 */
                            quantity: number;
                            /** @enum {string} */
                            snapshotSource: "BACKFILLED_CURRENT_CATALOG" | "PURCHASE";
                            /** @example 1 */
                            snapshotVersion: number;
                            /**
                             * @description Unit price charged (major units)
                             * @example 5000
                             */
                            unitFinalPrice: number;
                            /** @example Small / Red (SKU-1) */
                            variantDisplaySnapshot: string;
                            /** @example var-1 */
                            variantId: string;
                        }[];
                        /** @description Order-level Paystack reference when set */
                        paymentReference?: Record<string, never> | null;
                        /** @description True when the server allows starting or continuing payment for this owned order */
                        paymentRetryEligible: boolean;
                        /** @enum {string} */
                        paymentStatus: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                        payments: {
                            /** @example 12500 */
                            amount: number;
                            createdAt: string;
                            /** @enum {string} */
                            currency: "NGN";
                            expiresAt?: Record<string, never> | null;
                            /** @example pay-1 */
                            id: string;
                            /** @description Public-facing provider reference when present */
                            providerRef?: Record<string, never> | null;
                            /** @enum {string} */
                            status: "FAILED" | "INITIATED" | "PENDING" | "SUCCEEDED";
                        }[];
                        /**
                         * @description Interim policy / response contract version
                         * @example customer-order-detail/v1-interim-2026-08-21
                         */
                        policyVersion: string;
                        /**
                         * @description Sum of SUCCEEDED refund amounts (major units)
                         * @example 0
                         */
                        refundedAmountConfirmed: number;
                        refunds: {
                            /** @example 2500 */
                            amount: number;
                            createdAt: string;
                            /** @enum {string} */
                            currency: "NGN";
                            /** @example ref-1 */
                            id: string;
                            reason?: Record<string, never> | null;
                            /** @enum {string} */
                            status: "FAILED" | "INITIATED" | "NEEDS_ATTENTION" | "PROCESSING" | "SUCCEEDED";
                        }[];
                        /** @description Server-authoritative cancel/refund/return eligibility (TTW-041). Clients must not invent eligibility. */
                        resolution: Record<string, never>;
                        /** @description Customer-safe shipment summary + timeline when an active outbound shipment exists (TTW-040) */
                        shipment?: {
                            /** @example Manual dispatch */
                            carrierName: string;
                            estimatedDeliveryAt?: Record<string, never> | null;
                            events: {
                                customerMessage?: Record<string, never> | null;
                                exceptionCode?: Record<string, never> | null;
                                /** @example evt-1 */
                                id: string;
                                occurredAt: string;
                                /** @enum {string} */
                                type: "CANCELLED" | "CORRECTION" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "READY";
                            }[];
                            exceptionCode?: Record<string, never> | null;
                            exceptionMessage?: Record<string, never> | null;
                            /** @example ship-1 */
                            id: string;
                            /** @example shipment-lifecycle/v1-interim-2026-08-21 */
                            policyVersion: string;
                            /** @enum {string} */
                            status: "CANCELLED" | "DELIVERED" | "DISPATCHED" | "EXCEPTION" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "READY";
                            /** @description Present only after dispatch */
                            trackingNumber?: Record<string, never> | null;
                            trackingUrl?: Record<string, never> | null;
                        } | null;
                        /**
                         * @description Honest absent-state copy when no shipment exists; null when shipment is present
                         * @example Shipping updates will appear here when available.
                         */
                        shipmentPlaceholder?: Record<string, never> | null;
                        shipping: {
                            city: string;
                            /** @example Nigeria */
                            country: string;
                            landmark?: Record<string, never> | null;
                            line1: string;
                            line2?: Record<string, never> | null;
                            phone?: Record<string, never> | null;
                            postalCode?: Record<string, never> | null;
                            recipientName?: Record<string, never> | null;
                            state: string;
                        };
                        /** @example 2500 */
                        shippingFee: number;
                        /** @enum {string} */
                        status: "CANCELLED" | "DELIVERED" | "DRAFT" | "FULFILLED" | "PAID" | "PARTIALLY_REFUNDED" | "PENDING_PAYMENT" | "PROCESSING" | "REFUNDED";
                        /** @example 10000 */
                        subtotalAmount: number;
                        /** @example 12500 */
                        totalAmount: number;
                        updatedAt: string;
                        /** @example 750 */
                        vatAmount?: Record<string, never> | null;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrdersController_initiatePayment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Order ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Customer email for Paystack (defaults to user email if omitted)
                     * @example customer@example.com
                     */
                    customerEmail?: string;
                };
            };
        };
        responses: {
            /** @description Authorization URL and reference. Retries of an active attempt return the same session. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description Paystack access_code for the same checkout session
                         * @example access_xxx
                         */
                        accessCode: string;
                        /**
                         * @description created = new provider session after reserve; reused = returned an existing INITIATED session; reconciled = recovered a lost PENDING response via same-ref initialize
                         * @enum {string}
                         */
                        attemptOutcome: "created" | "reconciled" | "reused";
                        /**
                         * @description Paystack authorization URL for redirect checkout
                         * @example https://checkout.paystack.com/xxx
                         */
                        authorizationUrl: string;
                        /**
                         * @description Stable payment attempt / Paystack transaction reference
                         * @example ord-clxyz-ab12cd
                         */
                        reference: string;
                    };
                };
            };
            /** @description Invalid order or payment config */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Active attempt is reserved but not yet ready; retry to attach to the same attempt */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizerApplicationsController_submit: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    intendedUse: string;
                    organisationName: string;
                    /** @description ISO timestamp when the applicant accepted terms */
                    termsAcceptedAt: string;
                    /** @example organiser-terms/v1-interim-2026-08-21 */
                    termsVersion: string;
                };
            };
        };
        responses: {
            /** @description Application created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not eligible / terms mismatch */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Pending application already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizerApplicationsController_getEligibility: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Eligibility and latest application */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizerApplicationsController_getStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Latest application status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizerApplicationsController_withdraw: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Application id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Application withdrawn */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Pending application not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PayoutProfilesController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of payout profiles */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PayoutProfilesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example Account Name */
                    accountName: string;
                    /** @example 0123456789 */
                    accountNumber: string;
                    /**
                     * @description Nigerian bank code. Slice 1 stub resolution may auto-verify; live mode leaves PENDING_VERIFICATION (TTW-042).
                     * @example 058
                     */
                    bankCode: string;
                    /** @example GTBank */
                    bankName?: string;
                    /** @example Personal */
                    label: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden — EMAIL_NOT_VERIFIED when the account must verify before managing payout details */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PayoutProfilesController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PayoutProfilesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden — EMAIL_NOT_VERIFIED when the account must verify before managing payout details */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PayoutProfilesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    accountName?: string;
                    accountNumber?: string;
                    /** @description Changing bank identity clears recipient codes, bumps destinationVersion, and requires re-verification (TTW-042). Existing payout snapshots are unaffected. */
                    bankCode?: string;
                    bankName?: string;
                    isDefault?: boolean;
                    label?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden — EMAIL_NOT_VERIFIED when the account must verify before managing payout details */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PrivacyController_requestErasure: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                };
            };
        };
        responses: {
            /** @description Erasure request result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description PRIVACY_OPEN_OBLIGATIONS when commerce obligations remain */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PrivacyController_requestExport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                };
            };
        };
        responses: {
            /** @description Export request completed; download within TTL */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Re-authentication failed */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PrivacyController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Privacy requests for the current user */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PrivacyController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Privacy request detail */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PrivacyController_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PrivacyController_downloadExport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                };
            };
        };
        responses: {
            /** @description Export JSON payload */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Export expired */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProductsController_findAll: {
        parameters: {
            query?: {
                /** @description Filter by category ID */
                categoryId?: string;
                /** @description Filter by category slug (ignored if categoryId is set) */
                categorySlug?: string;
                /** @description Only products that have at least one available variant */
                available?: boolean;
                /** @description Full-text search in product name and description (PostgreSQL FTS; multi-word matches any word) */
                search?: string;
                /** @description Sort order for the list */
                sort?: "name_asc" | "name_desc" | "newest" | "oldest";
                /** @description Minimum product base price (NGN) */
                minPrice?: number;
                /** @description Maximum product base price (NGN) */
                maxPrice?: number;
                /** @description Only products that have a compare-at price (on sale) */
                onSale?: boolean;
                /** @description Number of products to return */
                limit?: number;
                /** @description Number of products to skip (for pagination) */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of products with category, prices (NGN), and thumbnail (no variants) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        category?: {
                            id?: string;
                            name?: string;
                            slug?: string;
                        };
                        description?: string | null;
                        id?: string;
                        name?: string;
                        prices?: {
                            amount?: number;
                            compareAt?: number | null;
                            currency?: string;
                        }[];
                        /** @description At most one thumbnail */
                        productImageRoles?: {
                            image?: {
                                altText?: string | null;
                                id?: string;
                                url?: string;
                            };
                        }[];
                        slug?: string;
                        status?: string;
                    }[];
                };
            };
        };
    };
    ProductsController_findOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Product with variants and prices */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        category?: Record<string, never>;
                        description?: string | null;
                        id?: string;
                        name?: string;
                        prices?: unknown[];
                        slug?: string;
                        status?: string;
                        variants?: {
                            availableQuantity?: number | null;
                            id?: string;
                            inStock?: boolean;
                            isAvailable?: boolean;
                            name?: string;
                            optionValues?: unknown[];
                            prices?: unknown[];
                            resolvedCompareAt?: number | null;
                            resolvedCurrency?: string;
                            resolvedPrice?: number | null;
                            sku?: string;
                        }[];
                    };
                };
            };
            /** @description Product not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProductsController_getWorkshop: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Product ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Workshop context: product metadata, options, views with print areas, template layers, and effects */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        product?: {
                            id?: string;
                            name?: string;
                            options?: unknown[];
                            slug?: string;
                        };
                        views?: {
                            displayName?: string;
                            effects?: unknown[];
                            id?: string;
                            isDefault?: boolean;
                            isDesignable?: boolean;
                            key?: string;
                            printArea?: Record<string, never> | null;
                            sortOrder?: number;
                            templateLayers?: unknown[];
                        }[];
                    };
                };
            };
            /** @description Product not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PublicDesignsController_findByShareToken: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description High-entropy design share bearer token */
                shareToken: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shared design (read-only allowlist) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Shared design not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PublicFundraisersController_listIndexable: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Indexable fundraiser slugs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** @example school-fundraiser */
                            slug: string;
                            /** @example 2026-08-22T12:00:00.000Z */
                            updatedAt: string;
                        }[];
                    };
                };
            };
        };
    };
    PublicFundraisersController_getBySlug: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Campaign slug */
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Campaign with sellable offers and performance snapshot */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example NGN */
                        currency: string;
                        /** @example 120000 */
                        currentAmount: number;
                        description?: Record<string, never> | null;
                        /** Format: date-time */
                        endDate?: string | null;
                        goalAmount?: Record<string, never> | null;
                        /** @example camp-1 */
                        id: string;
                        /**
                         * @description Versioned offer/disclosure policy identifier
                         * @example public-campaign-offer/v1-interim-2026-08-21
                         */
                        offerPolicyVersion: string;
                        organizer?: {
                            firstName?: Record<string, never> | null;
                            lastName?: Record<string, never> | null;
                        } | null;
                        performance: {
                            /** @example NGN */
                            currency: string;
                            /** @example 120000 */
                            currentAmount: number;
                            /** @example 500000 */
                            goalAmount?: Record<string, never> | null;
                        };
                        /** @description Sellable campaign product offers only */
                        products: {
                            /**
                             * @description Campaign base price in integer minor units (before upcharges)
                             * @example 500000
                             */
                            baseAmountMinor: number;
                            /** @example cp-1 */
                            campaignProductId: string;
                            /** @example NGN */
                            currency: string;
                            design: {
                                /** @example design-1 */
                                id: string;
                                /** @example School crest */
                                name: string;
                                thumbnailUrl?: Record<string, never> | null;
                            };
                            options: {
                                /** @example color */
                                code: string;
                                /** @example opt-1 */
                                id: string;
                                /** @example Color */
                                name: string;
                                /** @example 0 */
                                sortOrder: number;
                                values: {
                                    /** @example Black */
                                    displayName: string;
                                    /** @example ov-1 */
                                    id: string;
                                    /** @description Safe display metadata only (e.g. { hex: "#000000" }) */
                                    metadata?: Record<string, never> | null;
                                    /** @example 0 */
                                    sortOrder: number;
                                    /** @example BLACK */
                                    valueCode: string;
                                }[];
                            }[];
                            /**
                             * @description before discounts, shipping and VAT
                             * @example before discounts, shipping and VAT
                             */
                            priceDisclosure: string;
                            product: {
                                description?: Record<string, never> | null;
                                /** @example prod-1 */
                                id: string;
                                /** @example Classic Tee */
                                name: string;
                                /** @example classic-tee */
                                slug: string;
                            };
                            /** @example prod-1 */
                            productId: string;
                            variants: {
                                /** @description Whether the variant is currently selectable. Never includes exact stock counts. */
                                available: boolean;
                                /** @example NGN */
                                currency: string;
                                /** @example var-1 */
                                id: string;
                                /**
                                 * @description Value codes aligned with optionValueIds
                                 * @example [
                                 *       "BLACK",
                                 *       "L"
                                 *     ]
                                 */
                                optionValueCodes: string[];
                                /**
                                 * @description ProductOptionValue ids that define this variant
                                 * @example [
                                 *       "ov-1",
                                 *       "ov-2"
                                 *     ]
                                 */
                                optionValueIds: string[];
                                /**
                                 * @description Display unit price in integer minor units (campaign base + option upcharges)
                                 * @example 550000
                                 */
                                unitAmountMinor: number;
                            }[];
                        }[];
                        /** @example school-fundraiser */
                        slug: string;
                        /** Format: date-time */
                        startDate?: string | null;
                        /** @example ACTIVE */
                        status: string;
                        story?: Record<string, never> | null;
                        /** @example School Fundraiser */
                        title: string;
                    };
                };
            };
            /** @description Campaign not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AddressesController_findAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of addresses retrieved successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        addressLine1?: string;
                        addressLine2?: string | null;
                        administrativeAreaLevel1?: string | null;
                        administrativeAreaLevel2?: string | null;
                        city?: string;
                        country?: string;
                        countryCode?: string;
                        /** Format: date-time */
                        createdAt?: string;
                        dependentLocality?: string | null;
                        formattedAddress?: string | null;
                        googlePlaceId?: string | null;
                        id?: string;
                        instructions?: string | null;
                        isDefault?: boolean;
                        landmark?: string | null;
                        latitude?: number | null;
                        lgaId?: string | null;
                        locality?: string | null;
                        longitude?: number | null;
                        phone?: string | null;
                        postalCode?: string | null;
                        provider?: string;
                        recipientName?: string | null;
                        state?: string;
                        stateCode?: string | null;
                        /** Format: date-time */
                        updatedAt?: string;
                        userId?: string;
                    }[];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AddressesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 123 Main Street */
                    addressLine1: string;
                    /** @example Apt 4B */
                    addressLine2?: string;
                    /** @example Lagos */
                    administrativeAreaLevel1?: string;
                    /** @example Ikeja */
                    administrativeAreaLevel2?: string;
                    /** @example Lagos */
                    city: string;
                    /**
                     * @default Nigeria
                     * @example Nigeria
                     */
                    country?: string;
                    /**
                     * @default NG
                     * @example NG
                     */
                    countryCode?: string;
                    /** @example Victoria Island */
                    dependentLocality?: string;
                    /** @example 12 Broad Street, Lagos, Nigeria */
                    formattedAddress?: string;
                    /** @example ChIJrTLr-GyuEmsRBfy61i59si0 */
                    googlePlaceId?: string;
                    /** @example Leave at gate */
                    instructions?: string;
                    /**
                     * @default false
                     * @example false
                     */
                    isDefault?: boolean;
                    /** @example Near the roundabout */
                    landmark?: string;
                    /** @example 6.5244 */
                    latitude?: number;
                    /** @example cme4abcd1234 */
                    lgaId?: string;
                    /** @example Lagos */
                    locality?: string;
                    /** @example 3.3792 */
                    longitude?: number;
                    /** @example +2348012345678 */
                    phone?: string;
                    /** @example 100001 */
                    postalCode?: string;
                    /**
                     * @default MANUAL
                     * @enum {string}
                     */
                    provider?: "GOOGLE_PLACES" | "MANUAL" | "OTHER";
                    /** @example John Doe */
                    recipientName?: string;
                    /** @example Lagos */
                    state: string;
                    /** @example LA */
                    stateCode?: string;
                };
            };
        };
        responses: {
            /** @description Address created successfully */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        addressLine1?: string;
                        addressLine2?: string | null;
                        administrativeAreaLevel1?: string | null;
                        administrativeAreaLevel2?: string | null;
                        city?: string;
                        country?: string;
                        countryCode?: string;
                        /** Format: date-time */
                        createdAt?: string;
                        dependentLocality?: string | null;
                        formattedAddress?: string | null;
                        googlePlaceId?: string | null;
                        id?: string;
                        instructions?: string | null;
                        isDefault?: boolean;
                        landmark?: string | null;
                        latitude?: number | null;
                        lgaId?: string | null;
                        locality?: string | null;
                        longitude?: number | null;
                        phone?: string | null;
                        postalCode?: string | null;
                        provider?: string;
                        recipientName?: string | null;
                        state?: string;
                        stateCode?: string | null;
                        /** Format: date-time */
                        updatedAt?: string;
                        userId?: string;
                    };
                };
            };
            /** @description Invalid input data */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AddressesController_findUnique: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Address ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Address retrieved successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        addressLine1?: string;
                        addressLine2?: string | null;
                        administrativeAreaLevel1?: string | null;
                        administrativeAreaLevel2?: string | null;
                        city?: string;
                        country?: string;
                        countryCode?: string;
                        /** Format: date-time */
                        createdAt?: string;
                        dependentLocality?: string | null;
                        formattedAddress?: string | null;
                        googlePlaceId?: string | null;
                        id?: string;
                        instructions?: string | null;
                        isDefault?: boolean;
                        landmark?: string | null;
                        latitude?: number | null;
                        lgaId?: string | null;
                        locality?: string | null;
                        longitude?: number | null;
                        phone?: string | null;
                        postalCode?: string | null;
                        provider?: string;
                        recipientName?: string | null;
                        state?: string;
                        stateCode?: string | null;
                        /** Format: date-time */
                        updatedAt?: string;
                        userId?: string;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Address not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AddressesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Address ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Address deleted successfully */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Address not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AddressesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Address ID */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 123 Main Street */
                    addressLine1?: string;
                    /** @example Apt 4B */
                    addressLine2?: string;
                    /** @example Lagos */
                    administrativeAreaLevel1?: string;
                    /** @example Ikeja */
                    administrativeAreaLevel2?: string;
                    /** @example Lagos */
                    city?: string;
                    /** @example Nigeria */
                    country?: string;
                    /** @example NG */
                    countryCode?: string;
                    /** @example Victoria Island */
                    dependentLocality?: string;
                    /** @example 12 Broad Street, Lagos, Nigeria */
                    formattedAddress?: string;
                    /** @example ChIJrTLr-GyuEmsRBfy61i59si0 */
                    googlePlaceId?: string;
                    /** @example Leave at gate */
                    instructions?: string;
                    /** @example false */
                    isDefault?: boolean;
                    /** @example Near the roundabout */
                    landmark?: string;
                    /** @example 6.5244 */
                    latitude?: number;
                    /** @example cme4abcd1234 */
                    lgaId?: string;
                    /** @example Lagos */
                    locality?: string;
                    /** @example 3.3792 */
                    longitude?: number;
                    /** @example +2348012345678 */
                    phone?: string;
                    /** @example 100001 */
                    postalCode?: string;
                    /** @enum {string} */
                    provider?: "GOOGLE_PLACES" | "MANUAL" | "OTHER";
                    /** @example John Doe */
                    recipientName?: string;
                    /** @example Lagos */
                    state?: string;
                    /** @example LA */
                    stateCode?: string;
                };
            };
        };
        responses: {
            /** @description Address updated successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        addressLine1?: string;
                        addressLine2?: string | null;
                        administrativeAreaLevel1?: string | null;
                        administrativeAreaLevel2?: string | null;
                        city?: string;
                        country?: string;
                        countryCode?: string;
                        /** Format: date-time */
                        createdAt?: string;
                        dependentLocality?: string | null;
                        formattedAddress?: string | null;
                        googlePlaceId?: string | null;
                        id?: string;
                        instructions?: string | null;
                        isDefault?: boolean;
                        landmark?: string | null;
                        latitude?: number | null;
                        lgaId?: string | null;
                        locality?: string | null;
                        longitude?: number | null;
                        phone?: string | null;
                        postalCode?: string | null;
                        provider?: string;
                        recipientName?: string | null;
                        state?: string;
                        stateCode?: string | null;
                        /** Format: date-time */
                        updatedAt?: string;
                        userId?: string;
                    };
                };
            };
            /** @description Invalid input data */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Address not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationPreferencesController_getPreferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Preference matrix */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationPreferencesController_updatePreferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    preferences: {
                        /** @enum {string} */
                        category: "MARKETING" | "ORGANISER_OPERATIONAL" | "SECURITY" | "TRANSACTIONAL";
                        /** @enum {string} */
                        channel: "EMAIL" | "SMS";
                        enabled: boolean;
                    }[];
                };
            };
        };
        responses: {
            /** @description Updated preferences */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Required category or missing marketing consent */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NotificationPreferencesController_grantMarketingConsent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    channel: "EMAIL" | "SMS";
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    UsersController_getProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description User profile retrieved successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        createdAt?: string;
                        email?: string;
                        firstName?: string | null;
                        id?: string;
                        lastName?: string | null;
                        phone?: string | null;
                        /** @enum {string} */
                        role?: "ADMIN" | "CUSTOMER" | "ORGANIZER";
                        /** @example ACTIVE */
                        status?: string;
                        /** Format: date-time */
                        updatedAt?: string;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description User not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    UsersController_updateProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example John */
                    firstName?: string;
                    /** @example Doe */
                    lastName?: string;
                    /** @example +2348012345678 */
                    phone?: string;
                };
            };
        };
        responses: {
            /** @description Profile updated successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        createdAt?: string;
                        email?: string;
                        firstName?: string | null;
                        id?: string;
                        lastName?: string | null;
                        phone?: string | null;
                        /** @enum {string} */
                        role?: "ADMIN" | "CUSTOMER" | "ORGANIZER";
                        /** @example ACTIVE */
                        status?: string;
                        /** Format: date-time */
                        updatedAt?: string;
                    };
                };
            };
            /** @description Invalid input data */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description User not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}


-- TTW-084: create the default site settings row so a fresh deployment never
-- prices orders at 0% VAT before an admin opens Settings.
-- Nigerian VAT is 7.5%; prices include VAT; VAT also applies to shipping.
-- Payout fields keep their column defaults.
-- ON CONFLICT keeps any row an admin has already saved.
INSERT INTO "site_settings" ("id", "vatRate", "pricesIncludeVat", "vatAppliesToShipping", "currency", "updatedAt")
VALUES ('default', 0.075, true, true, 'NGN', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

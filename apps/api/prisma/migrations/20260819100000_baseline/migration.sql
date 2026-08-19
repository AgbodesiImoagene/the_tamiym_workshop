-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('REFRESH', 'PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "ImageRole" AS ENUM ('THUMBNAIL', 'GALLERY', 'WORKSHOP_TEMPLATE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'FULFILLED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'INITIATED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'PAUSED', 'DISABLED', 'ENDED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaSourceType" AS ENUM ('UPLOAD', 'IMPORT_URL');

-- CreateEnum
CREATE TYPE "MediaDerivativeType" AS ENUM ('ORIGINAL', 'DISPLAY', 'THUMB');

-- CreateEnum
CREATE TYPE "VirusScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED', 'BULK');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('ORDER', 'PRODUCT', 'VARIANT', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('NGN');

-- CreateEnum
CREATE TYPE "AddressProvider" AS ENUM ('MANUAL', 'GOOGLE_PLACES', 'OTHER');

-- CreateEnum
CREATE TYPE "ShippingRuleMatchType" AS ENUM ('ADMIN1', 'ADMIN2', 'CITY', 'POSTAL_CODE', 'POSTAL_PREFIX');

-- CreateEnum
CREATE TYPE "ShippingRateProvider" AS ENUM ('INTERNAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'SLACK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'FLAG', 'DISABLE', 'ENABLE', 'STATUS_CHANGE', 'REFUND', 'PAYOUT');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('PUBLIC_API', 'ADMIN_API', 'WEBHOOK', 'WORKER', 'CRON', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'PROCESSING', 'INITIATED', 'SUCCEEDED', 'FAILED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('PAYMENT_SETTLED', 'REFUND_APPLIED', 'PAYOUT_RESERVED', 'PAYOUT_SUCCEEDED', 'PAYOUT_FAILED', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayoutMode" AS ENUM ('MANUAL', 'AUTO_APPROVAL_REQUIRED', 'AUTO_EXECUTE');

-- CreateEnum
CREATE TYPE "PayoutRunStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TemplateLayerType" AS ENUM ('BASE', 'SHADOW', 'HIGHLIGHT', 'MASK_OVERLAY', 'OUTLINE', 'DETAIL');

-- CreateEnum
CREATE TYPE "TemplateEffectType" AS ENUM ('TINT', 'SHOW', 'HIDE', 'REPLACE_IMAGE');

-- CreateEnum
CREATE TYPE "BlendMode" AS ENUM ('NORMAL', 'MULTIPLY', 'SCREEN', 'OVERLAY', 'DARKEN', 'LIGHTEN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_oauth_accounts" (
    "id" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenType" "TokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientName" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "countryCode" TEXT NOT NULL DEFAULT 'NG',
    "landmark" TEXT,
    "instructions" TEXT,
    "locality" TEXT,
    "dependentLocality" TEXT,
    "administrativeAreaLevel1" TEXT,
    "administrativeAreaLevel2" TEXT,
    "stateCode" TEXT,
    "lgaId" TEXT,
    "provider" "AddressProvider" NOT NULL DEFAULT 'MANUAL',
    "googlePlaceId" TEXT,
    "formattedAddress" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "normalizationMetadata" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "vatRate" DECIMAL(5,4) NOT NULL,
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "vatAppliesToShipping" BOOLEAN NOT NULL DEFAULT true,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "payoutMode" "PayoutMode" NOT NULL DEFAULT 'MANUAL',
    "payoutCadenceDays" INTEGER NOT NULL DEFAULT 7,
    "payoutSettlementHoldDays" INTEGER NOT NULL DEFAULT 7,
    "minimumPayoutAmount" DECIMAL(10,2),
    "autoRetryFailedPayouts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_states" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geo_states_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "geo_lgas" (
    "id" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "geo_lgas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zone_areas" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "lgaId" TEXT,

    CONSTRAINT "shipping_zone_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zone_rules" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "matchType" "ShippingRuleMatchType" NOT NULL,
    "matchValue" TEXT NOT NULL,
    "matchContext" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_zone_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "provider" "ShippingRateProvider" NOT NULL DEFAULT 'INTERNAL',
    "serviceLevel" TEXT NOT NULL DEFAULT 'STANDARD',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "flatFee" DECIMAL(10,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "minDeliveryDays" INTEGER,
    "maxDeliveryDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "weightGrams" INTEGER,
    "packageLengthMm" INTEGER,
    "packageWidthMm" INTEGER,
    "packageHeightMm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_values" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "valueCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_value_upcharges" (
    "id" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_value_upcharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "weightGrams" INTEGER,
    "packageLengthMm" INTEGER,
    "packageWidthMm" INTEGER,
    "packageHeightMm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_option_values" (
    "variantId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,

    CONSTRAINT "variant_option_values_pkey" PRIMARY KEY ("variantId","optionValueId")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "stockOnHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amount" DECIMAL(10,2) NOT NULL,
    "compareAt" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_prices" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amount" DECIMAL(10,2) NOT NULL,
    "compareAt" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_product_prices" (
    "id" TEXT NOT NULL,
    "campaignProductId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amount" DECIMAL(10,2) NOT NULL,
    "compareAt" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "mediaAssetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_image_roles" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "role" "ImageRole" NOT NULL,
    "sortOrder" INTEGER,
    "productViewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_image_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_views" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDesignable" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_view_pricing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "productViewId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "surchargeAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_view_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_areas" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productViewId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "rotationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "maxLayers" INTEGER,
    "maxColors" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_template_layers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productViewId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT,
    "layerType" "TemplateLayerType" NOT NULL,
    "imageId" TEXT NOT NULL,
    "blendMode" "BlendMode" NOT NULL DEFAULT 'NORMAL',
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_template_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_value_template_effects" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productViewId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,
    "templateLayerId" TEXT NOT NULL,
    "effectType" "TemplateEffectType" NOT NULL,
    "tintHex" TEXT,
    "replacementImageId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_value_template_effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "designData" JSONB NOT NULL,
    "thumbnailUrl" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderationNotes" TEXT,
    "shareToken" TEXT,
    "shareTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_assets" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "sourceType" "MediaSourceType" NOT NULL,
    "sourceUrl" TEXT,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING',
    "scanStatus" "VirusScanStatus" NOT NULL DEFAULT 'PENDING',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderationNotes" TEXT,
    "originalKey" TEXT,
    "originalUrl" TEXT,
    "originalMime" TEXT,
    "originalBytes" INTEGER,
    "originalWidth" INTEGER,
    "originalHeight" INTEGER,
    "checksum" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_derivatives" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "MediaDerivativeType" NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_views" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "productViewId" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "layerCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shippingAddressId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "shipRecipientName" TEXT,
    "shipPhone" TEXT,
    "shipLine1" TEXT NOT NULL,
    "shipLine2" TEXT,
    "shipCity" TEXT NOT NULL,
    "shipState" TEXT NOT NULL,
    "shipPostalCode" TEXT,
    "shipCountry" TEXT NOT NULL DEFAULT 'Nigeria',
    "shipLandmark" TEXT,
    "shipInstructions" TEXT,
    "paymentReference" TEXT,
    "campaignId" TEXT,
    "shippingBreakdown" JSONB,
    "expiresAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "designId" TEXT,
    "campaignId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitBasePrice" DECIMAL(10,2) NOT NULL,
    "unitViewSurcharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unitDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unitFinalPrice" DECIMAL(10,2) NOT NULL,
    "variantSnapshot" JSONB,
    "pricingBreakdown" JSONB,
    "organizerDiscountApplied" DECIMAL(10,2),
    "organizerCostBasis" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "providerRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amount" DECIMAL(10,2) NOT NULL,
    "idempotencyKey" TEXT,
    "rawEvent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "providerRef" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'INITIATED',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "story" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "moderationNotes" TEXT,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "goalAmount" DECIMAL(10,2),
    "currentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "payoutBankName" TEXT,
    "payoutBankCode" TEXT,
    "payoutAccountName" TEXT,
    "payoutAccountNo" TEXT,
    "payoutProfileId" TEXT,
    "payoutModeOverride" "PayoutMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_balance_ledger_entries" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "refundId" TEXT,
    "payoutId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_balance_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_products" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "designId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_payout_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "bankName" TEXT,
    "bankCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "recipientCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_payout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_runs" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "mode" "PayoutMode" NOT NULL,
    "status" "PayoutRunStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "payoutRunId" TEXT,
    "recipientUserId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "providerRef" TEXT,
    "idempotencyKey" TEXT,
    "failureReason" TEXT,
    "rawEvent" JSONB,
    "status" "PayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amount" DECIMAL(10,2) NOT NULL,
    "snapshotBankCode" TEXT,
    "snapshotAccountName" TEXT,
    "snapshotAccountMask" TEXT,
    "snapshotRecipientCode" TEXT,
    "requestedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvalReason" TEXT,
    "isManualAdjustment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_pricing_policies" (
    "id" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "discountPercent" DOUBLE PRECISION,
    "discountAmount" DECIMAL(10,2),
    "productId" TEXT,
    "variantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_pricing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "type" "DiscountType" NOT NULL,
    "status" "DiscountStatus" NOT NULL DEFAULT 'ACTIVE',
    "scope" "DiscountScope" NOT NULL,
    "valuePercent" DOUBLE PRECISION,
    "valueAmount" DECIMAL(10,2),
    "currency" "CurrencyCode",
    "minOrderAmount" DECIMAL(10,2),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_products" (
    "discountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "discount_products_pkey" PRIMARY KEY ("discountId","productId")
);

-- CreateTable
CREATE TABLE "discount_variants" (
    "discountId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "discount_variants_pkey" PRIMARY KEY ("discountId","variantId")
);

-- CreateTable
CREATE TABLE "discount_campaigns" (
    "discountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "discount_campaigns_pkey" PRIMARY KEY ("discountId","campaignId")
);

-- CreateTable
CREATE TABLE "order_discounts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "amountApplied" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_pricing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'NGN',
    "pricePerUnit" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notification_routes" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "emailRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifySms" BOOLEAN NOT NULL DEFAULT false,
    "smsRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifySlack" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookUrl" TEXT,
    "subjectTemplate" TEXT,
    "emailBodyTemplate" TEXT,
    "smsBodyTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_notification_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "UserRole",
    "eventName" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "source" "AuditSource" NOT NULL DEFAULT 'SYSTEM',
    "requestId" TEXT,
    "traceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_oauth_accounts_userId_idx" ON "user_oauth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_oauth_accounts_provider_providerAccountId_key" ON "user_oauth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_key" ON "auth_tokens"("token");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_idx" ON "auth_tokens"("userId");

-- CreateIndex
CREATE INDEX "auth_tokens_token_idx" ON "auth_tokens"("token");

-- CreateIndex
CREATE INDEX "auth_tokens_tokenType_idx" ON "auth_tokens"("tokenType");

-- CreateIndex
CREATE INDEX "auth_tokens_expiresAt_idx" ON "auth_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");

-- CreateIndex
CREATE INDEX "addresses_stateCode_idx" ON "addresses"("stateCode");

-- CreateIndex
CREATE INDEX "addresses_lgaId_idx" ON "addresses"("lgaId");

-- CreateIndex
CREATE INDEX "geo_lgas_stateCode_idx" ON "geo_lgas"("stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "geo_lgas_stateCode_name_key" ON "geo_lgas"("stateCode", "name");

-- CreateIndex
CREATE INDEX "shipping_zone_areas_zoneId_idx" ON "shipping_zone_areas"("zoneId");

-- CreateIndex
CREATE INDEX "shipping_zone_areas_stateCode_idx" ON "shipping_zone_areas"("stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zone_areas_zoneId_stateCode_lgaId_key" ON "shipping_zone_areas"("zoneId", "stateCode", "lgaId");

-- CreateIndex
CREATE INDEX "shipping_zone_rules_zoneId_idx" ON "shipping_zone_rules"("zoneId");

-- CreateIndex
CREATE INDEX "shipping_zone_rules_countryCode_matchType_priority_isActive_idx" ON "shipping_zone_rules"("countryCode", "matchType", "priority", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zone_rules_zoneId_countryCode_matchType_matchValue_key" ON "shipping_zone_rules"("zoneId", "countryCode", "matchType", "matchValue", "matchContext");

-- CreateIndex
CREATE INDEX "shipping_rates_zoneId_idx" ON "shipping_rates"("zoneId");

-- CreateIndex
CREATE INDEX "shipping_rates_zoneId_currency_isActive_priority_idx" ON "shipping_rates"("zoneId", "currency", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_slug_idx" ON "products"("slug");

-- CreateIndex
CREATE INDEX "product_options_productId_idx" ON "product_options"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_productId_code_key" ON "product_options"("productId", "code");

-- CreateIndex
CREATE INDEX "product_option_values_optionId_idx" ON "product_option_values"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_values_optionId_valueCode_key" ON "product_option_values"("optionId", "valueCode");

-- CreateIndex
CREATE INDEX "option_value_upcharges_optionValueId_idx" ON "option_value_upcharges"("optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX "option_value_upcharges_optionValueId_currency_key" ON "option_value_upcharges"("optionValueId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "variant_option_values_variantId_idx" ON "variant_option_values"("variantId");

-- CreateIndex
CREATE INDEX "variant_option_values_optionValueId_idx" ON "variant_option_values"("optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_option_values_variantId_optionId_key" ON "variant_option_values"("variantId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_variantId_key" ON "inventory_items"("variantId");

-- CreateIndex
CREATE INDEX "product_prices_productId_idx" ON "product_prices"("productId");

-- CreateIndex
CREATE INDEX "product_prices_currency_idx" ON "product_prices"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_productId_currency_key" ON "product_prices"("productId", "currency");

-- CreateIndex
CREATE INDEX "variant_prices_variantId_idx" ON "variant_prices"("variantId");

-- CreateIndex
CREATE INDEX "variant_prices_currency_idx" ON "variant_prices"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "variant_prices_variantId_currency_key" ON "variant_prices"("variantId", "currency");

-- CreateIndex
CREATE INDEX "campaign_product_prices_campaignProductId_idx" ON "campaign_product_prices"("campaignProductId");

-- CreateIndex
CREATE INDEX "campaign_product_prices_currency_idx" ON "campaign_product_prices"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_product_prices_campaignProductId_currency_key" ON "campaign_product_prices"("campaignProductId", "currency");

-- CreateIndex
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");

-- CreateIndex
CREATE INDEX "product_images_variantId_idx" ON "product_images"("variantId");

-- CreateIndex
CREATE INDEX "product_images_mediaAssetId_idx" ON "product_images"("mediaAssetId");

-- CreateIndex
CREATE INDEX "product_image_roles_productId_idx" ON "product_image_roles"("productId");

-- CreateIndex
CREATE INDEX "product_image_roles_imageId_idx" ON "product_image_roles"("imageId");

-- CreateIndex
CREATE INDEX "product_image_roles_productViewId_idx" ON "product_image_roles"("productViewId");

-- CreateIndex
CREATE UNIQUE INDEX "product_image_roles_productId_role_productViewId_key" ON "product_image_roles"("productId", "role", "productViewId");

-- CreateIndex
CREATE INDEX "product_views_productId_idx" ON "product_views"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_views_productId_key_key" ON "product_views"("productId", "key");

-- CreateIndex
CREATE INDEX "product_view_pricing_productId_idx" ON "product_view_pricing"("productId");

-- CreateIndex
CREATE INDEX "product_view_pricing_variantId_idx" ON "product_view_pricing"("variantId");

-- CreateIndex
CREATE INDEX "product_view_pricing_productViewId_idx" ON "product_view_pricing"("productViewId");

-- CreateIndex
CREATE UNIQUE INDEX "product_view_pricing_productId_variantId_productViewId_curr_key" ON "product_view_pricing"("productId", "variantId", "productViewId", "currency");

-- CreateIndex
CREATE INDEX "print_areas_productId_idx" ON "print_areas"("productId");

-- CreateIndex
CREATE INDEX "print_areas_productViewId_idx" ON "print_areas"("productViewId");

-- CreateIndex
CREATE UNIQUE INDEX "print_areas_productId_productViewId_key" ON "print_areas"("productId", "productViewId");

-- CreateIndex
CREATE INDEX "workshop_template_layers_productId_idx" ON "workshop_template_layers"("productId");

-- CreateIndex
CREATE INDEX "workshop_template_layers_productViewId_idx" ON "workshop_template_layers"("productViewId");

-- CreateIndex
CREATE INDEX "workshop_template_layers_imageId_idx" ON "workshop_template_layers"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_template_layers_productViewId_key_key" ON "workshop_template_layers"("productViewId", "key");

-- CreateIndex
CREATE INDEX "option_value_template_effects_productId_idx" ON "option_value_template_effects"("productId");

-- CreateIndex
CREATE INDEX "option_value_template_effects_productViewId_idx" ON "option_value_template_effects"("productViewId");

-- CreateIndex
CREATE INDEX "option_value_template_effects_optionId_idx" ON "option_value_template_effects"("optionId");

-- CreateIndex
CREATE INDEX "option_value_template_effects_optionValueId_idx" ON "option_value_template_effects"("optionValueId");

-- CreateIndex
CREATE INDEX "option_value_template_effects_templateLayerId_idx" ON "option_value_template_effects"("templateLayerId");

-- CreateIndex
CREATE UNIQUE INDEX "option_value_template_effects_productViewId_optionValueId_t_key" ON "option_value_template_effects"("productViewId", "optionValueId", "templateLayerId", "effectType");

-- CreateIndex
CREATE UNIQUE INDEX "designs_shareToken_key" ON "designs"("shareToken");

-- CreateIndex
CREATE INDEX "designs_userId_idx" ON "designs"("userId");

-- CreateIndex
CREATE INDEX "designs_productId_idx" ON "designs"("productId");

-- CreateIndex
CREATE INDEX "designs_campaignId_idx" ON "designs"("campaignId");

-- CreateIndex
CREATE INDEX "designs_moderationStatus_idx" ON "designs"("moderationStatus");

-- CreateIndex
CREATE INDEX "designs_createdAt_idx" ON "designs"("createdAt");

-- CreateIndex
CREATE INDEX "design_assets_ownerUserId_idx" ON "design_assets"("ownerUserId");

-- CreateIndex
CREATE INDEX "design_assets_mediaAssetId_idx" ON "design_assets"("mediaAssetId");

-- CreateIndex
CREATE INDEX "media_assets_status_idx" ON "media_assets"("status");

-- CreateIndex
CREATE INDEX "media_assets_scanStatus_idx" ON "media_assets"("scanStatus");

-- CreateIndex
CREATE INDEX "media_assets_moderationStatus_idx" ON "media_assets"("moderationStatus");

-- CreateIndex
CREATE INDEX "media_derivatives_assetId_idx" ON "media_derivatives"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "media_derivatives_assetId_type_key" ON "media_derivatives"("assetId", "type");

-- CreateIndex
CREATE INDEX "design_views_designId_idx" ON "design_views"("designId");

-- CreateIndex
CREATE INDEX "design_views_productViewId_idx" ON "design_views"("productViewId");

-- CreateIndex
CREATE UNIQUE INDEX "design_views_designId_productViewId_key" ON "design_views"("designId", "productViewId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_paymentReference_key" ON "orders"("paymentReference");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "orders_userId_createdAt_idx" ON "orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_campaignId_idx" ON "orders"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_userId_idempotencyKey_key" ON "orders"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_variantId_idx" ON "order_items"("variantId");

-- CreateIndex
CREATE INDEX "order_items_campaignId_idx" ON "order_items"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "payments_provider_providerRef_idx" ON "payments"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_provider_providerRef_idx" ON "refunds"("provider", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_organizerId_idx" ON "campaigns"("organizerId");

-- CreateIndex
CREATE INDEX "campaigns_slug_idx" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_moderationStatus_idx" ON "campaigns"("moderationStatus");

-- CreateIndex
CREATE INDEX "campaigns_createdAt_idx" ON "campaigns"("createdAt");

-- CreateIndex
CREATE INDEX "campaigns_payoutProfileId_idx" ON "campaigns"("payoutProfileId");

-- CreateIndex
CREATE INDEX "campaign_balance_ledger_entries_campaignId_idx" ON "campaign_balance_ledger_entries"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_balance_ledger_entries_campaignId_availableAt_idx" ON "campaign_balance_ledger_entries"("campaignId", "availableAt");

-- CreateIndex
CREATE INDEX "campaign_balance_ledger_entries_orderId_idx" ON "campaign_balance_ledger_entries"("orderId");

-- CreateIndex
CREATE INDEX "campaign_balance_ledger_entries_payoutId_idx" ON "campaign_balance_ledger_entries"("payoutId");

-- CreateIndex
CREATE INDEX "campaign_products_campaignId_idx" ON "campaign_products"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_products_campaignId_productId_designId_key" ON "campaign_products"("campaignId", "productId", "designId");

-- CreateIndex
CREATE UNIQUE INDEX "user_payout_profiles_recipientCode_key" ON "user_payout_profiles"("recipientCode");

-- CreateIndex
CREATE INDEX "user_payout_profiles_userId_idx" ON "user_payout_profiles"("userId");

-- CreateIndex
CREATE INDEX "user_payout_profiles_bankCode_idx" ON "user_payout_profiles"("bankCode");

-- CreateIndex
CREATE INDEX "payout_runs_status_idx" ON "payout_runs"("status");

-- CreateIndex
CREATE INDEX "payout_runs_scheduledFor_idx" ON "payout_runs"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_providerRef_key" ON "payouts"("providerRef");

-- CreateIndex
CREATE INDEX "payouts_campaignId_idx" ON "payouts"("campaignId");

-- CreateIndex
CREATE INDEX "payouts_payoutRunId_idx" ON "payouts"("payoutRunId");

-- CreateIndex
CREATE INDEX "payouts_provider_idx" ON "payouts"("provider");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "organizer_pricing_policies_isActive_currency_idx" ON "organizer_pricing_policies"("isActive", "currency");

-- CreateIndex
CREATE INDEX "organizer_pricing_policies_productId_idx" ON "organizer_pricing_policies"("productId");

-- CreateIndex
CREATE INDEX "organizer_pricing_policies_variantId_idx" ON "organizer_pricing_policies"("variantId");

-- CreateIndex
CREATE INDEX "organizer_pricing_policies_currency_productId_variantId_isA_idx" ON "organizer_pricing_policies"("currency", "productId", "variantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_pricing_policies_currency_productId_variantId_sta_key" ON "organizer_pricing_policies"("currency", "productId", "variantId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_code_key" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "discounts_status_scope_idx" ON "discounts"("status", "scope");

-- CreateIndex
CREATE INDEX "discounts_status_scope_startAt_endAt_idx" ON "discounts"("status", "scope", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "order_discounts_orderId_idx" ON "order_discounts"("orderId");

-- CreateIndex
CREATE INDEX "bulk_pricing_productId_idx" ON "bulk_pricing"("productId");

-- CreateIndex
CREATE INDEX "bulk_pricing_variantId_idx" ON "bulk_pricing"("variantId");

-- CreateIndex
CREATE INDEX "bulk_pricing_productId_minQuantity_idx" ON "bulk_pricing"("productId", "minQuantity");

-- CreateIndex
CREATE INDEX "bulk_pricing_variantId_minQuantity_idx" ON "bulk_pricing"("variantId", "minQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_pricing_productId_variantId_currency_minQuantity_key" ON "bulk_pricing"("productId", "variantId", "currency", "minQuantity");

-- CreateIndex
CREATE INDEX "admin_notification_routes_eventKey_enabled_idx" ON "admin_notification_routes"("eventKey", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "admin_notification_routes_eventKey_name_key" ON "admin_notification_routes"("eventKey", "name");

-- CreateIndex
CREATE INDEX "notification_outbox_createdAt_idx" ON "notification_outbox"("createdAt");

-- CreateIndex
CREATE INDEX "notification_outbox_recipientUserId_idx" ON "notification_outbox"("recipientUserId");

-- CreateIndex
CREATE INDEX "notification_outbox_status_scheduledAt_idx" ON "notification_outbox"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_eventName_createdAt_idx" ON "audit_logs"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_traceId_idx" ON "audit_logs"("traceId");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_createdAt_idx" ON "audit_logs"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "geo_states"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "geo_lgas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_lgas" ADD CONSTRAINT "geo_lgas_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "geo_states"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone_areas" ADD CONSTRAINT "shipping_zone_areas_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone_areas" ADD CONSTRAINT "shipping_zone_areas_stateCode_fkey" FOREIGN KEY ("stateCode") REFERENCES "geo_states"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone_areas" ADD CONSTRAINT "shipping_zone_areas_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "geo_lgas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone_rules" ADD CONSTRAINT "shipping_zone_rules_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_upcharges" ADD CONSTRAINT "option_value_upcharges_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_product_prices" ADD CONSTRAINT "campaign_product_prices_campaignProductId_fkey" FOREIGN KEY ("campaignProductId") REFERENCES "campaign_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_image_roles" ADD CONSTRAINT "product_image_roles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_image_roles" ADD CONSTRAINT "product_image_roles_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "product_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_image_roles" ADD CONSTRAINT "product_image_roles_productViewId_fkey" FOREIGN KEY ("productViewId") REFERENCES "product_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_view_pricing" ADD CONSTRAINT "product_view_pricing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_view_pricing" ADD CONSTRAINT "product_view_pricing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_view_pricing" ADD CONSTRAINT "product_view_pricing_productViewId_fkey" FOREIGN KEY ("productViewId") REFERENCES "product_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_areas" ADD CONSTRAINT "print_areas_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_areas" ADD CONSTRAINT "print_areas_productViewId_fkey" FOREIGN KEY ("productViewId") REFERENCES "product_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_template_layers" ADD CONSTRAINT "workshop_template_layers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_template_layers" ADD CONSTRAINT "workshop_template_layers_productViewId_fkey" FOREIGN KEY ("productViewId") REFERENCES "product_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_template_layers" ADD CONSTRAINT "workshop_template_layers_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "product_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_template_effects" ADD CONSTRAINT "option_value_template_effects_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_template_effects" ADD CONSTRAINT "option_value_template_effects_productViewId_fkey" FOREIGN KEY ("productViewId") REFERENCES "product_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_template_effects" ADD CONSTRAINT "option_value_template_effects_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_template_effects" ADD CONSTRAINT "option_value_template_effects_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_template_effects" ADD CONSTRAINT "option_value_template_effects_templateLayerId_fkey" FOREIGN KEY ("templateLayerId") REFERENCES "workshop_template_layers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_value_template_effects" ADD CONSTRAINT "option_value_template_effects_replacementImageId_fkey" FOREIGN KEY ("replacementImageId") REFERENCES "product_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_views" ADD CONSTRAINT "design_views_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_views" ADD CONSTRAINT "design_views_productViewId_fkey" FOREIGN KEY ("productViewId") REFERENCES "product_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_payoutProfileId_fkey" FOREIGN KEY ("payoutProfileId") REFERENCES "user_payout_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_balance_ledger_entries" ADD CONSTRAINT "campaign_balance_ledger_entries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_products" ADD CONSTRAINT "campaign_products_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_products" ADD CONSTRAINT "campaign_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_products" ADD CONSTRAINT "campaign_products_designId_fkey" FOREIGN KEY ("designId") REFERENCES "designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_payout_profiles" ADD CONSTRAINT "user_payout_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_runs" ADD CONSTRAINT "payout_runs_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_runs" ADD CONSTRAINT "payout_runs_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payoutRunId_fkey" FOREIGN KEY ("payoutRunId") REFERENCES "payout_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_pricing_policies" ADD CONSTRAINT "organizer_pricing_policies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_pricing_policies" ADD CONSTRAINT "organizer_pricing_policies_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_products" ADD CONSTRAINT "discount_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_variants" ADD CONSTRAINT "discount_variants_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_variants" ADD CONSTRAINT "discount_variants_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_campaigns" ADD CONSTRAINT "discount_campaigns_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_campaigns" ADD CONSTRAINT "discount_campaigns_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_discounts" ADD CONSTRAINT "order_discounts_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_pricing" ADD CONSTRAINT "bulk_pricing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_pricing" ADD CONSTRAINT "bulk_pricing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


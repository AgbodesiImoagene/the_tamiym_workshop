import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AddressNormalizationService } from './address-normalization.service';
import { ShippingAdminService } from './shipping-admin.service';
import { ShippingDestinationResolver } from './shipping-destination-resolver.service';
import { InternalZoneRateProvider } from './internal-zone-rate-provider.service';
import { ShippingRateEngine } from './shipping-rate-engine.service';

@Module({
  imports: [PrismaModule],
  providers: [
    AddressNormalizationService,
    ShippingAdminService,
    ShippingDestinationResolver,
    InternalZoneRateProvider,
    ShippingRateEngine,
  ],
  exports: [
    AddressNormalizationService,
    ShippingAdminService,
    ShippingDestinationResolver,
    ShippingRateEngine,
  ],
})
export class ShippingModule {}

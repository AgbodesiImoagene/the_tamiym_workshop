import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductSurchargesService } from './product-surcharges.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [CategoriesController, ProductsController],
  providers: [CategoriesService, ProductsService, ProductSurchargesService],
  exports: [CategoriesService, ProductsService, ProductSurchargesService],
})
export class ProductsModule {}

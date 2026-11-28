import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductLikesController } from './product-likes.controller';
import { ProductLikesService } from './product-likes.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductSurchargesService } from './product-surcharges.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [
    CategoriesController,
    ProductsController,
    ProductLikesController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    ProductSurchargesService,
    ProductLikesService,
  ],
  exports: [CategoriesService, ProductsService, ProductSurchargesService],
})
export class ProductsModule {}

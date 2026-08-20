import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { CreateOptionDto } from '../products/dto/create-option.dto';
import { CreateOptionValueDto } from '../products/dto/create-option-value.dto';
import { CreatePrintAreaDto } from '../products/dto/create-print-area.dto';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { CreateProductImageDto } from '../products/dto/create-product-image.dto';
import { CreateProductImageUploadDto } from '../products/dto/create-product-image-upload.dto';
import { CreateProductImageRoleDto } from '../products/dto/create-product-image-role.dto';
import { CreateProductPriceDto } from '../products/dto/create-product-price.dto';
import { CreateProductViewDto } from '../products/dto/create-product-view.dto';
import { CreateTemplateEffectDto } from '../products/dto/create-template-effect.dto';
import { CreateTemplateLayerDto } from '../products/dto/create-template-layer.dto';
import { CreateVariantPriceDto } from '../products/dto/create-variant-price.dto';
import { UpdateOptionDto } from '../products/dto/update-option.dto';
import { UpdateOptionValueDto } from '../products/dto/update-option-value.dto';
import { UpdatePrintAreaDto } from '../products/dto/update-print-area.dto';
import { UpdateProductDto } from '../products/dto/update-product.dto';
import { UpdateProductImageDto } from '../products/dto/update-product-image.dto';
import { UpdateProductImageRoleDto } from '../products/dto/update-product-image-role.dto';
import { UpdateProductPriceDto } from '../products/dto/update-product-price.dto';
import { UpdateProductViewDto } from '../products/dto/update-product-view.dto';
import { UpdateTemplateEffectDto } from '../products/dto/update-template-effect.dto';
import { UpdateTemplateLayerDto } from '../products/dto/update-template-layer.dto';
import { UpdateVariantDto } from '../products/dto/update-variant.dto';
import { UpdateVariantPriceDto } from '../products/dto/update-variant-price.dto';
import { ProductsService } from '../products/products.service';

type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

@ApiTags('Admin')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List all products (admin, no status filter)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Product list' })
  async findAll() {
    return this.productsService.adminFindAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full product detail (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({
    status: 200,
    description: 'Product detail with views, layers, and images',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('id') id: string) {
    return this.productsService.adminFindOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 204, description: 'Product deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async remove(@Param('id') id: string) {
    await this.productsService.remove(id);
  }

  @Get(':productId/variants')
  @ApiOperation({ summary: 'List variants for product (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Variants list' })
  async listVariants(@Param('productId') productId: string) {
    return this.productsService.listVariants(productId);
  }

  @Post(':productId/options')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product option (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'productId', description: 'Product ID' })
  async createOption(
    @Param('productId') productId: string,
    @Body() dto: CreateOptionDto,
  ) {
    return this.productsService.createOption(productId, dto);
  }

  @Get(':productId/options')
  @ApiOperation({
    summary: 'List product options (admin)',
    description:
      'Returns the same payload as GET /admin/products/:id (admin detail), including options for any product status.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'productId', description: 'Product ID' })
  async listOptions(@Param('productId') productId: string) {
    return this.productsService.adminFindOne(productId);
  }

  @Patch(':productId/options/:optionId')
  @ApiOperation({ summary: 'Update product option (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'optionId', description: 'Option ID' })
  async updateOption(
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateOptionDto,
  ) {
    return this.productsService.updateOption(productId, optionId, dto);
  }

  @Delete(':productId/options/:optionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product option (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'optionId', description: 'Option ID' })
  async deleteOption(
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
  ) {
    await this.productsService.deleteOption(productId, optionId);
  }

  @Post(':productId/options/:optionId/values')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create option value (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'optionId', description: 'Option ID' })
  async createOptionValue(
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Body() dto: CreateOptionValueDto,
  ) {
    return this.productsService.createOptionValue(productId, optionId, dto);
  }

  @Patch(':productId/options/:optionId/values/:valueId')
  @ApiOperation({ summary: 'Update option value (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'valueId', description: 'Option value ID' })
  async updateOptionValue(
    @Param('productId') productId: string,
    @Param('valueId') valueId: string,
    @Body() dto: UpdateOptionValueDto,
  ) {
    return this.productsService.updateOptionValue(productId, valueId, dto);
  }

  @Delete(':productId/options/:optionId/values/:valueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete option value (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'valueId', description: 'Option value ID' })
  async deleteOptionValue(
    @Param('productId') productId: string,
    @Param('valueId') valueId: string,
  ) {
    await this.productsService.deleteOptionValue(productId, valueId);
  }

  @Post(':productId/images')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create product image from URL (admin, async)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async createImage(
    @Param('productId') productId: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.productsService.createProductImage(productId, dto);
  }

  @Post(':productId/images/upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload product image (admin, async)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sortOrder: { type: 'number' },
        altText: { type: 'string' },
        variantId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('productId') productId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/(jpeg|png|webp)/ }),
        ],
      }),
    )
    file: UploadedImageFile,
    @Body() dto: CreateProductImageUploadDto,
  ) {
    return this.productsService.uploadProductImage(productId, file, dto);
  }

  @Patch(':productId/images/:imageId')
  @ApiOperation({ summary: 'Update product image (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updateImage(
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductImageDto,
  ) {
    return this.productsService.updateProductImage(imageId, dto);
  }

  @Delete(':productId/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product image (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async deleteImage(@Param('imageId') imageId: string) {
    await this.productsService.deleteProductImage(imageId);
  }

  @Post(':productId/images/:imageId/roles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign image role (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async createImageRole(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @Body() dto: CreateProductImageRoleDto,
  ) {
    return this.productsService.createProductImageRole(productId, imageId, dto);
  }

  @Patch(':productId/image-roles/:roleId')
  @ApiOperation({ summary: 'Update image role (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updateImageRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateProductImageRoleDto,
  ) {
    return this.productsService.updateProductImageRole(roleId, dto);
  }

  @Delete(':productId/image-roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete image role (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async deleteImageRole(@Param('roleId') roleId: string) {
    await this.productsService.deleteProductImageRole(roleId);
  }

  @Post(':productId/views')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product view (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async createView(
    @Param('productId') productId: string,
    @Body() dto: CreateProductViewDto,
  ) {
    return this.productsService.createProductView(productId, dto);
  }

  @Patch(':productId/views/:viewId')
  @ApiOperation({ summary: 'Update product view (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updateView(
    @Param('viewId') viewId: string,
    @Body() dto: UpdateProductViewDto,
  ) {
    return this.productsService.updateProductView(viewId, dto);
  }

  @Delete(':productId/views/:viewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product view (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async deleteView(@Param('viewId') viewId: string) {
    await this.productsService.deleteProductView(viewId);
  }

  @Post(':productId/views/:viewId/print-area')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upsert print area (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async upsertPrintArea(
    @Param('productId') productId: string,
    @Param('viewId') viewId: string,
    @Body() dto: CreatePrintAreaDto,
  ) {
    return this.productsService.upsertPrintArea(productId, viewId, dto);
  }

  @Patch(':productId/views/:viewId/print-area')
  @ApiOperation({ summary: 'Update print area (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updatePrintArea(
    @Param('productId') productId: string,
    @Param('viewId') viewId: string,
    @Body() dto: UpdatePrintAreaDto,
  ) {
    return this.productsService.upsertPrintArea(productId, viewId, dto);
  }

  @Post(':productId/views/:viewId/layers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create template layer (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async createLayer(
    @Param('productId') productId: string,
    @Param('viewId') viewId: string,
    @Body() dto: CreateTemplateLayerDto,
  ) {
    return this.productsService.createTemplateLayer(productId, viewId, dto);
  }

  @Patch(':productId/views/:viewId/layers/:layerId')
  @ApiOperation({ summary: 'Update template layer (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updateLayer(
    @Param('layerId') layerId: string,
    @Body() dto: UpdateTemplateLayerDto,
  ) {
    return this.productsService.updateTemplateLayer(layerId, dto);
  }

  @Delete(':productId/views/:viewId/layers/:layerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete template layer (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async deleteLayer(@Param('layerId') layerId: string) {
    await this.productsService.deleteTemplateLayer(layerId);
  }

  @Post(':productId/views/:viewId/effects')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create template effect (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async createEffect(
    @Param('productId') productId: string,
    @Param('viewId') viewId: string,
    @Body() dto: CreateTemplateEffectDto,
  ) {
    return this.productsService.createTemplateEffect(productId, viewId, dto);
  }

  @Patch(':productId/views/:viewId/effects/:effectId')
  @ApiOperation({ summary: 'Update template effect (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updateEffect(
    @Param('effectId') effectId: string,
    @Body() dto: UpdateTemplateEffectDto,
  ) {
    return this.productsService.updateTemplateEffect(effectId, dto);
  }

  @Delete(':productId/views/:viewId/effects/:effectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete template effect (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async deleteEffect(@Param('effectId') effectId: string) {
    await this.productsService.deleteTemplateEffect(effectId);
  }

  @Post(':productId/prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upsert product price (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async upsertProductPrice(
    @Param('productId') productId: string,
    @Body() dto: CreateProductPriceDto,
  ) {
    return this.productsService.upsertProductPrice(productId, dto);
  }

  @Patch(':productId/prices/:priceId')
  @ApiOperation({ summary: 'Update product price (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updateProductPrice(
    @Param('priceId') priceId: string,
    @Body() dto: UpdateProductPriceDto,
  ) {
    return this.productsService.updateProductPrice(priceId, dto);
  }

  @Delete(':productId/prices/:priceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product price (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async deleteProductPrice(@Param('priceId') priceId: string) {
    await this.productsService.deleteProductPrice(priceId);
  }

  @Post(':productId/variants/:variantId/prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upsert variant price (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async upsertVariantPrice(
    @Param('variantId') variantId: string,
    @Body() dto: CreateVariantPriceDto,
  ) {
    return this.productsService.upsertVariantPrice(variantId, dto);
  }

  @Patch(':productId/variants/:variantId/prices/:priceId')
  @ApiOperation({ summary: 'Update variant price (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async updateVariantPrice(
    @Param('priceId') priceId: string,
    @Body() dto: UpdateVariantPriceDto,
  ) {
    return this.productsService.updateVariantPrice(priceId, dto);
  }

  @Delete(':productId/variants/:variantId/prices/:priceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete variant price (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async deleteVariantPrice(@Param('priceId') priceId: string) {
    await this.productsService.deleteVariantPrice(priceId);
  }

  @Patch(':productId/variants/:variantId')
  @ApiOperation({ summary: 'Update variant (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'variantId', description: 'Variant ID' })
  @ApiResponse({ status: 200, description: 'Variant updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  async updateVariant(
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(variantId, dto);
  }

  @Delete(':productId/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete variant (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'variantId', description: 'Variant ID' })
  @ApiResponse({ status: 204, description: 'Variant deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  async removeVariant(@Param('variantId') variantId: string) {
    await this.productsService.removeVariant(variantId);
  }
}

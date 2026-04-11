import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { PricingService } from '../pricing/pricing.service';
import { OrderStatus } from '../generated/prisma/enums';

const mockOrder = {
  id: 'order-1',
  userId: 'user-1',
  status: OrderStatus.PENDING_PAYMENT,
  items: [],
};

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<OrdersService>;
  let paymentsService: jest.Mocked<PaymentsService>;

  beforeEach(async () => {
    const mockOrdersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
    };
    const mockPaymentsService = {
      initiatePayment: jest.fn(),
    };
    const mockPricingService = {
      quoteStandard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: PricingService, useValue: mockPricingService },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    ordersService = module.get(OrdersService);
    paymentsService = module.get(PaymentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create an order', async () => {
      ordersService.create.mockResolvedValue(mockOrder as never);
      const user = { id: 'user-1' } as never;
      const dto = {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 1 }],
      };

      const result = await controller.create(user, dto as never);

      expect(ordersService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockOrder);
    });
  });

  describe('findAll', () => {
    it('should return list of orders', async () => {
      ordersService.findAll.mockResolvedValue([mockOrder] as never);
      const user = { id: 'user-1' } as never;

      const result = await controller.findAll(user);

      expect(ordersService.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockOrder]);
    });
  });

  describe('findOne', () => {
    it('should return order by id', async () => {
      ordersService.findOne.mockResolvedValue(mockOrder as never);
      const user = { id: 'user-1' } as never;

      const result = await controller.findOne(user, 'order-1');

      expect(ordersService.findOne).toHaveBeenCalledWith('user-1', 'order-1');
      expect(result).toEqual(mockOrder);
    });
  });

  describe('initiatePayment', () => {
    it('should call paymentsService.initiatePayment', async () => {
      paymentsService.initiatePayment.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/xxx',
        reference: 'ref-1',
      } as never);
      const user = { id: 'user-1' } as never;

      const result = await controller.initiatePayment(
        user,
        'order-1',
        {} as never,
      );

      expect(paymentsService.initiatePayment).toHaveBeenCalledWith(
        'order-1',
        'user-1',
        '',
      );
      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/xxx');
    });
  });
});

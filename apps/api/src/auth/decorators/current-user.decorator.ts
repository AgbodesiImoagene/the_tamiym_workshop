import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the current authenticated user from the request
 * Use with @CurrentUser() in controller methods
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

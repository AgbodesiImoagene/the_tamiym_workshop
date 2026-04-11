import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ObservabilityService } from './observability.service';

type RequestWithRoute = Request & {
  route?: {
    path?: string;
  };
};

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<RequestWithRoute>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      finalize(() => {
        const durationMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const route = request.route as { path?: string } | undefined;
        const routePath =
          route?.path != null
            ? `${request.method} ${request.baseUrl}${route.path}`
            : `${request.method} ${request.originalUrl ?? request.url}`;

        this.observability.recordHttpRequest({
          method: request.method,
          route: routePath,
          statusCode: response.statusCode,
          durationMs,
        });
      }),
    );
  }
}

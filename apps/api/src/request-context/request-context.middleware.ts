import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context.store';

type ContextRequest = Request & { id?: string };

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: ContextRequest, res: Response, next: NextFunction): void {
    const incomingRequestId = req.header('x-request-id');
    const requestId =
      typeof incomingRequestId === 'string' &&
      incomingRequestId.trim().length > 0
        ? incomingRequestId.trim()
        : (req.id ?? randomUUID());

    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    const routeSource =
      req.originalUrl?.includes('/admin/') ||
      req.originalUrl?.startsWith('/admin')
        ? 'ADMIN_API'
        : 'PUBLIC_API';

    runWithRequestContext(
      {
        requestId,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        source: routeSource,
      },
      next,
    );
  }
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserRole } from '../generated/prisma/client';
import { updateRequestContext } from './request-context.store';

interface RequestWithUser {
  originalUrl?: string;
  user?: {
    id?: string;
    role?: UserRole;
  };
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const actorRole = request.user?.role ?? null;
    const actorUserId = request.user?.id ?? null;
    const source =
      actorRole === UserRole.ADMIN
        ? 'ADMIN_API'
        : request.originalUrl?.includes('/webhooks/')
          ? 'WEBHOOK'
          : undefined;

    updateRequestContext({
      actorUserId,
      actorRole: actorRole ? String(actorRole) : null,
      source,
    });

    return next.handle();
  }
}

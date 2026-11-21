import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Reads the session when there is a valid one and never refuses the request (TTW-237).
 * Use it with `@Public()` on a route that treats a visitor and a signed-in user differently:
 * a missing, invalid or expired session is a visitor (`request.user` is `null`), not a 401.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false): TUser {
    return (user || null) as TUser;
  }
}

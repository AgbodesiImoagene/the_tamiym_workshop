import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttle per signed-in user instead of per IP (TTW-263): behind a shared address (office,
 * school, mobile carrier) many customers would otherwise share one small allowance. It runs
 * after the global JwtAuthGuard, so `req.user` is set; it falls back to the IP when not.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const id = (req.user as { id?: string } | undefined)?.id;
    return Promise.resolve(id ? `user:${id}` : String(req.ip ?? 'unknown'));
  }
}

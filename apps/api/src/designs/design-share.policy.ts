import { ModerationStatus } from '../generated/prisma/enums';

/** A bearer has a plausible length (cheap check before any database read). */
export function isShareTokenShape(token: string | undefined): token is string {
  return !!token && token.length >= 16 && token.length <= 128;
}

/**
 * A share link opens its design only while it exists, is not revoked, is not expired and
 * the design is approved. One rule for the shared design and for the images it uses, so
 * the two cannot drift (TTW-026, TTW-234).
 */
export function isShareLinkOpen(
  link:
    | {
        revokedAt: Date | null;
        expiresAt: Date;
        design: { moderationStatus: ModerationStatus };
      }
    | null
    | undefined,
  now: number = Date.now(),
): boolean {
  return (
    !!link &&
    !link.revokedAt &&
    link.expiresAt.getTime() > now &&
    link.design.moderationStatus === ModerationStatus.APPROVED
  );
}

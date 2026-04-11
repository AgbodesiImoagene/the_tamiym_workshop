import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ModerationStatus } from '../generated/prisma/enums';
import type {
  ModerationCategoryScores,
  ModerationInput,
  ModerationResult,
} from './moderation.types';

/**
 * AI-powered content moderation service backed by the OpenAI Moderation API
 * (model: omni-moderation-latest, supports text and images).
 *
 * Three-tier routing:
 *  - maxScore < APPROVE_THRESHOLD  → APPROVED  (auto-cleared, no human needed)
 *  - maxScore ≤ REJECT_THRESHOLD   → FLAGGED   (routed to human review queue)
 *  - maxScore > REJECT_THRESHOLD   → REJECTED  (auto-rejected, user notified)
 *
 * Graceful degradation: if OPENAI_API_KEY is absent or the API call fails,
 * the result is PENDING so the item still surfaces in the human review queue
 * rather than being silently auto-approved or auto-rejected.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly client: OpenAI | null;
  private readonly approveThreshold: number;
  private readonly rejectThreshold: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;

    this.approveThreshold = Number(
      this.config.get<string>('MODERATION_APPROVE_THRESHOLD') ?? '0.3',
    );
    this.rejectThreshold = Number(
      this.config.get<string>('MODERATION_REJECT_THRESHOLD') ?? '0.7',
    );

    if (
      !Number.isFinite(this.approveThreshold) ||
      this.approveThreshold < 0 ||
      this.approveThreshold > 1
    ) {
      this.logger.error(
        `MODERATION_APPROVE_THRESHOLD is invalid (${this.approveThreshold}); falling back to 0.3`,
      );
      this.approveThreshold = 0.3;
    }
    if (
      !Number.isFinite(this.rejectThreshold) ||
      this.rejectThreshold < 0 ||
      this.rejectThreshold > 1
    ) {
      this.logger.error(
        `MODERATION_REJECT_THRESHOLD is invalid (${this.rejectThreshold}); falling back to 0.7`,
      );
      this.rejectThreshold = 0.7;
    }

    if (!this.client) {
      this.logger.warn(
        'OPENAI_API_KEY not set — AI moderation disabled. All items will be queued for human review (PENDING).',
      );
    }
  }

  /**
   * Screen text and/or an image URL. Returns a ModerationResult with a
   * status, human-readable notes, and the max category score.
   */
  async moderate(input: ModerationInput): Promise<ModerationResult> {
    if (!this.client) {
      return this.fallback('AI moderation not configured');
    }

    if (!input.text && !input.imageUrl) {
      return this.fallback('No content provided for moderation');
    }

    try {
      // Build the multi-modal input array for omni-moderation-latest.
      // The model accepts an array of text/image_url items in a single call.
      const items: OpenAI.ModerationMultiModalInput[] = [];
      if (input.text) {
        items.push({ type: 'text', text: input.text });
      }
      if (input.imageUrl) {
        items.push({ type: 'image_url', image_url: { url: input.imageUrl } });
      }

      const response = await this.client.moderations.create({
        model: 'omni-moderation-latest',
        input: items,
      });

      // Aggregate: take the highest score across all result items (text + image).
      let maxScore = 0;
      const triggeredCategories: string[] = [];

      for (const result of response.results) {
        const scores = result.category_scores as ModerationCategoryScores;
        for (const [category, score] of Object.entries(scores)) {
          if (typeof score === 'number' && score > maxScore) {
            maxScore = score;
          }
          if (typeof score === 'number' && score > this.approveThreshold) {
            triggeredCategories.push(`${category}: ${score.toFixed(3)}`);
          }
        }
      }

      const notes =
        triggeredCategories.length > 0
          ? `Categories above threshold: ${triggeredCategories.join(', ')}`
          : 'No categories above threshold';

      const status = this.classify(maxScore);

      this.logger.log(
        `Moderation result: status=${status} maxScore=${maxScore.toFixed(3)} notes="${notes}"`,
      );

      return { status, notes, maxScore };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Moderation API call failed: ${message}`);
      // Degrade to PENDING so the item surfaces in the human review queue.
      return this.fallback(`AI call failed: ${message}`);
    }
  }

  /**
   * Convenience method for moderating plain text only (campaign descriptions, etc.).
   */
  async moderateText(text: string): Promise<ModerationResult> {
    return this.moderate({ text });
  }

  /**
   * Convenience method for moderating an image by URL.
   */
  async moderateImage(imageUrl: string): Promise<ModerationResult> {
    return this.moderate({ imageUrl });
  }

  // ---------------------------------------------------------------------------

  private classify(score: number): ModerationStatus {
    if (score < this.approveThreshold) return ModerationStatus.APPROVED;
    if (score > this.rejectThreshold) return ModerationStatus.REJECTED;
    return ModerationStatus.FLAGGED;
  }

  private fallback(reason: string): ModerationResult {
    return {
      status: ModerationStatus.PENDING,
      notes: reason,
      maxScore: 0,
    };
  }
}

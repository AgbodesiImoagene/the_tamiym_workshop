import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModerationService } from './moderation.service';
import { ModerationStatus } from '../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    MODERATION_APPROVE_THRESHOLD: '0.3',
    MODERATION_REJECT_THRESHOLD: '0.7',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => defaults[key]),
  } as unknown as ConfigService;
}

function makeMockOpenAI(maxScore: number) {
  // Build a synthetic category_scores object with a single entry at maxScore.
  const category_scores = { harassment: maxScore };
  return {
    moderations: {
      create: jest.fn().mockResolvedValue({
        results: [{ flagged: maxScore > 0.3, category_scores }],
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModerationService', () => {
  let service: ModerationService;

  async function buildService(
    configOverrides: Record<string, string> = {},
    withApiKey = true,
  ) {
    const config = makeConfig({
      ...(withApiKey ? { OPENAI_API_KEY: 'sk-test' } : {}),
      ...configOverrides,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    return module.get<ModerationService>(ModerationService);
  }

  describe('when OPENAI_API_KEY is not set', () => {
    it('returns PENDING (graceful degradation)', async () => {
      service = await buildService({}, false);
      const result = await service.moderateText('some text');
      expect(result.status).toBe(ModerationStatus.PENDING);
    });
  });

  describe('when no content is provided', () => {
    it('returns PENDING', async () => {
      service = await buildService();
      // Access private method indirectly via moderate({})
      const result = await (
        service as unknown as {
          moderate: (i: object) => Promise<{ status: ModerationStatus }>;
        }
      ).moderate({});
      expect(result.status).toBe(ModerationStatus.PENDING);
    });
  });

  describe('classify()', () => {
    it('returns APPROVED when score < approveThreshold', async () => {
      service = await buildService();
      // Inject a mock OpenAI client
      const mockClient = makeMockOpenAI(0.1);
      (service as unknown as { client: typeof mockClient }).client = mockClient;

      const result = await service.moderateText('clean text');
      expect(result.status).toBe(ModerationStatus.APPROVED);
      expect(result.maxScore).toBeCloseTo(0.1);
    });

    it('returns FLAGGED when score is in the ambiguous band', async () => {
      service = await buildService();
      const mockClient = makeMockOpenAI(0.5);
      (service as unknown as { client: typeof mockClient }).client = mockClient;

      const result = await service.moderateText('ambiguous text');
      expect(result.status).toBe(ModerationStatus.FLAGGED);
    });

    it('returns REJECTED when score > rejectThreshold', async () => {
      service = await buildService();
      const mockClient = makeMockOpenAI(0.9);
      (service as unknown as { client: typeof mockClient }).client = mockClient;

      const result = await service.moderateText('very bad text');
      expect(result.status).toBe(ModerationStatus.REJECTED);
    });
  });

  describe('custom thresholds', () => {
    it('respects MODERATION_APPROVE_THRESHOLD and MODERATION_REJECT_THRESHOLD', async () => {
      service = await buildService({
        MODERATION_APPROVE_THRESHOLD: '0.1',
        MODERATION_REJECT_THRESHOLD: '0.5',
      });
      const mockClient = makeMockOpenAI(0.4);
      (service as unknown as { client: typeof mockClient }).client = mockClient;

      // 0.4 > 0.1 (approve) and ≤ 0.5 (reject) → FLAGGED
      const result = await service.moderateText('text');
      expect(result.status).toBe(ModerationStatus.FLAGGED);
    });

    it('rejects when score exceeds custom reject threshold', async () => {
      service = await buildService({
        MODERATION_APPROVE_THRESHOLD: '0.1',
        MODERATION_REJECT_THRESHOLD: '0.5',
      });
      const mockClient = makeMockOpenAI(0.6);
      (service as unknown as { client: typeof mockClient }).client = mockClient;

      const result = await service.moderateText('text');
      expect(result.status).toBe(ModerationStatus.REJECTED);
    });
  });

  describe('API failure', () => {
    it('degrades to PENDING when the OpenAI call throws', async () => {
      service = await buildService();
      const mockClient = {
        moderations: {
          create: jest.fn().mockRejectedValue(new Error('network error')),
        },
      };
      (service as unknown as { client: typeof mockClient }).client = mockClient;

      const result = await service.moderateText('some text');
      expect(result.status).toBe(ModerationStatus.PENDING);
      expect(result.notes).toContain('AI call failed');
    });
  });

  describe('moderateImage()', () => {
    it('passes image_url item to the API', async () => {
      service = await buildService();
      const mockClient = makeMockOpenAI(0.05);
      (service as unknown as { client: typeof mockClient }).client = mockClient;

      await service.moderateImage('https://example.com/image.png');

      const callArg = mockClient.moderations.create.mock.calls[0][0];
      expect(callArg.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'image_url' }),
        ]),
      );
    });
  });

  describe('moderate() with both text and image', () => {
    it('aggregates scores across both items', async () => {
      service = await buildService();
      // Simulate text score = 0.1, image score = 0.8 (above reject threshold)
      const mockCreate = jest.fn().mockResolvedValue({
        results: [
          { flagged: false, category_scores: { harassment: 0.1 } },
          { flagged: true, category_scores: { sexual: 0.8 } },
        ],
      });
      (
        service as unknown as { client: { moderations: { create: jest.Mock } } }
      ).client = {
        moderations: { create: mockCreate },
      };

      const result = await service.moderate({
        text: 'clean',
        imageUrl: 'https://example.com/bad.png',
      });
      // Max score is 0.8 → REJECTED
      expect(result.status).toBe(ModerationStatus.REJECTED);
      expect(result.maxScore).toBeCloseTo(0.8);
    });
  });
});

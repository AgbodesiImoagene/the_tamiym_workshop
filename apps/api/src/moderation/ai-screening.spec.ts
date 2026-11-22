import { ModerationStatus } from '../generated/prisma/enums';
import {
  AI_SCREENING_OFF_NOTES,
  aiScreeningOffResult,
  isAiScreeningEnabled,
} from './ai-screening';

describe('AI screening setting (TTW-252)', () => {
  const configWith = (value: unknown) => ({ get: jest.fn(() => value) });

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['yes please', false],
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['1', true],
  ])('reads %j as %s', (value, expected) => {
    expect(isAiScreeningEnabled(configWith(value))).toBe(expected);
  });

  it('reads the AI_SCREENING_ENABLED key', () => {
    const config = configWith('true');
    isAiScreeningEnabled(config);
    expect(config.get).toHaveBeenCalledWith('AI_SCREENING_ENABLED');
  });

  it('answers with the result of an unavailable AI: PENDING, no score', () => {
    expect(aiScreeningOffResult()).toEqual({
      status: ModerationStatus.PENDING,
      notes: AI_SCREENING_OFF_NOTES,
      maxScore: 0,
    });
    expect(AI_SCREENING_OFF_NOTES).toBe('AI screening is turned off');
  });
});

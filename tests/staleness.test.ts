import { describe, expect, it } from 'vitest';
import { ageGroupKey, staleStage } from '../src/lib/model/staleness';

const DAY = 86_400_000;
const now = 1_800_000_000_000;

describe('staleStage', () => {
  it('bands by days since touched', () => {
    expect(staleStage(now, now)).toBe(0);
    expect(staleStage(now - 6 * DAY, now)).toBe(0);
    expect(staleStage(now - 7 * DAY, now)).toBe(1);
    expect(staleStage(now - 14 * DAY, now)).toBe(2);
    expect(staleStage(now - 45 * DAY, now)).toBe(3);
  });
  it('never goes negative for future timestamps', () => {
    expect(staleStage(now + DAY, now)).toBe(0);
  });
});

describe('ageGroupKey', () => {
  it('groups by age', () => {
    expect(ageGroupKey(now, now)).toBe('today');
    expect(ageGroupKey(now - 3 * DAY, now)).toBe('week');
    expect(ageGroupKey(now - 10 * DAY, now)).toBe('fortnight');
    expect(ageGroupKey(now - 20 * DAY, now)).toBe('month');
    expect(ageGroupKey(now - 90 * DAY, now)).toBe('old');
  });
});

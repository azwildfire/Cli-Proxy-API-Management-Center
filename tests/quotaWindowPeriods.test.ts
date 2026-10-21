import { describe, expect, test } from 'bun:test';
import { antigravityPeriodHours, buildAntigravityQuotaGroups } from '@/utils/quota/builders';
import { buildTimelineLane, projectLane } from '@/features/quota/quotaTimelineModel';

describe('antigravityPeriodHours', () => {
  test('keeps the Antigravity spellings', () => {
    expect(antigravityPeriodHours('5h')).toBe(5);
    expect(antigravityPeriodHours('five-hour')).toBe(5);
    expect(antigravityPeriodHours('five_hour')).toBe(5);
    expect(antigravityPeriodHours('weekly')).toBe(168);
    expect(antigravityPeriodHours('Week')).toBe(168);
  });

  test('accepts named periods used by plugins', () => {
    expect(antigravityPeriodHours('daily')).toBe(24);
    expect(antigravityPeriodHours('monthly')).toBe(720);
    expect(antigravityPeriodHours('yearly')).toBe(8760);
  });

  test('accepts exact durations such as a billing period or calendar month', () => {
    expect(antigravityPeriodHours('30d')).toBe(720);
    expect(antigravityPeriodHours('31d')).toBe(744);
    expect(antigravityPeriodHours('720h')).toBe(720);
    expect(antigravityPeriodHours('2w')).toBe(336);
    expect(antigravityPeriodHours(' 1.5 days ')).toBe(36);
  });

  test('rejects text that is not a period', () => {
    expect(antigravityPeriodHours(undefined)).toBeNull();
    expect(antigravityPeriodHours('')).toBeNull();
    expect(antigravityPeriodHours('allowance')).toBeNull();
    expect(antigravityPeriodHours('premium_interactions')).toBeNull();
    expect(antigravityPeriodHours('0d')).toBeNull();
    expect(antigravityPeriodHours('30x')).toBeNull();
  });
});

describe('plugin buckets with exact windows', () => {
  const payload = {
    groups: [
      {
        displayName: 'Plan allowance',
        buckets: [
          {
            window: '30d',
            remainingFraction: 0.96,
            resetTime: '2026-10-29T06:58:24Z',
            description: '$57.54 of $60.00 included usage remaining',
          },
          {
            window: 'allowance',
            remainingFraction: 0.5,
            resetTime: '2026-10-29T06:58:24Z',
          },
        ],
      },
    ],
  };

  test('carry a period so the timeline can draw them', () => {
    const groups = buildAntigravityQuotaGroups(payload);
    expect(groups).toHaveLength(1);
    const [exact, unknown] = groups[0].buckets;
    expect(exact.periodHours).toBe(720);
    expect(exact.resetAtMs).toBe(Date.parse('2026-10-29T06:58:24Z'));
    expect(unknown.periodHours).toBeNull();
  });

  test('project a live window on the weekly timeline', () => {
    const groups = buildAntigravityQuotaGroups(payload);
    const lane = buildTimelineLane({
      name: 'ollama-cloud-example.json',
      displayName: 'ollama-cloud-example.json',
      provider: 'plugin',
      quota: { status: 'success', groups },
      maxPeriodHours: 14 * 24,
    });
    expect(lane.anchorMs).toBe(Date.parse('2026-10-29T06:58:24Z'));
    expect(lane.periodHours).toBe(720);
    expect(lane.remaining).toBe(96);

    const now = Date.parse('2026-10-20T12:00:00Z');
    const spanStart = Date.parse('2026-10-18T00:00:00Z');
    const spanEnd = Date.parse('2026-11-01T00:00:00Z');
    const windows = projectLane(lane, spanStart, spanEnd, now, 'weekly');
    expect(windows.length).toBeGreaterThan(0);
    const live = windows.find((window) => window.state === 'live');
    expect(live).toBeDefined();
    expect(live?.endMs).toBe(Date.parse('2026-10-29T06:58:24Z'));
    expect(live?.remaining).toBe(96);
  });
});

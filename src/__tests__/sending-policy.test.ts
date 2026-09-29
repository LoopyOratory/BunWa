import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  SendingPolicyService,
  parseQuietHours,
  quietHoursRemainingMs,
  warmupFactor,
} from '../core/sending-policy/sending-policy.service';
import { TooManyRequestsException } from '../core/exceptions';

/**
 * The anti-ban sending policy: sliding-window caps, reachout timelock for
 * never-written chats, new-chat quota, warm-up ramp and quiet hours. A fake
 * clock makes every window deterministic; a temp directory keeps the SQLite
 * state off disk-shared paths.
 */

function fakeClock(start = 1_700_000_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ENV_KEYS = [
  'SEND_POLICY_ENABLED',
  'SEND_POLICY_BYPASS_SESSIONS',
  'SEND_MAX_PER_MINUTE',
  'SEND_MAX_PER_HOUR',
  'SEND_MAX_PER_DAY',
  'REACHOUT_MIN_INTERVAL_SECONDS',
  'NEW_CHATS_PER_DAY',
  'SEND_QUIET_HOURS',
  'SEND_WARMUP_DAYS',
  'SEND_WARMUP_FLOOR_PERCENT',
] as const;

function withEnv(env: Record<string, string>, fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
  }
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  try {
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function makeService(clock: ReturnType<typeof fakeClock>): SendingPolicyService {
  const dir = mkdtempSync(join(tmpdir(), 'bunwa-policy-'));
  return new SendingPolicyService(dir, clock.now);
}

function expectThrown(fn: () => void): TooManyRequestsException {
  try {
    fn();
  } catch (error) {
    expect(error instanceof TooManyRequestsException).toBe(true);
    return error as TooManyRequestsException;
  }
  throw new Error('Expected assertSendAllowed to throw TooManyRequestsException');
}

// Warm-up neutralised so each test isolates one control
const NO_WARMUP = { SEND_WARMUP_FLOOR_PERCENT: '100' };

describe('sending policy: volume caps', () => {
  it('blocks sends over the per-minute cap and lifts it when the window slides', () => {
    withEnv({ SEND_MAX_PER_MINUTE: '3', ...NO_WARMUP }, () => {
      const clock = fakeClock();
      const policy = makeService(clock);
      for (let i = 0; i < 3; i++) {
        policy.assertSendAllowed('s1', 'chat@c.us');
        policy.recordSend('s1', 'chat@c.us');
      }
      const err = expectThrown(() => policy.assertSendAllowed('s1', 'chat@c.us'));
      expect(err.reason).toContain('minute');
      expect(err.retryAfterMs).toBeGreaterThan(59_000);
      expect(err.retryAfterMs).toBeLessThanOrEqual(60_000);

      clock.advance(60_001);
      policy.assertSendAllowed('s1', 'chat@c.us');
    });
  });

  it('blocks sends over the per-hour cap', () => {
    withEnv(
      {
        SEND_MAX_PER_HOUR: '2',
        SEND_MAX_PER_MINUTE: '100',
        REACHOUT_MIN_INTERVAL_SECONDS: '0',
        NEW_CHATS_PER_DAY: '100',
        ...NO_WARMUP,
      },
      () => {
        const clock = fakeClock();
        const policy = makeService(clock);
        const chats = ['a@c.us', 'b@c.us', 'c@c.us'];
        for (const chat of chats.slice(0, 2)) {
          policy.assertSendAllowed('s1', chat);
          policy.recordSend('s1', chat);
        }
        const err = expectThrown(() => policy.assertSendAllowed('s1', chats[2]));
        expect(err.reason).toContain('hour');
        expect(err.retryAfterMs).toBeLessThanOrEqual(3_600_000);
      },
    );
  });

  it('blocks sends over the per-day cap', () => {
    withEnv(
      {
        SEND_MAX_PER_DAY: '2',
        SEND_MAX_PER_MINUTE: '100',
        SEND_MAX_PER_HOUR: '100',
        REACHOUT_MIN_INTERVAL_SECONDS: '0',
        NEW_CHATS_PER_DAY: '100',
        ...NO_WARMUP,
      },
      () => {
        const clock = fakeClock();
        const policy = makeService(clock);
        for (const chat of ['a@c.us', 'b@c.us']) {
          policy.assertSendAllowed('s1', chat);
          policy.recordSend('s1', chat);
        }
        const err = expectThrown(() => policy.assertSendAllowed('s1', 'c@c.us'));
        expect(err.reason).toContain('day');
        clock.advance(86_400_001);
        policy.assertSendAllowed('s1', 'c@c.us');
      },
    );
  });
});

describe('sending policy: reachout timelock', () => {
  const REACHOUT_ENV = {
    REACHOUT_MIN_INTERVAL_SECONDS: '60',
    SEND_MAX_PER_MINUTE: '100',
    NEW_CHATS_PER_DAY: '100',
    ...NO_WARMUP,
  };

  it('paces messages to distinct never-written chats', () => {
    withEnv(REACHOUT_ENV, () => {
      const clock = fakeClock();
      const policy = makeService(clock);

      // First cold outreach is fine
      policy.assertSendAllowed('s1', 'a@c.us');
      policy.recordSend('s1', 'a@c.us');

      // A different never-written chat within the interval is blocked
      const err = expectThrown(() => policy.assertSendAllowed('s1', 'b@c.us'));
      expect(err.retryAfterMs).toBeGreaterThan(59_000);
      expect(err.retryAfterMs).toBeLessThanOrEqual(60_000);

      // Once the interval passes, the next chat is allowed
      clock.advance(60_001);
      policy.assertSendAllowed('s1', 'b@c.us');
      policy.recordSend('s1', 'b@c.us');

      // Volume to an already-written chat is never timelocked
      clock.advance(1);
      policy.assertSendAllowed('s1', 'a@c.us');

      // The next distinct new chat waits again, measured from the last cold send
      const err2 = expectThrown(() => policy.assertSendAllowed('s1', 'c@c.us'));
      expect(err2.retryAfterMs).toBeGreaterThan(59_000);
    });
  });

  it('counts a failed cold-outreach attempt toward the timelock, same chat can retry', () => {
    withEnv(REACHOUT_ENV, () => {
      const clock = fakeClock();
      const policy = makeService(clock);

      policy.assertSendAllowed('s1', 'a@c.us');
      // The send to a@c.us failed: record the attempt
      policy.recordSend('s1', 'a@c.us', true);

      // Another new chat is still paced from the attempt
      const err = expectThrown(() => policy.assertSendAllowed('s1', 'b@c.us'));
      expect(err.retryAfterMs).toBeGreaterThan(0);

      // Retrying the same chat is not a distinct cold outreach
      policy.assertSendAllowed('s1', 'a@c.us');

      // But it counts toward the caps (conservative by design)
      const usage = policy.getUsage('s1');
      expect(usage.counts.lastMinute).toBe(1);
    });
  });
});

describe('sending policy: new-chat daily quota', () => {
  it('limits first-time chats per day without touching known chats', () => {
    withEnv(
      {
        NEW_CHATS_PER_DAY: '2',
        REACHOUT_MIN_INTERVAL_SECONDS: '0',
        SEND_MAX_PER_MINUTE: '100',
        ...NO_WARMUP,
      },
      () => {
        const clock = fakeClock();
        const policy = makeService(clock);
        for (const chat of ['a@c.us', 'b@c.us']) {
          policy.assertSendAllowed('s1', chat);
          policy.recordSend('s1', chat);
        }
        const err = expectThrown(() => policy.assertSendAllowed('s1', 'c@c.us'));
        expect(err.reason).toContain('quota');

        // Existing chats are unaffected
        policy.assertSendAllowed('s1', 'a@c.us');

        // The quota is daily
        clock.advance(86_400_001);
        policy.assertSendAllowed('s1', 'c@c.us');
      },
    );
  });
});

describe('sending policy: warm-up ramp', () => {
  it('scales caps from the floor to 100% over the ramp', () => {
    expect(warmupFactor(0, 0, { warmupDays: 14, warmupFloorPercent: 20 })).toBeCloseTo(0.2);
    expect(warmupFactor(7 * 86_400_000, 0, { warmupDays: 14, warmupFloorPercent: 20 })).toBeCloseTo(0.6);
    expect(warmupFactor(14 * 86_400_000, 0, { warmupDays: 14, warmupFloorPercent: 20 })).toBeCloseTo(1);
    expect(warmupFactor(40 * 86_400_000, 0, { warmupDays: 14, warmupFloorPercent: 20 })).toBeCloseTo(1);
    // No first-seen yet: no scaling
    expect(warmupFactor(0, null, {})).toBe(1);
  });

  it('starts a fresh session at the floor and lifts it as the session ages', () => {
    withEnv({ SEND_MAX_PER_MINUTE: '10', REACHOUT_MIN_INTERVAL_SECONDS: '0' }, () => {
      const clock = fakeClock();
      const policy = makeService(clock);

      // Floor of 20% of 10 = 2 sends per minute on day 0
      policy.assertSendAllowed('s1', 'a@c.us');
      policy.recordSend('s1', 'a@c.us');
      policy.assertSendAllowed('s1', 'a@c.us');
      policy.recordSend('s1', 'a@c.us');
      expectThrown(() => policy.assertSendAllowed('s1', 'a@c.us'));

      // Two weeks later the full cap applies
      clock.advance(15 * 86_400_000);
      for (let i = 0; i < 10; i++) {
        policy.assertSendAllowed('s1', 'a@c.us');
        policy.recordSend('s1', 'a@c.us');
      }
      expectThrown(() => policy.assertSendAllowed('s1', 'a@c.us'));
    });
  });

  it('persists the first-seen date across service restarts', () => {
    withEnv({ SEND_MAX_PER_MINUTE: '100', REACHOUT_MIN_INTERVAL_SECONDS: '0' }, () => {
      const clock = fakeClock();
      const dir = mkdtempSync(join(tmpdir(), 'bunwa-policy-'));
      const first = new SendingPolicyService(dir, clock.now);
      first.recordSend('s1', 'a@c.us');
      const firstSeen = first.getUsage('s1').warmup.firstSeenAt;

      clock.advance(3 * 86_400_000);
      const second = new SendingPolicyService(dir, clock.now);
      const usage = second.getUsage('s1');
      expect(usage.warmup.firstSeenAt).toBe(firstSeen);
      expect(usage.warmup.ageDays).toBeCloseTo(3, 1);
      first.destroy();
      second.destroy();
    });
  });
});

describe('sending policy: quiet hours', () => {
  function windowCovering(now: number, beforeMin: number, afterMin: number): string {
    const d = new Date(now);
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const start = (nowMin - beforeMin + 1440) % 1440;
    const end = (nowMin + afterMin) % 1440;
    return `${fmt(start)}-${fmt(end)}`;
  }

  it('blocks sends inside the window with a retry time at the window end', () => {
    withEnv({ SEND_QUIET_HOURS: windowCovering(1_700_000_000_000, 5, 30) }, () => {
      const clock = fakeClock(1_700_000_000_000);
      const policy = makeService(clock);
      const err = expectThrown(() => policy.assertSendAllowed('s1', 'a@c.us'));
      expect(err.reason).toContain('Quiet hours');
      expect(err.retryAfterMs).toBeGreaterThan(0);
      expect(err.retryAfterMs).toBeLessThanOrEqual(30 * 60_000 + 1_000);
    });
  });

  it('allows sends outside the window', () => {
    // Window that ended 5 minutes ago (wrap-safe arithmetic)
    const d = new Date(1_700_000_000_000);
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const start = (nowMin - 40 + 1440) % 1440;
    const end = (nowMin - 5 + 1440) % 1440;
    withEnv({ SEND_QUIET_HOURS: `${fmt(start)}-${fmt(end)}`, ...NO_WARMUP }, () => {
      const clock = fakeClock(1_700_000_000_000);
      const policy = makeService(clock);
      policy.assertSendAllowed('s1', 'a@c.us');
    });
  });

  it('treats an empty or malformed window as off', () => {
    expect(parseQuietHours('')).toBe(null);
    expect(parseQuietHours(undefined)).toBe(null);
    expect(parseQuietHours('99:00-10:00')).toBe(null);
    expect(parseQuietHours('22:00-06:00')).toEqual({ start: 22 * 60, end: 6 * 60 });
    expect(quietHoursRemainingMs('', 0)).toBe(0);
    expect(quietHoursRemainingMs('nonsense', 0)).toBe(0);
  });
});

describe('sending policy: switches and overrides', () => {
  it('never gates bypassed sessions', () => {
    withEnv(
      {
        SEND_POLICY_BYPASS_SESSIONS: 'safe, other',
        SEND_MAX_PER_MINUTE: '1',
        ...NO_WARMUP,
      },
      () => {
        const clock = fakeClock();
        const policy = makeService(clock);
        for (let i = 0; i < 5; i++) {
          policy.recordSend('safe', 'a@c.us');
          policy.recordSend('s1', 'a@c.us');
        }
        policy.assertSendAllowed('safe', 'a@c.us');
        expectThrown(() => policy.assertSendAllowed('s1', 'a@c.us'));
      },
    );
  });

  it('respects the global off-switch', () => {
    withEnv({ SEND_POLICY_ENABLED: 'false', SEND_MAX_PER_MINUTE: '1' }, () => {
      const clock = fakeClock();
      const policy = makeService(clock);
      for (let i = 0; i < 5; i++) {
        policy.recordSend('s1', 'a@c.us');
      }
      policy.assertSendAllowed('s1', 'a@c.us');
    });
  });

  it('lets per-session overrides take precedence over env defaults', () => {
    withEnv({ SEND_MAX_PER_MINUTE: '100', ...NO_WARMUP }, () => {
      const clock = fakeClock();
      const policy = makeService(clock);
      policy.setOverrides('s1', { maxPerMinute: 2, quietHours: '' });
      expect(policy.getOverrides('s1').maxPerMinute).toBe(2);

      policy.recordSend('s1', 'a@c.us');
      policy.recordSend('s1', 'a@c.us');
      expectThrown(() => policy.assertSendAllowed('s1', 'a@c.us'));
      clock.advance(60_001);
      policy.assertSendAllowed('s1', 'a@c.us');
    });
  });

  it('reports usage counters and next-allowed times', () => {
    withEnv({ SEND_MAX_PER_MINUTE: '5', REACHOUT_MIN_INTERVAL_SECONDS: '60', ...NO_WARMUP }, () => {
      const clock = fakeClock();
      const policy = makeService(clock);
      policy.recordSend('s1', 'a@c.us');
      const usage = policy.getUsage('s1');
      expect(usage.counts.lastMinute).toBe(1);
      expect(usage.counts.newChatsLastDay).toBe(1);
      expect(usage.nextAllowedAt.minuteCap).toBe(null);
      expect(usage.nextAllowedAt.reachout).not.toBe(null);

      policy.recordSend('s1', 'a@c.us');
      policy.recordSend('s1', 'a@c.us');
      policy.recordSend('s1', 'a@c.us');
      policy.recordSend('s1', 'a@c.us');
      const usage2 = policy.getUsage('s1');
      expect(usage2.counts.lastMinute).toBe(5);
      expect(usage2.nextAllowedAt.minuteCap).not.toBe(null);
    });
  });
});

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BudgetCheck = { ok: true } | { ok: false; retryAfterSeconds: number };

type BudgetState = { day: string; usedChars: number };

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Global daily ceiling for paid HeyGen characters. Characters are reserved
 * before the provider call and never refunded, because a failed or aborted
 * request may still be billed. With a file path the counter survives machine
 * restarts; an unreadable file fails closed instead of resetting to zero.
 */
export class DailyCharBudget {
  private state: BudgetState;
  private failedClosed = false;

  constructor(
    private readonly maxCharsPerDay: number,
    private readonly filePath?: string,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.state = { day: utcDay(this.nowMs()), usedChars: 0 };
    if (!filePath) return;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
      const fields = parsed as Partial<BudgetState> | null;
      if (
        !fields ||
        typeof fields.day !== 'string' ||
        typeof fields.usedChars !== 'number' ||
        !Number.isInteger(fields.usedChars) ||
        fields.usedChars < 0
      ) {
        this.failedClosed = true;
        return;
      }
      this.state = { day: fields.day, usedChars: fields.usedChars };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') this.failedClosed = true;
    }
  }

  reserve(chars: number): BudgetCheck {
    const now = this.nowMs();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((Math.floor(now / DAY_MS) * DAY_MS + DAY_MS - now) / 1000),
    );
    if (this.failedClosed || this.maxCharsPerDay <= 0) {
      return { ok: false, retryAfterSeconds };
    }
    const today = utcDay(now);
    const used = this.state.day === today ? this.state.usedChars : 0;
    if (used + chars > this.maxCharsPerDay) {
      return { ok: false, retryAfterSeconds };
    }
    const next = { day: today, usedChars: used + chars };
    if (this.filePath) {
      try {
        mkdirSync(dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
        renameSync(tmp, this.filePath);
      } catch {
        this.failedClosed = true;
        return { ok: false, retryAfterSeconds };
      }
    }
    this.state = next;
    return { ok: true };
  }
}

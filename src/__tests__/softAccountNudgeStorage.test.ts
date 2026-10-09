import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SOFT_ACCOUNT_NUDGE_KEY,
  clearSoftAccountNudge,
  dismissSoftAccountNudge,
  isSoftAccountNudgeDismissed,
} from '../lib/softAccountNudgeStorage';

describe('softAccountNudgeStorage', () => {
  beforeEach(() => {
    clearSoftAccountNudge();
  });

  afterEach(() => {
    clearSoftAccountNudge();
  });

  it('empieza sin dismiss y recuerda Más tarde una vez por dispositivo', () => {
    expect(isSoftAccountNudgeDismissed()).toBe(false);
    dismissSoftAccountNudge();
    expect(isSoftAccountNudgeDismissed()).toBe(true);
    const raw = localStorage.getItem(SOFT_ACCOUNT_NUDGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).dismissed).toBe(true);
  });

  it('clear vuelve a permitir el nudge', () => {
    dismissSoftAccountNudge();
    clearSoftAccountNudge();
    expect(isSoftAccountNudgeDismissed()).toBe(false);
  });
});

/** Clave de dismiss del soft nudge post-valor (una vez por dispositivo). */
export const SOFT_ACCOUNT_NUDGE_KEY = 'mam-soft-account-nudge';

type SoftAccountNudgeState = {
  dismissed: true;
  dismissedAt: number;
};

export function isSoftAccountNudgeDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SOFT_ACCOUNT_NUDGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<SoftAccountNudgeState>;
    return parsed.dismissed === true;
  } catch {
    return false;
  }
}

export function dismissSoftAccountNudge(): void {
  if (typeof localStorage === 'undefined') return;
  const payload: SoftAccountNudgeState = {
    dismissed: true,
    dismissedAt: Date.now(),
  };
  try {
    localStorage.setItem(SOFT_ACCOUNT_NUDGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode: silently skip.
  }
}

export function clearSoftAccountNudge(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SOFT_ACCOUNT_NUDGE_KEY);
}

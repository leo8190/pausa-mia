/** Respect browser opt-out before generating an identifier or sending usage data. */
export function isUsageTrackingExcluded(
  preferences: {
    doNotTrack?: string | null;
    globalPrivacyControl?: boolean;
  } = typeof navigator === 'undefined' ? {} : navigator,
): boolean {
  return preferences.doNotTrack === '1' || preferences.globalPrivacyControl === true;
}

/** A bounded, best-effort revocation before deleting local account data.
 * Never return provider errors, account identifiers or tokens to the browser.
 */
export async function revokeGoogleAccountsBeforeDeletion(
  linkedAccounts,
  revoke,
  timeoutMs = 5000,
) {
  const googleLinks = linkedAccounts.filter(
    (entry) =>
      entry.provider === 'google_calendar' || entry.provider === 'google_drive',
  );
  if (googleLinks.length === 0) return 'not_linked';

  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const results = await Promise.race([
      deadline,
      Promise.all(
        googleLinks.map(async (linked) => {
          // A previous local disconnect is not proof of remote revocation.
          if (!linked.tokenCiphertext) return false;
          try {
            const result = await revoke(linked, { signal: controller.signal });
            return result?.ok === true;
          } catch {
            return false;
          }
        }),
      ),
    ]);
    return results?.every(Boolean) ? 'revoked' : 'unconfirmed';
  } finally {
    clearTimeout(timer);
  }
}

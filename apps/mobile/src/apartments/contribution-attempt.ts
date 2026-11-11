// Per-form memory only. Entry creation and record submission are separate
// intents: changing a code after a partial private save must reuse its entry.
export function createContributionAttempt(makeKey: () => string) {
  let live = true,
    active = false;
  let entry: { fingerprint: string; key: string } | null = null;
  let record: { fingerprint: string; key: string } | null = null;
  return {
    begin(entryFingerprint: string, recordFingerprint: string) {
      if (!live || active) return null;
      active = true;
      if (entry?.fingerprint !== entryFingerprint) {
        entry = { fingerprint: entryFingerprint, key: makeKey() };
        record = null;
      }
      if (record?.fingerprint !== recordFingerprint)
        record = { fingerprint: recordFingerprint, key: makeKey() };
      return { entryKey: entry.key, recordKey: record.key };
    },
    finish(committed = false) {
      active = false;
      if (committed) {
        live = false;
        entry = null;
        record = null;
      }
    },
    dispose() {
      live = false;
      active = false;
      entry = null;
      record = null;
    },
  };
}

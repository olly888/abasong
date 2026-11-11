// An old writable snapshot does not authorize a new foreground lifecycle.
export function createConversationAccess() {
  let epoch = 0;
  let ready = false;
  let writable = false;
  return {
    begin() {
      ready = false;
      writable = false;
      return ++epoch;
    },
    invalidate() {
      ready = false;
      writable = false;
      ++epoch;
    },
    accept(version: number, canSend: boolean) {
      if (version !== epoch) return false;
      ready = true;
      writable = canSend;
      return true;
    },
    revoke(version: number) {
      if (version === epoch) {
        ready = false;
        writable = false;
      }
    },
    canSend(version: number) {
      return version === epoch && ready && writable;
    },
  };
}

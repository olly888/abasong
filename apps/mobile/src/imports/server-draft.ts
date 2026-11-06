import { randomUUID } from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import { dataRequest } from "../apartments/client";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { ImportDraft } from "./server-draft-core";
// Normal imports retain the authenticated dataRequest adapter. The core is also
// exercised against the isolated real API, not a second implementation.
export class ServerDraft extends ImportDraft {
  constructor(
    session: Session,
    signal: AbortSignal,
    transport?: ContributionRequest,
  ) {
    super(
      transport ?? ((path, options) => dataRequest(session, path, options)),
      signal,
      randomUUID,
    );
  }
}

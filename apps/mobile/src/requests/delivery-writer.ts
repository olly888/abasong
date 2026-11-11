import type { components } from "@abasong/contracts";
import type { ContributionRequest } from "../apartments/contribution-address-search";
type S = components["schemas"];
export type DeliveryTeamIntent = {
  id: string;
  version: number;
  name: string;
} | null;
// One writer per open editor. Retries after a lost create/publish response use
// the same idempotency key; a successful create isn't repeated after publish fails.
export function createDeliveryWriter(
  request: ContributionRequest,
  makeKey: () => string,
  initial: S["RequestDetailV2"] | null = null,
) {
  let current = initial,
    savedSignature = "";
  const keys = new Map<string, string>();
  const key = (signature: string) => {
    if (!keys.has(signature)) keys.set(signature, makeKey());
    return keys.get(signature)!;
  };
  return {
    current: () => current,
    async save(
      body: S["RequestDraftInputV2"],
      publish: boolean,
      team?: DeliveryTeamIntent,
    ) {
      const draftFields =
        team === undefined || (current && current.status !== "draft")
          ? body
          : { ...body, organization_id: team?.id ?? null };
      const signature = JSON.stringify(draftFields);
      if (savedSignature !== signature) {
        if (!current)
          current = await request<S["RequestDetailV2"]>("/v1/requests", {
            method: "POST",
            body: team === null ? body : draftFields,
            key: key("create:" + signature),
          });
        else {
          const { scenario: _scenario, ...fields } = draftFields;
          void _scenario;
          // Leave unchanged schedule fields out so the service preserves the original start.
          const sameStart =
            body.handoff_mode === "asap" ||
            (body.starts_at &&
              current.starts_at &&
              Math.floor(Date.parse(body.starts_at) / 60000) ===
                Math.floor(Date.parse(current.starts_at) / 60000));
          if (
            current.status !== "draft" &&
            body.handoff_mode === current.handoff_mode &&
            body.handoff_date === current.handoff_date &&
            sameStart
          ) {
            delete fields.starts_at;
            delete fields.handoff_date;
            delete fields.handoff_mode;
          }
          current = await request<S["RequestDetailV2"]>(
            `/v1/requests/${current.id}`,
            {
              method: "PATCH",
              body: { ...fields, expected_version: current.version },
            },
          );
        }
        savedSignature = signature;
      }
      if (publish && current!.status === "draft")
        current = await request<S["RequestDetailV2"]>(
          `/v1/requests/${current!.id}/publish`,
          {
            method: "POST",
            body: {
              expected_version: current!.version,
              ...(team ? { expected_team_version: team.version } : {}),
            },
            key: key(
              `publish:${current!.id}:${current!.version}:${team?.version ?? ""}`,
            ),
          },
        );
      return current!;
    },
  };
}

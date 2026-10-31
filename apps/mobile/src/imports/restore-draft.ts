import type { Candidate } from "./ImportScreen";
import type { ServerDraft } from "./server-draft";
// Restored fields/results only: no photo URI, made-up image metadata or source
// declaration survives process loss. All targets are re-read under this session.
export async function restoreDraftView(
  client: Pick<ServerDraft, "restore" | "apartment" | "batch">,
  id: string,
) {
  const found = await client.restore(id),
    rows: Candidate[] = [];
  for (const item of found) {
    if (item.state === "removed") continue;
    const row: Candidate = {
      id: item.id,
      sourceId: item.source_ids[0] ?? "",
      address: item.address_text,
      value: item.value,
      scope: item.scope.label ?? "门别未注明",
      issues: [...item.issues],
      target: null,
      selected: false,
      revision: item.revision,
    };
    if (item.apartment_id) {
      row.target = await client.apartment(item.apartment_id);
      if (!row.target) row.issues.push("公寓已不可用，请重新选择");
    }
    const result = item.commit_result;
    if (result) {
      row.privateId = result.private_record_id ?? undefined;
      row.shared = ["active", "pending", "same_value"].includes(
        result.share_status,
      );
      row.status =
        result.private_status === "failed" || result.share_status === "failed"
          ? "failed"
          : result.share_status === "pending"
            ? "pending"
            : result.share_status === "same_value"
              ? "same_value"
              : result.share_status === "active"
                ? "active"
                : "private_saved";
    }
    row.selected =
      (!item.apartment_id || !!row.target) &&
      (item.state === "ready" || item.state === "failed");
    rows.push(row);
  }
  if (!client.batch) throw new Error("无法恢复草稿，请重试");
  return {
    rows,
    mode: client.batch.mode,
    locked: client.batch.mode_locked,
    restartRequired: rows.length === 0,
  };
}

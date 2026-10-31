import { describe, expect, it, vi } from "vitest";
import type { components } from "@abasong/contracts";
import { restoreDraftView } from "./restore-draft";
type S = components["schemas"];
const item: S["ImportCandidate"] = {
  id: "TEST-candidate",
  revision: 3,
  source_ids: ["TEST-source"],
  address_text: "42 TEST Ave, Test City, CA 90000",
  apartment_id: null,
  method: "keypad",
  value: "00TEST#*",
  scope: { label: "TEST side gate" },
  issues: [],
  state: "ready",
  confirmation_revision: 3,
};
const batch = { mode: "private_only", mode_locked: false } as S["ImportBatch"];
const client = (rows: S["ImportCandidate"][]) => ({
  batch,
  restore: vi.fn(async () => rows),
  apartment: vi.fn(async () => null as S["Apartment"] | null),
});
describe("post-process-loss import view", () => {
  it("turns a source-only draft into explicit reselection without creating a replacement", async () => {
    const c = client([]),
      view = await restoreDraftView(c, "TEST-batch");
    expect(view).toMatchObject({
      rows: [],
      restartRequired: true,
      locked: false,
      mode: "private_only",
    });
    expect(c.apartment).not.toHaveBeenCalled();
    expect(c.restore).toHaveBeenCalledTimes(1);
  });
  it("also handles all-removed candidate drafts without resurrecting removed values", async () => {
    const c = client([{ ...item, state: "removed" }]);
    expect((await restoreDraftView(c, "TEST-batch")).restartRequired).toBe(
      true,
    );
  });
  it("restores exact saved strings and scope with no invented screenshot URI or metadata", async () => {
    const view = await restoreDraftView(client([item]), "TEST-batch");
    expect(view.rows[0]).toMatchObject({
      id: item.id,
      value: "00TEST#*",
      scope: "TEST side gate",
      selected: true,
      revision: 3,
    });
    expect(view.rows[0]).not.toHaveProperty("uri");
    expect(view.rows[0]).not.toHaveProperty("bytes");
    expect(view.restartRequired).toBe(false);
  });
  it("restores other rows when a previous apartment is unavailable and clears that row selection", async () => {
    const c = client([
      { ...item, apartment_id: "TEST-removed" },
      { ...item, id: "TEST-other" },
    ]);
    const view = await restoreDraftView(c, "TEST-batch");
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0].selected).toBe(false);
    expect(view.rows[0].issues).toContain("公寓已不可用，请重新选择");
    expect(view.rows[1].selected).toBe(true);
    expect(item.issues).toEqual([]);
  });
  it("restores durable private success/share failure while preserving locked intent", async () => {
    const c = client([
      {
        ...item,
        state: "failed",
        commit_result: {
          candidate_id: item.id,
          confirmed_revision: 3,
          client_commit_id: "TEST-commit",
          private_status: "saved",
          private_record_id: "TEST-private",
          share_status: "failed",
          contribution_id: null,
          error_code: "TEST-FAILED",
          retryable: true,
        },
      },
    ]);
    c.batch = { ...batch, mode: "private_and_share", mode_locked: true };
    const view = await restoreDraftView(c, "TEST-batch");
    expect(view).toMatchObject({ mode: "private_and_share", locked: true });
    expect(view.rows[0]).toMatchObject({
      privateId: "TEST-private",
      shared: false,
      status: "failed",
      selected: true,
    });
  });
  it("does not publish a partial restored view after an authorization/network failure", async () => {
    const c = client([
      item,
      { ...item, id: "TEST-second", apartment_id: "TEST-apartment" },
    ]);
    c.apartment.mockRejectedValue(new Error("TEST-network"));
    await expect(restoreDraftView(c, "TEST-batch")).rejects.toThrow(
      "TEST-network",
    );
  });
});

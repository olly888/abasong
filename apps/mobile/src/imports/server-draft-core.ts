import type { components } from "@abasong/contracts";
import { AccountError } from "../auth/errors";
import type {
  Candidate,
  Source,
  ImportPreparationFailure,
  ImportOutcome,
} from "./types";
import { ocrReviewIssues } from "./review-issues";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { canRepairImportResult } from "./candidate-address";
type S = components["schemas"];
type PendingGroup = {
  localIds: string[];
  registration: S["ImportSourceCreate"];
  registrationKey: string;
  extraction: S["ImportDeviceExtraction"];
  extractionKey: string;
  source?: S["ImportSource"];
};
type PendingEdit = {
  addressPreparation?: boolean;
  path: string;
  body: unknown;
  key: string;
  accept: (value: unknown) => Promise<void> | void;
};
export class ImportDraft {
  batch: S["ImportBatch"] | null = null;
  private rows = new Map<string, S["ImportCandidate"]>();
  private commitIds = new Map<string, string>();
  private pendingGroups = new Map<string, PendingGroup>();
  private pendingWrite: {
    path: string;
    body: unknown;
    key: string;
    accept: (value: unknown) => Promise<void> | void;
  } | null = null;
  private candidateEdits = new Map<string, PendingEdit>();
  private preparationFailures = new Map<string, ImportPreparationFailure>();
  private createId: string;
  private createKey: string;
  constructor(
    private transport: ContributionRequest,
    private signal: AbortSignal,
    private makeKey: () => string,
  ) {
    this.createId = makeKey();
    this.createKey = makeKey();
  }
  private request<T>(
    path: string,
    options: Parameters<ContributionRequest>[1] = {},
  ) {
    if (this.signal.aborted) throw new Error("操作已取消");
    return this.transport<T>(path, { ...options, signal: this.signal });
  }
  // Retain the exact mutation until its response is known. A lost response is
  // not evidence that the server rejected the edit or mode change.
  private async flushWrite() {
    const pending = this.pendingWrite;
    if (!pending) return;
    let value: unknown;
    try {
      value = await this.request(pending.path, {
        method: "PATCH",
        key: pending.key,
        body: pending.body,
      });
    } catch (e) {
      if (e instanceof AccountError && e.status >= 400 && e.status < 500)
        this.pendingWrite = null;
      throw e;
    }
    await pending.accept(value);
    this.pendingWrite = null;
  }
  private async write(
    path: string,
    body: unknown,
    accept: (value: unknown) => Promise<void> | void,
  ) {
    this.pendingWrite = { path, body, accept, key: this.makeKey() };
    await this.flushWrite();
  }
  private preparationFailure(e: unknown): ImportPreparationFailure | null {
    if (this.signal.aborted) return null;
    if (e instanceof AccountError) {
      if (
        ![
          "ADDRESS_STORAGE_UNAVAILABLE",
          "ADDRESS_CONFIRMATION_REQUIRED",
          "AMBIGUOUS_ADDRESS",
          "IMPORT_ADDRESS_MISMATCH",
          "ADDRESS_RATE_LIMITED",
        ].includes(e.code) &&
        e.status < 500
      )
        return null;
      return {
        stage: "address_preparation",
        error_code: e.code,
        retryable: e.status >= 500 || e.status === 429,
      };
    }
    // Native fetch reports transport failures as Error; no server result or
    // durable commit plan is invented for an address edit with unknown outcome.
    if (e instanceof Error)
      return {
        stage: "address_preparation",
        error_code: "NETWORK_UNAVAILABLE",
        retryable: true,
      };
    return null;
  }
  private async flushCandidate(localId: string, tolerate: boolean) {
    const pending = this.candidateEdits.get(localId);
    if (!pending) return;
    let value: unknown;
    try {
      value = await this.request(pending.path, {
        method: "PATCH",
        body: pending.body,
        key: pending.key,
      });
    } catch (e) {
      if (e instanceof AccountError && e.status >= 400 && e.status < 500)
        this.candidateEdits.delete(localId);
      const failure = this.preparationFailure(e);
      if (!tolerate || !pending.addressPreparation || !failure) throw e;
      this.preparationFailures.set(localId, failure);
      return;
    }
    // Content/version conflicts in accept are never swallowed as a network
    // failure. A retry resolves the original mutation before applying new edits.
    await pending.accept(value);
    this.candidateEdits.delete(localId);
  }
  private path() {
    if (!this.batch) throw new Error("请先保存导入草稿");
    return "/v1/me/import-batches/" + this.batch.id;
  }
  async available() {
    const page = await this.request<S["ImportBatchPage"]>(
      "/v1/me/import-batches?limit=20",
    );
    return page.items.filter(
      (b) => !["completed", "cancelled", "expired"].includes(b.state),
    );
  }
  async apartment(id: string): Promise<S["Apartment"] | null> {
    try {
      return await this.request<S["Apartment"]>(
        "/v1/apartments/" + encodeURIComponent(id),
      );
    } catch (e) {
      if (e instanceof AccountError && e.status === 404) return null;
      throw e;
    }
  }
  private async all(batchId?: string) {
    const path = batchId
      ? "/v1/me/import-batches/" + encodeURIComponent(batchId)
      : this.path();
    let cursor: string | null = null;
    const rows: S["ImportCandidate"][] = [];
    do {
      const p: S["ImportCandidatePage"] = await this.request<
        S["ImportCandidatePage"]
      >(
        path +
          "/candidates?limit=50" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      rows.push(...p.items);
      cursor = p.next_cursor;
    } while (cursor);
    return rows;
  }
  private async refresh() {
    this.batch = await this.request<S["ImportBatch"]>(this.path());
    return this.batch;
  }
  async restore(
    id: string,
    validateView?: (rows: S["ImportCandidate"][]) => Promise<void>,
  ) {
    const batch = await this.request<S["ImportBatch"]>(
      "/v1/me/import-batches/" + encodeURIComponent(id),
    );
    const rows = await this.all(batch.id);
    // Apartment reads may also fail after candidate pagination. Adopt the
    // target only once its full view is ready, preserving old replay state.
    await validateView?.(rows);
    this.batch = batch;
    this.rows.clear();
    this.pendingGroups.clear();
    this.pendingWrite = null;
    this.candidateEdits.clear();
    this.preparationFailures.clear();
    this.commitIds.clear();
    for (const r of rows) {
      this.rows.set(r.id, r);
      if (r.commit_result)
        this.commitIds.set(r.id, r.commit_result.client_commit_id);
    }
    return rows;
  }
  async save(
    local: Candidate[],
    sources: Source[],
    mode: S["ImportBatch"]["mode"],
    toleratePreparationFailures = false,
  ) {
    this.preparationFailures.clear();
    if (!this.batch) {
      const policy = await this.request<S["ImportPolicy"]>(
        "/v1/me/import-policy",
      );
      this.batch = await this.request<S["ImportBatch"]>(
        "/v1/me/import-batches",
        {
          method: "POST",
          key: this.createKey,
          body: {
            client_batch_id: this.createId,
            policy_version: policy.version,
            mode,
            origin: mode === "private_only" ? "library" : "contribute",
          },
        },
      );
    }
    await this.flushWrite();
    for (const localId of this.candidateEdits.keys())
      await this.flushCandidate(localId, toleratePreparationFailures);
    await this.refresh();
    if (this.batch!.mode !== mode) {
      const before = new Map(this.rows);
      await this.write(
        this.path(),
        { expected_version: this.batch!.version, mode },
        async (value) => {
          this.batch = value as S["ImportBatch"];
          const remote = await this.all();
          for (const [localId, old] of before) {
            const found = remote.find((x) => x.id === old.id);
            // Mode changes invalidate confirmation and increment each revision,
            // but cannot silently absorb another device's subsequent content edit.
            if (
              !found ||
              found.revision !== old.revision + 1 ||
              found.address_text !== old.address_text ||
              found.apartment_id !== old.apartment_id ||
              JSON.stringify(found.confirmed_address ?? null) !==
                JSON.stringify(old.confirmed_address ?? null) ||
              found.value !== old.value ||
              JSON.stringify(found.scope) !== JSON.stringify(old.scope)
            )
              throw new Error("草稿已在其他设备更新，请重新打开");
            this.rows.set(localId, found);
          }
        },
      );
    }
    for (const [key, group] of this.pendingGroups)
      await this.finishGroup(key, group);
    // Refresh outcomes without silently accepting another device's content edit.
    const current = await this.all();
    for (const [localId, old] of this.rows) {
      const found = current.find((x) => x.id === old.id);
      if (!found || found.revision !== old.revision)
        throw new Error("草稿已在其他设备更新，请重新打开");
      this.rows.set(localId, found);
      if (found.commit_result)
        this.commitIds.set(localId, found.commit_result.client_commit_id);
    }
    const groups = new Map<string, Candidate[]>();
    for (const r of local)
      if (!this.rows.has(r.id)) {
        const sourceId = sources.some((s) => s.id === r.sourceId)
          ? r.sourceId
          : undefined;
        if (!sourceId) throw new Error("请重新选择截图来源");
        groups.set(sourceId, [...(groups.get(sourceId) ?? []), r]);
      }
    for (const [sourceId, items] of groups) {
      const s = sources.find((s) => s.id === sourceId)!;
      if (!s.width || !s.height || !s.bytes || !s.mime)
        throw new Error("截图资料不完整，请重新选择");
      await this.refresh();
      const key = sourceId + ":" + items.map((r) => r.id).join(":");
      const group: PendingGroup = {
        localIds: items.map((r) => r.id),
        registration: {
          client_source_id: this.makeKey(),
          expected_batch_version: this.batch!.version,
          mime_type: s.mime,
          byte_size: s.bytes,
          width: s.width,
          height: s.height,
        },
        registrationKey: this.makeKey(),
        extraction: {
          expected_source_version: 1,
          recognizer_version: "device-ocr-driver-review-v2",
          candidates: items.map((r) => ({
            address_text: (
              r.sourceAddress ?? (r.confirmedAddress ? "" : r.address)
            ).trim(),
            value: r.value.trim(),
            method: "keypad",
            scope: { label: r.scope.trim() },
            ...(ocrReviewIssues(r.issues).length
              ? { review_issues: ocrReviewIssues(r.issues) }
              : {}),
          })),
        },
        extractionKey: this.makeKey(),
      };
      this.pendingGroups.set(key, group);
      await this.finishGroup(key, group);
    }
    for (const [localId, remote] of this.rows) {
      if (this.preparationFailures.has(localId)) continue;
      const r = local.find((r) => r.id === localId);
      const data = r
        ? {
            address_text: r.address.trim(),
            apartment_id: r.target?.id ?? null,
            confirmed_address: r.confirmedAddress ?? null,
            value: r.value.trim(),
            scope: { label: r.scope.trim() },
            removed: false,
          }
        : { removed: true };
      const changed = !r
        ? remote.state !== "removed"
        : remote.address_text !== data.address_text ||
          remote.apartment_id !== data.apartment_id ||
          JSON.stringify(remote.confirmed_address ?? null) !==
            JSON.stringify(data.confirmed_address ?? null) ||
          remote.value !== data.value ||
          remote.scope.label !== data.scope?.label ||
          remote.state === "removed";
      if (
        remote.commit_result &&
        (!changed || !canRepairImportResult(remote.commit_result))
      )
        continue;
      if (changed) {
        this.candidateEdits.set(localId, {
          addressPreparation: !!(
            r?.confirmedAddress || remote.confirmed_address
          ),
          path: this.path() + "/candidates/" + remote.id,
          body: { expected_revision: remote.revision, ...data },
          key: this.makeKey(),
          accept: (value) => {
            const updated = value as S["ImportCandidate"];
            if (updated.revision !== remote.revision + 1)
              throw new Error("草稿已在其他设备更新，请重新打开");
            this.rows.set(localId, updated);
            this.commitIds.delete(localId);
          },
        });
        // Only address preparation may fail independently. Other edits retain
        // fail-fast behavior and never turn a conflict into a partial success.
        await this.flushCandidate(
          localId,
          toleratePreparationFailures &&
            !!(r?.confirmedAddress || remote.confirmed_address),
        );
      }
    }
    return this.refresh();
  }
  private async finishGroup(key: string, group: PendingGroup) {
    group.source ??= await this.request<S["ImportSource"]>(
      this.path() + "/sources/local",
      { method: "POST", key: group.registrationKey, body: group.registration },
    );
    const extracted = await this.request<S["ImportCandidatePage"]>(
      this.path() + "/sources/" + group.source.id + "/extractions",
      { method: "POST", key: group.extractionKey, body: group.extraction },
    );
    if (extracted.items.length !== group.localIds.length)
      throw new Error("草稿保存不完整，请重试");
    group.localIds.forEach((id, i) => this.rows.set(id, extracted.items[i]!));
    this.pendingGroups.delete(key);
  }
  async commit(
    local: Candidate[],
    selected: Candidate[],
    sources: Source[],
    mode: S["ImportBatch"]["mode"],
  ) {
    await this.save(local, sources, mode, true);
    const eligible = selected.filter(
      (r) => !this.preparationFailures.has(r.id),
    );
    const failed = selected
      .filter((r) => this.preparationFailures.has(r.id))
      .map((r) => ({
        localId: r.id,
        out: this.preparationFailures.get(r.id)! as ImportOutcome,
      }));
    if (!eligible.length) return failed;
    const confirm = eligible
      .map((r) => this.rows.get(r.id)!)
      .filter((r) => !r.commit_result);
    if (confirm.length) {
      await this.refresh();
      const confirmed = await this.request<S["ImportCandidatePage"]>(
        this.path() + "/candidates/confirm",
        {
          method: "POST",
          key: this.makeKey(),
          body: {
            expected_batch_version: this.batch!.version,
            fields_confirmed: true,
            items: confirm.map((r) => ({
              candidate_id: r.id,
              expected_revision: r.revision,
            })),
          },
        },
      );
      for (const [localId, r] of this.rows) {
        const x = confirmed.items.find((x) => x.id === r.id);
        if (x) this.rows.set(localId, x);
      }
    }
    await this.refresh();
    const items = eligible.map((r) => {
      const x = this.rows.get(r.id)!;
      let cid = this.commitIds.get(r.id);
      if (!cid) {
        cid = this.makeKey();
        this.commitIds.set(r.id, cid);
      }
      return {
        candidate_id: x.id,
        confirmed_revision: x.revision,
        client_commit_id: cid,
      };
    });
    const result = await this.request<S["ImportCommitResponse"]>(
      this.path() + "/commit",
      {
        method: "POST",
        key: this.makeKey(),
        body: {
          expected_batch_version: this.batch!.version,
          mode,
          source_attested: true,
          items,
        },
      },
    );
    this.batch = result.batch;
    return [
      ...result.results.map((out) => ({
        localId: [...this.rows].find(([, r]) => r.id === out.candidate_id)![0],
        out: out as ImportOutcome,
      })),
      ...failed,
    ];
  }
}

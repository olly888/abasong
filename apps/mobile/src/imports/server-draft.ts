import { randomUUID } from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import type { components } from "@abasong/contracts";
import { AccountError } from "../auth/api-client";
import { dataRequest } from "../apartments/client";
import type { Candidate, Source } from "./ImportScreen";
type S = components["schemas"];
type PendingGroup = {
  localIds: string[];
  registration: S["ImportSourceCreate"];
  registrationKey: string;
  extraction: S["ImportDeviceExtraction"];
  extractionKey: string;
  source?: S["ImportSource"];
};
export class ServerDraft {
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
  private createId = randomUUID();
  private createKey = randomUUID();
  constructor(
    private session: Session,
    private signal: AbortSignal,
  ) {}
  private request<T>(
    path: string,
    options: Parameters<typeof dataRequest>[2] = {},
  ) {
    if (this.signal.aborted) throw new Error("操作已取消");
    return dataRequest<T>(this.session, path, {
      ...options,
      signal: this.signal,
    });
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
    this.pendingWrite = { path, body, accept, key: randomUUID() };
    await this.flushWrite();
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
  ) {
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
          : sources[0]?.id;
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
          client_source_id: randomUUID(),
          expected_batch_version: this.batch!.version,
          mime_type: s.mime,
          byte_size: s.bytes,
          width: s.width,
          height: s.height,
        },
        registrationKey: randomUUID(),
        extraction: {
          expected_source_version: 1,
          recognizer_version: "device-ocr-driver-review-v1",
          candidates: items.map((r) => ({
            address_text: r.address.trim(),
            value: r.value.trim(),
            method: "keypad",
            scope: { label: r.scope.trim() },
          })),
        },
        extractionKey: randomUUID(),
      };
      this.pendingGroups.set(key, group);
      await this.finishGroup(key, group);
    }
    for (const [localId, remote] of this.rows) {
      const r = local.find((r) => r.id === localId);
      if (remote.commit_result) continue;
      const data = r
        ? {
            address_text: r.address.trim(),
            apartment_id: r.target?.id ?? null,
            value: r.value.trim(),
            scope: { label: r.scope.trim() },
            removed: false,
          }
        : { removed: true };
      const changed = !r
        ? remote.state !== "removed"
        : remote.address_text !== data.address_text ||
          remote.apartment_id !== data.apartment_id ||
          remote.value !== data.value ||
          remote.scope.label !== data.scope?.label ||
          remote.state === "removed";
      if (changed) {
        await this.write(
          this.path() + "/candidates/" + remote.id,
          { expected_revision: remote.revision, ...data },
          (value) => {
            const updated = value as S["ImportCandidate"];
            if (updated.revision !== remote.revision + 1)
              throw new Error("草稿已在其他设备更新，请重新打开");
            this.rows.set(localId, updated);
          },
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
    group.localIds.forEach((id, i) => this.rows.set(id, extracted.items[i]));
    this.pendingGroups.delete(key);
  }
  async commit(
    local: Candidate[],
    selected: Candidate[],
    sources: Source[],
    mode: S["ImportBatch"]["mode"],
  ) {
    await this.save(local, sources, mode);
    const confirm = selected
      .map((r) => this.rows.get(r.id)!)
      .filter((r) => !r.commit_result);
    if (confirm.length) {
      await this.refresh();
      const confirmed = await this.request<S["ImportCandidatePage"]>(
        this.path() + "/candidates/confirm",
        {
          method: "POST",
          key: randomUUID(),
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
    const items = selected.map((r) => {
      const x = this.rows.get(r.id)!;
      let cid = this.commitIds.get(r.id);
      if (!cid) {
        cid = randomUUID();
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
        key: randomUUID(),
        body: {
          expected_batch_version: this.batch!.version,
          mode,
          source_attested: true,
          items,
        },
      },
    );
    this.batch = result.batch;
    return result.results.map((out) => ({
      localId: [...this.rows].find(([, r]) => r.id === out.candidate_id)![0],
      out,
    }));
  }
}

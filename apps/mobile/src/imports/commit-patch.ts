import type { Candidate, ImportOutcome } from "./types";
export function importCommitPatch(out: ImportOutcome): Partial<Candidate> {
  const addressReview =
    !!out.error_code &&
    [
      "ADDRESS_CONFIRMATION_REQUIRED",
      "AMBIGUOUS_ADDRESS",
      "IMPORT_ADDRESS_MISMATCH",
    ].includes(out.error_code);
  if ("stage" in out)
    return {
      status: "failed",
      needsAddressReview: addressReview,
      ...(addressReview ? { selected: false } : {}),
      error: addressReview ? "请核对公寓地址后再共享" : "地址暂未确认，可重试",
    };
  return {
    privateId: out.private_record_id ?? undefined,
    sharedApartmentId: out.apartment_id ?? undefined,
    shared: ["active", "pending", "same_value"].includes(out.share_status),
    status:
      out.private_status === "failed" || out.share_status === "failed"
        ? "failed"
        : out.share_status === "pending"
          ? "pending"
          : out.share_status === "same_value"
            ? "same_value"
            : out.share_status === "active"
              ? "active"
              : "private_saved",
    needsAddressReview: addressReview,
    ...(addressReview ? { selected: false } : {}),
    error: out.error_code
      ? addressReview
        ? "请核对公寓地址后再共享"
        : out.error_code === "APARTMENT_SHARING_PAUSED"
          ? "已保存，该公寓暂不共享门禁码"
          : out.private_status === "saved"
            ? "已保存，尚未共享；可重试"
            : "保存失败，可重试"
      : undefined,
  };
}

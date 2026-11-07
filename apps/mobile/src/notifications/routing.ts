const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function notificationTarget(data: unknown, userId: string | null) {
  if (!data || typeof data !== "object" || !userId) return null;
  const p = data as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (k) => !["version", "owner_id", "kind", "object_id"].includes(k),
    ) ||
    p.version !== 1 ||
    p.owner_id !== userId ||
    typeof p.object_id !== "string" ||
    !uuid.test(p.object_id)
  )
    return null;
  if (p.kind === "conversation")
    return {
      pathname: "/conversations/[id]" as const,
      params: { id: p.object_id },
    };
  if (p.kind === "post")
    return { pathname: "/circle/[id]" as const, params: { id: p.object_id } };
  if (p.kind === "request")
    return { pathname: "/requests/[id]" as const, params: { id: p.object_id } };
  return null;
}

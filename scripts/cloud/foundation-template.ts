// Guard this approved foundation inventory before any AWS call. This is not a
// replacement for validation against the official resource-provider schemas.
export function assertFoundationTemplate(value: unknown) {
  function object(v: unknown): Record<string, unknown> {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error("Foundation object required");
    return v as Record<string, unknown>;
  }
  const expected: Record<string, string> = {
    DataKey: "AWS::KMS::Key",
    DataKeyAlias: "AWS::KMS::Alias",
    ApiRepository: "AWS::ECR::Repository",
    WorkerRepository: "AWS::ECR::Repository",
    ApiLogs: "AWS::Logs::LogGroup",
    WorkerLogs: "AWS::Logs::LogGroup",
  };
  const resources = object(object(value).Resources);
  if (Object.keys(resources).length !== Object.keys(expected).length)
    throw new Error("Unapproved foundation inventory");
  for (const [name, type] of Object.entries(expected)) {
    const resource = object(resources[name]);
    if (
      resource.Type !== type ||
      resource.DeletionPolicy !== "Retain" ||
      resource.UpdateReplacePolicy !== "Retain"
    )
      throw new Error("Unapproved foundation resource or retention");
    if (name === "DataKeyAlias") continue;
    const tags = object(resource.Properties).Tags;
    if (!Array.isArray(tags) || tags.length !== 2)
      throw new Error("Foundation project tags required");
    const pairs = tags.map((tag: unknown) => {
      const t = object(tag);
      // CloudFormation uses Key/Value, including for KMS. TagKey/TagValue is
      // the KMS API shape and caused a real provider/import failure.
      if (
        Object.keys(t).length !== 2 ||
        typeof t.Key !== "string" ||
        typeof t.Value !== "string"
      )
        throw new Error("CloudFormation tags must use Key/Value");
      return [t.Key, t.Value] as const;
    });
    const scope = Object.fromEntries(pairs);
    if (scope.Project !== "Abasong" || scope.Environment !== "pilot-dev")
      throw new Error("Foundation tag scope mismatch");
  }
}

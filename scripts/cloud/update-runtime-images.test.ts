import { expect, test } from "vitest";
import { assertImageChangeSet } from "./update-runtime-images";

const expected = {
  stackId: "pilot-stack",
  id: "image-update",
  before: {
    ApiImageDigest: "old-api",
    WorkerImageDigest: "old-worker",
    CertificateArn: "cert",
  },
  after: {
    ApiImageDigest: "new-api",
    WorkerImageDigest: "new-worker",
    CertificateArn: "cert",
  },
};

function proposal() {
  return {
    StackId: expected.stackId,
    ChangeSetId: expected.id,
    Status: "CREATE_COMPLETE",
    ExecutionStatus: "AVAILABLE",
    Changes: ["ApiTask", "WorkerTask", "ApiService", "WorkerService"].map(
      (name) => ({
        ResourceChange: {
          Action: "Modify",
          LogicalResourceId: name,
          Replacement: name.endsWith("Task") ? "True" : "False",
        },
      }),
    ),
    Parameters: Object.entries(expected.after).map(
      ([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue }),
    ),
  };
}

test("admits only in-place service updates for the two reviewed images", () => {
  expect(() => assertImageChangeSet(proposal(), expected)).not.toThrow();
  for (const replacement of ["True", "Conditional"]) {
    const result = proposal();
    result.Changes[2]!.ResourceChange.Replacement = replacement;
    expect(() => assertImageChangeSet(result, expected)).toThrow(
      "existing services",
    );
  }
  const unrelated = proposal();
  unrelated.Changes[0]!.ResourceChange.LogicalResourceId = "ApiSecurity";
  expect(() => assertImageChangeSet(unrelated, expected)).toThrow(
    "existing services",
  );
});

test("rejects a different image, template parameter or stack receipt", () => {
  const result = proposal();
  result.Parameters[0]!.ParameterValue = "old-api";
  expect(() => assertImageChangeSet(result, expected)).toThrow(
    "image parameter",
  );
  const changed = proposal();
  changed.Parameters[2]!.ParameterValue = "other-cert";
  expect(() => assertImageChangeSet(changed, expected)).toThrow(
    "retained parameter",
  );
  expect(() =>
    assertImageChangeSet({ ...proposal(), StackId: "different" }, expected),
  ).toThrow();
});

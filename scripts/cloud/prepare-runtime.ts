import { readFileSync } from "node:fs";
import { assertRuntimeParameters, assertRuntimePlan } from "./runtime-plan";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--parameters"))
  throw new Error(
    "Choose local manifest or --parameters PRIVATE_REVIEW_FILE; apply is unavailable",
  );
const plan = Object.fromEntries(
  ["identities", "notifications", "certificate", "runtime"].map((name) => [
    name,
    JSON.parse(readFileSync(`deploy/pilot-dev/${name}.json`, "utf8")),
  ]),
);
const inventory = assertRuntimePlan(plan);
if (args.length) {
  const file = JSON.parse(readFileSync(args[1]!, "utf8"));
  assertRuntimeParameters(file.Parameters, file.AccountId);
}
console.log(
  JSON.stringify(
    {
      mode: "local-review-only",
      aws_calls: 0,
      ...inventory,
      bindings_checked: Boolean(args.length),
      deployed: false,
    },
    null,
    2,
  ),
);

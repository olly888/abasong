import { writeFileSync } from "node:fs";
import { buildRuntimeTemplates } from "./runtime-templates";
for (const [name, template] of Object.entries(buildRuntimeTemplates())) {
  writeFileSync(
    `deploy/pilot-dev/${name}.json`,
    JSON.stringify(template, null, 2) + "\n",
  );
}
console.log(
  "Prepared four review-only templates; no AWS calls or credential values.",
);

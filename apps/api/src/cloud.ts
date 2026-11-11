import { assertCloudImageEnvironment } from "@abasong/runtime";
async function launch() {
  // Fixed production-image entrypoint: changing environment labels cannot select D0.
  assertCloudImageEnvironment("api");
  await import("./main.js");
}
launch().catch(() => {
  console.error("API cloud configuration refused");
  process.exitCode = 1;
});

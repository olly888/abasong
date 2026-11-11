import { assertCloudImageEnvironment } from "@abasong/runtime";
async function launch() {
  assertCloudImageEnvironment("worker");
  await import("./main.js");
}
launch().catch(() => {
  console.error("Worker cloud configuration refused");
  process.exitCode = 1;
});

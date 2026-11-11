import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { probeLiveMapbox } from "./live-mapbox-probe";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((a) => a !== "--server-token"))
    throw Error("Use no arguments or --server-token");
  const server = args.includes("--server-token");
  const values = parseEnv(
    readFileSync(server ? ".env" : "apps/mobile/.env.local", "utf8"),
  );
  const token = (
    server ? values.MAPBOX_SEARCH_TOKEN : values.EXPO_PUBLIC_MAPBOX_TOKEN
  )?.trim();
  if (!token?.startsWith("pk.")) throw Error("Public token unavailable");
  const result = await probeLiveMapbox(token);
  console.log(
    JSON.stringify(
      { token_source: server ? "api" : "mobile", ...result },
      null,
      2,
    ),
  );
  if (result.checks.some((c) => c.state !== "passed")) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Mapbox live check refused or failed; sensitive details omitted.",
  );
  process.exitCode = 1;
});

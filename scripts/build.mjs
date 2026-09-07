import { build } from "esbuild";
import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
await mkdir("dist/server", { recursive: true });
await cp("public", "dist/client", { recursive: true });
await build({
  entryPoints: ["server/worker.mjs"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/server/index.js",
});
await mkdir("dist/.openai", { recursive: true });
const hosting = JSON.parse(
  (await readFile(".openai/hosting.json", "utf8")).replace(/^\uFEFF/, ""),
);
await writeFile("dist/.openai/hosting.json", JSON.stringify(hosting, null, 2));
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
console.log(
  "Build concluído: frontend + API + migrações. Consulte LAUNCH.md antes da ativação financeira.",
);

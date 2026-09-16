import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../../", import.meta.url);
const out = new URL("output/mcp-service/", root);
await rm(out, { recursive: true, force: true });
await mkdir(new URL("src/service/", out), { recursive: true });
for (const name of ["package.json", "package-lock.json"])
  await cp(new URL(name, import.meta.url), new URL(name, out));
await cp(new URL("src/", import.meta.url), new URL("src/service/", out), {
  recursive: true,
});
await cp(new URL("src/ecosystem/", root), new URL("src/ecosystem/", out), {
  recursive: true,
});
await cp(new URL("schemas/", root), new URL("schemas/", out), {
  recursive: true,
});
await mkdir(new URL("data/", out), { recursive: true });
for (const file of ["bittrees-projects.json", "catalog-sync-status.json"])
  await cp(new URL(`data/${file}`, root), new URL(`data/${file}`, out));
for (const file of ["engine.mjs", "http.mjs"]) {
  const path = new URL(`src/service/${file}`, out);
  await writeFile(
    path,
    (await readFile(path, "utf8"))
      .replaceAll("../../../src/ecosystem/", "../ecosystem/")
      .replaceAll("../../../schemas/", "../../schemas/")
      .replaceAll("../../../data/", "../../data/"),
  );
}
await mkdir(new URL("public/", out), { recursive: true });
await writeFile(new URL("public/robots.txt", out), "User-agent: *\nDisallow: /\n");
await mkdir(new URL("api/", out), { recursive: true });
await writeFile(
  new URL("api/index.mjs", out),
  `import {runtime} from '../src/service/runtime.mjs';\nlet handler;export default async function(req,res){try{handler??=await runtime();return await handler(req,res);}catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'MCP service configuration or storage unavailable'}));}}\n`,
);
await writeFile(
  new URL("vercel.json", out),
  JSON.stringify(
    {
      version: 2,
      buildCommand: "mkdir -p public",
      outputDirectory: "public",
      functions: {
        "api/index.mjs": {
          maxDuration: 120,
          includeFiles: "{data,schemas}/**",
        },
      },
      rewrites: [{ source: "/(.*)", destination: "/api/index" }],
    },
    null,
    2,
  ),
);
const pkg = JSON.parse(await readFile(new URL("package.json", out), "utf8"));
pkg.scripts = { start: "node src/service/server.mjs" };
await writeFile(new URL("package.json", out), JSON.stringify(pkg, null, 2));
console.log(`Standalone service artifact: ${fileURLToPath(out)}`);

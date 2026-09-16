import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  CATALOG,
  validateCatalog,
  selectionFromParams,
  resolveSelection,
  requireSelectedProject,
  catalogRevision,
  clientConfiguration,
} from "../src/ecosystem/catalog.mjs";
import { scopedMcpResult } from "../src/ecosystem/mcp.mjs";
import { renderConnectionPage } from "../src/ecosystem/ui.mjs";
import { reconcileCatalog } from "../src/ecosystem/sync.mjs";
import { createRequestHandler } from "../src/portal.mjs";
const profile = (query) => selectionFromParams(new URLSearchParams(query));
const rpc = (
  method,
  params = {},
  query = "mode=selected&projects=agent",
  headers = {},
) =>
  scopedMcpResult(
    { jsonrpc: "2.0", id: 1, method, params },
    { url: `/mcp?${query}`, headers },
  );
const newProject = () => ({
  ...structuredClone(CATALOG.projects[0]),
  id: "new-project",
  name: "New project",
  aliases: [],
  components: [],
  repositoryUrl: "https://github.com/example/new-project",
});

test("approved additions propagate to all modes, but never expand pinned selections", () => {
  const next = structuredClone(CATALOG);
  next.projects.push(newProject());
  validateCatalog(next);
  for (const mode of ["bittrees", "ecosystem"])
    assert.ok(
      resolveSelection(next, profile(`mode=${mode}`)).projects.some(
        (p) => p.id === "new-project",
      ),
    );
  assert.deepEqual(
    resolveSelection(
      next,
      profile("mode=selected&projects=agent"),
    ).projects.map((p) => p.id),
    ["agent"],
  );
  assert.ok(
    !resolveSelection(
      next,
      profile("mode=ecosystem&exclude=new-project"),
    ).projects.some((p) => p.id === "new-project"),
  );
});
test("removal/reclassification is deterministic and removed pins remain explainable", () => {
  const next = structuredClone(CATALOG);
  next.projects[0].affiliation = "related";
  assert.ok(
    !resolveSelection(next, profile("mode=bittrees")).projects.some(
      (p) => p.id === "agent",
    ),
  );
  assert.equal(
    resolveSelection(next, profile("mode=selected&projects=agent")).projects
      .length,
    1,
  );
  next.projects[0].lifecycle = "removed";
  const result = resolveSelection(
    next,
    profile("mode=selected&projects=agent"),
  );
  assert.equal(result.projects.length, 0);
  assert.deepEqual(result.profile.selectedIds, ["agent"]);
  assert.match(result.unavailable[0].reason, /removed/);
});
test("pending origins stay listed but cannot enter a selection or execute a tool", () => {
  assert.ok(CATALOG.projects.some((p) => p.approval === "pending"));
  assert.throws(
    () => requireSelectedProject(CATALOG, profile("mode=ecosystem"), "mail"),
    /not available/,
  );
  assert.throws(
    () =>
      rpc(
        "tools/call",
        { name: "get_bittrees_project", arguments: { projectId: "mail" } },
        "mode=selected&projects=mail",
      ),
    /not available/,
  );
});
test("crafted cross-project resources, handoffs, private calls and URL arguments are rejected", () => {
  for (const uri of [
    "https://agent.bittrees.org/v1/projects/crm",
    "https://agent.bittrees.org/projects.json",
    "https://example.com/data",
    "https://agent.bittrees.org/catalog.json?mode=ecosystem",
  ])
    assert.throws(() => rpc("resources/read", { uri }));
  assert.throws(() =>
    rpc("tools/call", {
      name: "prepare_bittrees_project_handoff",
      arguments: { projectId: "crm", intent: "Inspect" },
    }),
  );
  assert.throws(() =>
    rpc("tools/call", {
      name: "get_bittrees_project",
      arguments: { projectId: "agent", url: "http://localhost/admin" },
    }),
  );
  for (const token of ["Bearer admin", "Bearer expired", "Bearer tenant-b"])
    assert.throws(
      () =>
        rpc(
          "tools/call",
          { name: "submit_contribution", arguments: { projectId: "agent" } },
          "mode=ecosystem",
          { authorization: token },
        ),
      /not available/,
    );
  const listed = rpc("resources/list").result.resources;
  assert.deepEqual(
    listed.map((r) => r.uri),
    [
      "https://agent.bittrees.org/catalog.json",
      "https://agent.bittrees.org/v1/projects/agent",
    ],
  );
  const catalog = JSON.parse(
    rpc("resources/read", { uri: "https://agent.bittrees.org/catalog.json" })
      .result.contents[0].text,
  );
  assert.deepEqual(
    catalog.projects.map((p) => p.id),
    ["agent"],
  );
});
test("unknown versions, malformed saved state and duplicate parameters never widen selection", () => {
  for (const query of [
    "mode=invalid",
    "mode=selected&projects=agent,agent",
    "mode=selected&profileVersion=2",
    "mode=selected&mode=ecosystem",
  ])
    assert.throws(() => profile(query));
});
test("synchronization rejects unreviewed origins/capabilities and atomically retains last good data", () => {
  const base = CATALOG.projects[0];
  const sources = [
    { id: base.id, repository: "Bittrees-Technology/agent", enabled: true },
  ];
  const updated = {
    ...structuredClone(base),
    summary: "Updated approved public description",
  };
  const valid = reconcileCatalog(CATALOG, sources, {
    agent: { project: updated, revision: "a".repeat(40) },
  });
  assert.equal(valid.report.state, "reconciled");
  assert.equal(valid.catalog.projects[0].summary, updated.summary);
  const replay = reconcileCatalog(valid.catalog, sources, {
    agent: { project: updated, revision: "a".repeat(40) },
  });
  assert.equal(replay.report.changes.length, 0);
  for (const bad of [
    { ...updated, publicUrl: "https://evil.example" },
    { ...updated, authScopes: ["write:any"] },
    { ...updated, aliases: ["crm"] },
  ]) {
    const result = reconcileCatalog(CATALOG, sources, {
      agent: { project: bad, revision: "a".repeat(40) },
    });
    assert.equal(result.report.state, "failed");
    assert.deepEqual(result.catalog, CATALOG);
  }
  const unavailable = reconcileCatalog(CATALOG, sources, {});
  assert.equal(unavailable.report.state, "failed");
  assert.deepEqual(unavailable.catalog, CATALOG);
});
test("new approved source templates propagate, while duplicate aliases fail publication", () => {
  const added = newProject();
  const source = {
    id: added.id,
    repository: "example/new-project",
    enabled: true,
    approvedTemplate: added,
  };
  const result = reconcileCatalog(CATALOG, [source], {
    "new-project": { project: added, revision: "b".repeat(40) },
  });
  assert.equal(result.report.state, "reconciled");
  assert.equal(result.report.changes[0].change, "added");
  added.aliases = ["agent"];
  assert.throws(
    () =>
      validateCatalog({ ...CATALOG, projects: [...CATALOG.projects, added] }),
    /Duplicate/,
  );
});
test("configuration and UI use the same selection revision and do not imply live product actions", () => {
  const saved = profile("mode=selected&projects=crm&exclude=agent");
  const url = clientConfiguration(saved).mcpServers.bittrees.url;
  assert.equal(new URL(url).pathname, "/mcp");
  assert.deepEqual(profile(new URL(url).search.slice(1)), saved);
  const html = renderConnectionPage(
    new URLSearchParams("mode=selected&projects=crm"),
  );
  assert.match(html, /name="project" value="crm" checked/);
  assert.match(html, /readonly/);
  assert.match(html, /Agent onboarding/);
});
test("HTTP config connects to the implemented scoped MCP and shares a conditional catalog revision", async () => {
  const server = createServer(createRequestHandler());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(
      `${base}/catalog.json?mode=selected&projects=crm`,
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("x-catalog-revision"),
      catalogRevision(CATALOG),
    );
    const payload = await response.json();
    assert.deepEqual(
      payload.projects.map((p) => p.id),
      ["crm"],
    );
    const conditional = await fetch(
      `${base}/catalog.json?mode=selected&projects=crm`,
      { headers: { "If-None-Match": response.headers.get("etag") } },
    );
    assert.equal(conditional.status, 304);
    const config = await (
      await fetch(`${base}/connection.json?mode=selected&projects=crm`)
    ).json();
    const endpoint = new URL(config.mcpServers.bittrees.url);
    const mcp = await fetch(`${base}${endpoint.pathname}${endpoint.search}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_bittrees_project",
          arguments: { projectId: "agent" },
        },
      }),
    });
    assert.equal(mcp.status, 400);
    assert.match((await mcp.json()).error.message, /not available/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

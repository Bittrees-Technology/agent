const SCHEMA_URL = 'https://json-schema.org/draft/2020-12/schema';

export const SOURCE_SCOPE = [
  'Bittrees Research',
  'Bittrees, Inc. operations/governance',
  'Bittrees Capital / treasury workflows',
];

const PLACEHOLDER_NOTICE =
  'Anything beyond the established source scope is an explicit placeholder until sourced.';

function buildStringArraySchema(description) {
  return {
    type: 'array',
    description,
    items: { type: 'string' },
    minItems: 1,
  };
}

function buildStubDataSchema({
  title,
  description,
  itemKey,
  itemDescription,
  itemSchema,
  extraProperties = {},
  requiredExtras = [],
}) {
  return {
    $schema: SCHEMA_URL,
    title,
    description,
    type: 'object',
    additionalProperties: false,
    required: ['status', 'sourceScope', 'placeholderNotice', itemKey, 'notes', ...requiredExtras],
    properties: {
      status: { const: 'placeholder' },
      sourceScope: {
        ...buildStringArraySchema(
          'Only Bittrees facts already established in Brain or local memory are listed here.',
        ),
        items: {
          type: 'string',
          enum: [...SOURCE_SCOPE],
        },
      },
      placeholderNotice: {
        type: 'string',
        const: PLACEHOLDER_NOTICE,
      },
      [itemKey]: {
        type: 'array',
        description: itemDescription,
        items: itemSchema,
      },
      notes: buildStringArraySchema('Implementation notes for this first-cut scaffold.'),
      ...extraProperties,
    },
  };
}

function buildSectionSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['heading', 'body'],
    properties: {
      heading: { type: 'string' },
      body: { type: 'string' },
    },
  };
}

function buildRouteDefinition({
  path,
  label,
  title,
  description,
  itemKey,
  itemDescription,
  itemSchema,
  data,
  extraProperties = {},
  requiredExtras = [],
}) {
  return {
    path,
    label,
    title,
    description,
    schema: buildStubDataSchema({
      title,
      description,
      itemKey,
      itemDescription,
      itemSchema,
      extraProperties,
      requiredExtras,
    }),
    data: {
      status: 'placeholder',
      sourceScope: [...SOURCE_SCOPE],
      placeholderNotice: PLACEHOLDER_NOTICE,
      ...data,
    },
  };
}

export const ROUTE_DEFINITIONS = [
  {
    path: '/',
    label: 'Landing page',
    title: 'agent.bittrees.org landing page',
    description: 'Human-facing landing page for the portal skeleton.',
  },
  buildRouteDefinition({
    path: '/llms.txt',
    label: 'llms.txt',
    title: 'agent.bittrees.org llms.txt stub data',
    description: 'JSON-encoded llms.txt scaffold with explicit schema annotation.',
    itemKey: 'sections',
    itemDescription: 'Sections that summarize the portal stub.',
    itemSchema: buildSectionSchema(),
    requiredExtras: ['summary'],
    extraProperties: {
      summary: {
        type: 'string',
      },
    },
    data: {
      summary: 'JSON-encoded llms.txt scaffold for agent.bittrees.org.',
      sections: [
        {
          heading: 'Source scope',
          body: 'This scaffold only states Bittrees facts already established in Brain or local memory.',
        },
        {
          heading: 'Placeholders',
          body: 'Any content outside the established scope is explicitly marked as a placeholder.',
        },
        {
          heading: 'Route format',
          body: 'This first cut uses JSON so the schema annotation is visible to machine consumers.',
        },
      ],
      notes: ['This route is intentionally stubbed and machine-readable.'],
    },
  }),
  buildRouteDefinition({
    path: '/agents.json',
    label: 'agents.json',
    title: 'agent.bittrees.org agents stub data',
    description: 'Placeholder directory of agents and roles.',
    itemKey: 'agents',
    itemDescription: 'Known agents for the portal skeleton.',
    itemSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'role'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string' },
      },
    },
    data: {
      agents: [],
      notes: ['No agent registry is wired in yet.'],
    },
  }),
  buildRouteDefinition({
    path: '/templates.json',
    label: 'templates.json',
    title: 'agent.bittrees.org templates stub data',
    description: 'Placeholder catalog of templates.',
    itemKey: 'templates',
    itemDescription: 'Known templates for the portal skeleton.',
    itemSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'purpose'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        purpose: { type: 'string' },
      },
    },
    data: {
      templates: [],
      notes: ['Template catalog is empty in this first cut.'],
    },
  }),
  buildRouteDefinition({
    path: '/idacc/releases.json',
    label: 'idacc/releases.json',
    title: 'agent.bittrees.org idacc releases stub data',
    description: 'Placeholder release feed for the idacc namespace.',
    itemKey: 'releases',
    itemDescription: 'Known release entries for the portal skeleton.',
    itemSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'status', 'publishedAt', 'notes'],
      properties: {
        version: { type: 'string' },
        status: { type: 'string' },
        publishedAt: { type: 'string' },
        notes: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    data: {
      releases: [],
      notes: ['Release feed is empty until an upstream source is connected.'],
    },
  }),
];

export const ROUTE_MAP = new Map(ROUTE_DEFINITIONS.slice(1).map((definition) => [definition.path, definition]));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderLandingPage() {
  const routeCards = ROUTE_DEFINITIONS.slice(1)
    .map(
      (definition) => `
        <article class="card">
          <p class="card-kicker">${escapeHtml(definition.label)}</p>
          <h2>${escapeHtml(definition.path)}</h2>
          <p>${escapeHtml(definition.description)}</p>
        </article>
      `,
    )
    .join('');

  const sourceScopeItems = SOURCE_SCOPE.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>agent.bittrees.org</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111f;
        --bg-2: #0c1930;
        --panel: rgba(10, 18, 34, 0.76);
        --text: #edf2ff;
        --muted: #b5bfd9;
        --accent: #78f0d6;
        --accent-2: #ffc56c;
        --border: rgba(255, 255, 255, 0.12);
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }

      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      body {
        margin: 0;
        color: var(--text);
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        background:
          radial-gradient(circle at top left, rgba(120, 240, 214, 0.18), transparent 32%),
          radial-gradient(circle at top right, rgba(255, 197, 108, 0.14), transparent 24%),
          linear-gradient(160deg, var(--bg), var(--bg-2));
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
        background-size: 42px 42px;
        mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.85), transparent 90%);
      }

      main {
        position: relative;
        max-width: 1100px;
        margin: 0 auto;
        padding: 72px 24px 56px;
      }

      .hero {
        display: grid;
        gap: 24px;
        padding: 36px;
        border: 1px solid var(--border);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(20px);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        width: fit-content;
        margin: 0 0 14px;
        padding: 8px 14px;
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.78rem;
      }

      .eyebrow::before {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        box-shadow: 0 0 0 4px rgba(120, 240, 214, 0.12);
      }

      h1 {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(3rem, 8vw, 5.8rem);
        line-height: 0.95;
        letter-spacing: -0.05em;
      }

      .lede {
        max-width: 65ch;
        margin: 0;
        color: var(--muted);
        font-size: 1.08rem;
        line-height: 1.75;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 18px;
        margin-top: 22px;
      }

      .card {
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: rgba(8, 14, 27, 0.72);
      }

      .card h2,
      .section h2 {
        margin: 0 0 10px;
        font-size: 1.15rem;
      }

      .card p,
      .section p,
      .section li {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
      }

      .card-kicker {
        margin: 0 0 12px;
        color: var(--accent);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.09em;
      }

      .sections {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
        margin-top: 18px;
      }

      .section {
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: rgba(8, 14, 27, 0.62);
      }

      .section ul {
        margin: 12px 0 0;
        padding-left: 18px;
      }

      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid rgba(120, 240, 214, 0.22);
        background: rgba(120, 240, 214, 0.08);
        color: var(--text);
        text-decoration: none;
        font-size: 0.9rem;
      }

      .footer-note {
        margin-top: 18px;
        color: var(--muted);
        font-size: 0.94rem;
      }

      @media (max-width: 720px) {
        main {
          padding: 20px;
        }

        .hero {
          padding: 24px;
        }

        h1 {
          max-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div>
          <p class="eyebrow">agent.bittrees.org portal scaffold</p>
          <h1 id="hero-title">A first-cut portal shell.</h1>
        </div>
        <p class="lede">
          This local-only scaffold keeps Bittrees-specific wording source-aware. The
          established scope currently visible here is limited to
          <strong>Bittrees Research</strong>, <strong>Bittrees, Inc. operations/governance</strong>,
          and <strong>Bittrees Capital / treasury workflows</strong>. Anything else is an explicit
          placeholder until sourced.
        </p>
        <div class="pill-row" aria-label="Machine-readable routes">
          <a class="pill" href="/llms.txt">/llms.txt</a>
          <a class="pill" href="/agents.json">/agents.json</a>
          <a class="pill" href="/templates.json">/templates.json</a>
          <a class="pill" href="/idacc/releases.json">/idacc/releases.json</a>
        </div>
      </section>

      <section class="sections" aria-label="Portal notes">
        <article class="section">
          <h2>Source-aware scope</h2>
          <p>Only the established Bittrees items are surfaced in this first cut.</p>
          <ul>
            ${sourceScopeItems}
          </ul>
        </article>
        <article class="section">
          <h2>Deployment status</h2>
          <p>No live Vercel or DNS integration is connected to this scaffold.</p>
          <p class="footer-note">The repo is intentionally local and minimal for now.</p>
        </article>
      </section>

      <section class="grid" aria-label="Stub routes">
        ${routeCards}
      </section>
    </main>
  </body>
</html>`;
}

export function buildStubResponse(routeDefinition, generatedAt = new Date().toISOString()) {
  return {
    $schema: SCHEMA_URL,
    route: routeDefinition.path,
    generatedAt,
    stub: true,
    schema: routeDefinition.schema,
    data: routeDefinition.data,
  };
}

function sendJson(res, statusCode, body, includeBody = true) {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(includeBody ? payload : undefined);
}

function sendHtml(res, statusCode, body, includeBody = true) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(includeBody ? body : undefined);
}

export function buildPortalManifest(generatedAt = new Date().toISOString()) {
  return {
    name: 'agent.bittrees.org portal scaffold',
    generatedAt,
    sourceScope: [...SOURCE_SCOPE],
    routes: ROUTE_DEFINITIONS.map((definition) => ({
      path: definition.path,
      label: definition.label,
      description: definition.description ?? 'Landing page',
      kind: definition.path === '/' ? 'html' : 'json',
      stub: definition.path !== '/',
      schemaTitle: definition.schema?.title ?? null,
    })),
  };
}

export function buildStaticAssets(generatedAt = new Date().toISOString()) {
  const routeAssets = ROUTE_DEFINITIONS.slice(1).map((definition) => ({
    path: definition.path.replace(/^\//, ''),
    body: `${JSON.stringify(buildStubResponse(definition, generatedAt), null, 2)}\n`,
  }));

  return [
    {
      path: 'index.html',
      body: renderLandingPage(),
    },
    ...routeAssets,
    {
      path: 'portal-manifest.json',
      body: `${JSON.stringify(buildPortalManifest(generatedAt), null, 2)}\n`,
    },
  ];
}

export function createRequestHandler() {
  return function handleRequest(req, res) {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const includeBody = req.method !== 'HEAD';

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, {
        $schema: SCHEMA_URL,
        error: 'method_not_allowed',
        message: 'Only GET and HEAD are supported by this scaffold.',
        allowedMethods: ['GET', 'HEAD'],
      }, includeBody);
    }

    if (requestUrl.pathname === '/') {
      return sendHtml(res, 200, renderLandingPage(), includeBody);
    }

    const routeDefinition = ROUTE_MAP.get(requestUrl.pathname);
    if (routeDefinition) {
      return sendJson(res, 200, buildStubResponse(routeDefinition), includeBody);
    }

    return sendJson(res, 404, {
      $schema: SCHEMA_URL,
      error: 'not_found',
      message: 'No scaffold route exists at this path.',
      availableRoutes: ROUTE_DEFINITIONS.map((definition) => definition.path),
    }, includeBody);
  };
}

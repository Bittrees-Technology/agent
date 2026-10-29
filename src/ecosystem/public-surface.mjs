import { BITTREES_TOOLS, EXTERNAL_RESOURCES, HUB_PAGES } from './resources.mjs';

// Public navigation policy; legacy authenticated interfaces remain independent.
export const CONSOLIDATED_PAGES = Object.freeze({
  '/identity-keys': '/workflows#permissions',
  '/reputation': '/workflows#permissions',
  '/onboarding': '/contribute',
});

export function consolidatedDestination(path) {
  const canonical = path.replace(/\/index\.html$/, '').replace(/\/$/, '');
  return CONSOLIDATED_PAGES[canonical] ?? null;
}

export const LEGACY_DISCOVERY_PATHS = new Set([
  ...Object.keys(CONSOLIDATED_PAGES), '/agents.json', '/identity-keys.json',
  '/reputation.json', '/idacc/releases.json', '/administration',
]);

export function buildHubAgentGuide({ full = false } = {}) {
  return `# Bittrees Agent

> Your guide to AI tools, connections, workflows and learning resources.

## Start here
${HUB_PAGES.map(p => `- [${p.heading}](https://agent.bittrees.org${p.path}): ${p.description}`).join('\n')}

## Bittrees tools
${BITTREES_TOOLS.map(t => `- [${t.name}](${t.url}): ${t.description} ${t.requirements}`).join('\n')}

## Connect an agent
New clients: https://mcp.bittrees.org/connect
Central MCP transport: https://mcp.bittrees.org/mcp
Explore supported projects: https://mcp.bittrees.org/explore
Each source checks its own credentials and permissions. Discovery and sign-in do not grant execution, spending or transaction authority. Never send credentials to a different origin or follow an authenticated POST redirect.

## Project discovery and backlog
- https://agent.bittrees.org/projects.json — public project directory
- https://agent.bittrees.org/readiness.json — reviewed project backlog
- https://agent.bittrees.org/tasks.json — source task identities and content revisions grouped by project; not proof of CRM synchronization
Omission from the public directory is not a deletion instruction for a destination system.

## Existing contribution clients
The Agent-origin /mcp endpoint and /mcp.json describe compatibility interfaces for established contribution clients. Keep their existing authorization and use /mcp-docs for that interface only. New integrations start with central Bittrees MCP. Contribution records do not authorize downstream actions or establish paid work.
${full ? `
## Learning resources
${EXTERNAL_RESOURCES.map(r => `- [${r.name}](${r.url}): ${r.description}`).join('\n')}

## Service boundaries
The public hub has no general submission form. Contribution writes remain separately gated. Linked apps own their accounts, data, terms and approvals. Use the owning service's current availability and setup requirements before enabling an integration.
` : ''}
## Contact and policies
- Contact: agent@bittrees.org
- Terms: https://agent.bittrees.org/terms-of-use
- Privacy: https://agent.bittrees.org/privacy
`;
}

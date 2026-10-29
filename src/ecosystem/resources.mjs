// Curated public links, reviewed 29 October 2026. Discovery is not authorization.
// Review descriptions with the owning app before changing availability claims.
export const HUB_REVIEWED_AT = '2026-10-29';
export const HUB_NAV = Object.freeze([
  { path: '/tools', label: 'Tools' },
  { path: '/workflows', label: 'Workflows' },
  { path: '/resources', label: 'Learn' },
  { path: '/developers', label: 'Developers' },
]);

export const BITTREES_TOOLS = Object.freeze([
  { id: 'ai', name: 'Bittrees AI', category: 'Run locally', url: 'https://ai.bittrees.org/', action: 'Set up Bittrees AI', availability: 'Mac development preview', description: 'Run local models, review drafts and work with saved context on your Mac.', requirements: 'Apple Silicon, macOS 13 or later. Runtime and models are separate downloads. Apple signing and notarization remain open.', links: [{ label: 'Installation guide', url: 'https://ai.bittrees.org/#setup' }, { label: 'Data and privacy', url: 'https://ai.bittrees.org/#privacy' }] },
  { id: 'mcp', name: 'Bittrees MCP', category: 'Connect tools', url: 'https://mcp.bittrees.org/connect', action: 'Connect your agent', availability: 'Scoped connections', description: 'Choose the Bittrees projects and tools your agent can discover through one MCP connection.', requirements: 'Each source controls its own access. Listed tools may need credentials, permissions and separately configured adapters.', links: [{ label: 'Explore projects', url: 'https://mcp.bittrees.org/explore' }, { label: 'Browse functions', url: 'https://mcp.bittrees.org/tools' }, { label: 'Connection guide', url: 'https://mcp.bittrees.org/mcp-docs' }, { label: 'Service status', url: 'https://mcp.bittrees.org/status' }] },
  { id: 'workflows', name: 'Bittrees Workflows', category: 'Manage work', url: 'https://workflow.bittrees.org/', action: 'Open Workflows', availability: 'Account access required', description: 'Review and manage workflows available through your Bittrees account.', requirements: 'Available work depends on your current roles and source permissions. Local execution requires an enrolled device and approved authority.', links: [{ label: 'About Workflows', url: 'https://workflow.bittrees.org/about/' }] },
  { id: 'roles', name: 'Bittrees Roles', category: 'Review access', url: 'https://roles.bittrees.org/', action: 'Review roles and access', availability: 'Account access required', description: 'Review member roles, assignments and delegated access.', requirements: 'Signing in identifies you. It does not grant execution permission or replace required owner and controller approvals.', links: [] },
  { id: 'device', name: 'AI device permissions', category: 'Review access', url: 'https://ai.bittrees.org/workflows', action: 'Review device permissions', availability: 'Owner approval required', description: 'Review the workflow connections and permissions associated with your Mac.', requirements: 'Device enrollment, workflow signatures and source consent are separate approvals. Autonomous execution is not universally available.', links: [] },
  { id: 'automations', name: 'MCP automations', category: 'Manage work', url: 'https://mcp.bittrees.org/automations', action: 'Review automations', availability: 'Configuration required', description: 'Prepare automations, define their allowed scope and review activity.', requirements: 'Execution needs supported adapters, current credentials and permissions. A healthy service does not mean every connection is ready.', links: [{ label: 'Rules', url: 'https://mcp.bittrees.org/rules' }, { label: 'Service status', url: 'https://mcp.bittrees.org/status' }] },
]);

export const EXTERNAL_RESOURCES = Object.freeze([
  { id: 'mcp-intro', name: 'Understand MCP', publisher: 'Model Context Protocol', format: 'Guide', audience: 'Getting started', url: 'https://modelcontextprotocol.io/docs/getting-started/intro', description: 'Learn how AI applications connect to tools and data through a common protocol.' },
  { id: 'agents-course', name: 'Build your first agent', publisher: 'Hugging Face', format: 'Course', audience: 'Learning to build', url: 'https://huggingface.co/learn/agents-course/unit0/introduction', description: 'Work through agent concepts, frameworks and practical exercises. Python and basic LLM knowledge help with the exercises.' },
  { id: 'mcp-registry', name: 'Discover MCP servers', publisher: 'Model Context Protocol', format: 'Directory', audience: 'Choosing integrations', url: 'https://registry.modelcontextprotocol.io/', description: 'Browse the official MCP server registry. A listing is not a Bittrees integration approval or security review.' },
  { id: 'mcp-servers', name: 'Explore reference servers', publisher: 'Model Context Protocol', format: 'Source code', audience: 'Developers', url: 'https://github.com/modelcontextprotocol/servers', description: 'Study reference implementations before building a server. Review each server’s access and installation requirements.' },
]);

export const HUB_PAGES = Object.freeze([
  { path: '/', title: 'Bittrees Agent | AI tools and resources', heading: 'Put AI agents to work.', description: 'Find Bittrees AI tools, connect your agent through MCP, manage workflows and learn how to build.' },
  { path: '/tools', title: 'AI tools | Bittrees Agent', heading: 'Choose the tool for your next task.', description: 'Explore Bittrees tools for local AI, agent connections, workflows and permission review.' },
  { path: '/workflows', title: 'Agent workflows | Bittrees Agent', heading: 'From an idea to reviewed work.', description: 'Understand how Bittrees AI, MCP, Workflows and Roles fit together before connecting an agent.' },
  { path: '/resources', title: 'Learn about agents | Bittrees Agent', heading: 'Learn, build, then connect.', description: 'Selected official guides, courses and reference resources for working with AI agents.' },
  { path: '/developers', title: 'Agent developer resources | Bittrees Agent', heading: 'Build on clear interfaces.', description: 'Find the central Bittrees MCP endpoint, setup guides and existing Agent discovery contracts.' },
  { path: '/contribute', title: 'Contribute | Bittrees Agent', heading: 'Bring useful work to Bittrees.', description: 'Choose a project, review its needs and prepare a contribution for its owner to review.' },
]);

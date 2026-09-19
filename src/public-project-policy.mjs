// Owner-directed exclusions. Removing an entry requires explicit publication approval.
// This policy is separate from imported snapshots so a refresh cannot re-enable it.
const excluded = new Set(['bitlogic','bittrees-vault','vault','skillmesh','skill-mesh','metatokens','meta-tokens','wallet','bittrees-wallet','treeswap','tree-swap','builders-advocacy-group','builders-advocacy','bag','mycloud','my-cloud','node','bittrees-node','ipsf-node']);
export const isExcludedProject = value => typeof value === 'string' && excluded.has(value.toLowerCase());
export function publicProjectAllowed(project) {
  return ![project.id, project.projectId, project.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ...(project.aliases ?? [])].some(isExcludedProject)
    && !/bitlogic|skillmesh|bittrees-vault|metatokens|treeswap|builders-advocacy|buildersadvocacy|mycloud|ipsf-node|wallet\.bittrees|node\.bittrees/i.test(JSON.stringify(project));
}
export function publicCatalog(catalog) { return {...catalog,projects:catalog.projects.filter(publicProjectAllowed)}; }

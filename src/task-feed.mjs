import { createHash } from 'node:crypto';
import { publicCatalog } from './public-project-policy.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const origin = 'https://agent.bittrees.org';
const text = { type: 'string' };
export const TASK_FEED_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Agent public task feed v1', type: 'object',
  required: ['schema', 'source', 'revision', 'projects', 'tombstones', 'syncPolicy'],
  properties: {
    schema: { const: 'agent.bittrees.task-feed.v1' }, source: { const: origin },
    revision: { type: 'string', pattern: '^[a-f0-9]{64}$' }, reviewedAt: text,
    syncPolicy: { type: 'object' },
    tombstones: { type: 'array', items: { type: 'object', required: ['sourceId', 'reason'], properties: {sourceId: text, reason: text} } },
    projects: { type: 'array', items: { type: 'object', required: ['projectId', 'name', 'siteUrl', 'tasks'], properties: {
      projectId: text, name: text, siteUrl: { type: ['string','null'] },
      tasks: { type: 'array', items: { type: 'object', required: ['sourceId', 'projectId', 'title', 'description', 'status', 'priority', 'sourceUrl', 'contentHash'], properties: {
        sourceId: text, projectId: text, title: text, description: text,
        status: { enum: ['todo','in-progress','blocked','done'] }, priority: { enum: ['P0','P1','P2'] },
        sourceUrl: {type:'string',format:'uri'}, contentHash: {type:'string',pattern:'^[a-f0-9]{64}$'},
        acceptanceCriteria: {type:'array',items:text}, progressNote: text, area: text,
      } } },
    } } },
  },
};

export function buildTaskFeed(readiness, catalog) {
  const allowed = new Map(publicCatalog(catalog).projects.map(p => [p.id,p]));
  const seen = new Set();
  const projects = publicCatalog(readiness).projects.filter(p => allowed.has(p.projectId)).map(project => {
    const tasks = project.tasks.map(task => {
      const sourceId = `agent-readiness:${project.projectId}:${task.id}`;
      if (seen.has(sourceId)) throw new Error('Duplicate task source identity');
      seen.add(sourceId);
      const record = {
        sourceId, projectId: project.projectId, title: task.title,
        description: [task.title, ...task.acceptanceCriteria, task.progressNote].filter(Boolean).join('\n\n'),
        status: task.status, priority: task.priority, area: task.area,
        acceptanceCriteria: [...task.acceptanceCriteria], progressNote: task.progressNote ?? '',
        sourceUrl: `${origin}/readiness#${encodeURIComponent(task.id)}`,
      };
      return {...record, contentHash: digest(record)};
    }).sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
    const metadata = allowed.get(project.projectId);
    return {projectId: project.projectId, name: metadata.name, siteUrl: metadata.publicUrl ?? null, tasks};
  }).sort((a,b)=>a.projectId.localeCompare(b.projectId));
  const content = {
    schema: 'agent.bittrees.task-feed.v1', source: origin, reviewedAt: readiness.reviewedAt,
    syncPolicy: {direction:'source-to-crm', missingTaskAction:'retain-for-review', completionAuthority:'source-review', crmUserEdits:'conflict-review', writesRequire:'approved-mcp-actor-and-crm-project-grants'},
    projects,
    // Omission is never a deletion instruction. Future explicit retirements must
    // carry sourceId + reason here and still require review in the destination.
    tombstones: [],
  };
  return {...content, revision: digest(content)};
}

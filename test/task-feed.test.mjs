import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTaskFeed} from '../src/task-feed.mjs';
import {BITTREES_PROJECT_REGISTRY as catalog, PROJECT_READINESS_REGISTRY as readiness, JSON_ROUTE_MAP, buildJsonResponse, buildStaticAssets} from '../src/portal.mjs';
test('task feed exports the complete allowed backlog with stable IDs and content revisions',()=>{
  const a = buildTaskFeed(readiness,catalog);
  assert.equal(a.projects.length,11);
  assert.equal(a.projects.flatMap(p=>p.tasks).length,66);
  const changed = structuredClone(readiness);
  changed.projects[0].tasks[0].title += ' updated';
  const b = buildTaskFeed(changed,catalog);
  const original = a.projects.flatMap(p=>p.tasks).find(t=>t.sourceId.endsWith(changed.projects[0].tasks[0].id));
  const update = b.projects.flatMap(p=>p.tasks).find(t=>t.sourceId===original.sourceId);
  assert.notEqual(a.revision,b.revision); assert.notEqual(original.contentHash,update.contentHash);
  const unchanged = a.projects.flatMap(p=>p.tasks).filter(t=>t.sourceId!==original.sourceId);
  for(const t of unchanged) assert.deepEqual(b.projects.flatMap(p=>p.tasks).find(x=>x.sourceId===t.sourceId),t);
  changed.projects.reverse(); for(const p of changed.projects)p.tasks.reverse();
  assert.equal(buildTaskFeed(changed,catalog).revision,b.revision);
});
test('excluded imports and omissions cannot instruct CRM deletion or introduce withdrawn tasks',()=>{
  const copy=structuredClone(readiness);copy.projects.push({...structuredClone(copy.projects[0]),projectId:'wallet'});
  const imported=structuredClone(catalog);imported.projects.push({...structuredClone(imported.projects[0]),id:'wallet'});
  const a=buildTaskFeed(copy,imported);assert.equal(a.projects.length,11);
  assert.equal(a.syncPolicy.missingTaskAction,'retain-for-review');assert.deepEqual(a.tombstones,[]);
  assert.ok(!a.projects.some(p=>p.projectId==='wallet'));
  copy.projects[0].tasks.push(copy.projects[0].tasks[0]);
  assert.throws(()=>buildTaskFeed(copy,catalog),/Duplicate/);
});
test('task feed is available through the existing JSON envelope and static discovery',()=>{
  const result=buildJsonResponse(JSON_ROUTE_MAP.get('/tasks.json'));
  assert.equal(result.schema.title,'Agent public task feed v1');
  assert.equal(result.data.schema,'agent.bittrees.task-feed.v1');
  const {revision,...content}=result.data;
  assert.equal(createHash('sha256').update(JSON.stringify(content)).digest('hex'),revision);
  for(const task of content.projects.flatMap(p=>p.tasks)){const {contentHash,...fields}=task;assert.equal(createHash('sha256').update(JSON.stringify(fields)).digest('hex'),contentHash);}
  assert.ok(result.generatedAt);assert.ok(buildStaticAssets().some(a=>a.path==='tasks.json'));
});

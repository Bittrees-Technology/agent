import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { createPublicAgentReadModel, createPublicAgentMcpHandler, PUBLIC_MCP_PATH, PUBLIC_MANIFEST_PATH } from '../src/public-read-mcp.mjs';
import { createRequestHandler, buildStaticAssets, BITTREES_PROJECT_REGISTRY, PROJECT_READINESS_REGISTRY, OPPORTUNITIES } from '../src/portal.mjs';
import { buildTaskFeed } from '../src/task-feed.mjs';

const feed=()=>buildTaskFeed(PROJECT_READINESS_REGISTRY,BITTREES_PROJECT_REGISTRY);
const makeModel=(extra={})=>createPublicAgentReadModel({projects:()=>BITTREES_PROJECT_REGISTRY,opportunities:()=>OPPORTUNITIES,taskFeed:feed,...extra});
const packet=(method,params,id=1)=>({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})});
const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'};
async function serverTest(fn,options={}) {
  const server=createServer(createRequestHandler(options));server.listen(0,'127.0.0.1');await once(server,'listening');
  try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}
async function post(base,value,extra={}){return fetch(base+PUBLIC_MCP_PATH,{method:'POST',headers:{...headers,...extra},body:typeof value==='string'?value:JSON.stringify(value)})}

test('public manifest matches exact source tools and static/live mirrors',async()=>{
  const manifest=JSON.parse(readFileSync(new URL('../bittrees.tools.json',import.meta.url))),connection=manifest.connections[0];
  assert.equal(manifest.projectId,'agent');assert.equal(manifest.canonicalDiscovery,'https://mcp.bittrees.org/mcp');
  assert.equal(connection.endpoint,'https://agent.bittrees.org'+PUBLIC_MCP_PATH);
  assert.deepEqual(connection.setup,{authentication:'none'});assert.deepEqual(Object.keys(connection.operations),['read']);
  assert.deepEqual(connection.operations.read,makeModel().tools().map(t=>t.name));
  const asset=buildStaticAssets().find(a=>a.path===PUBLIC_MANIFEST_PATH.slice(1));
  assert.deepEqual(JSON.parse(asset.body),manifest);
  await serverTest(async base=>{const r=await fetch(base+PUBLIC_MANIFEST_PATH);assert.equal(r.status,200);assert.equal(await r.text(),asset.body);assert.equal((await fetch(base+PUBLIC_MANIFEST_PATH,{method:'HEAD'})).status,200)});
});

test('real public snapshot tools expose only bounded public projection and preserve all task identities/hashes',()=>{
  const m=makeModel();for(const t of m.tools()){assert.equal(t.inputSchema.additionalProperties,false);assert.deepEqual(t.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false})}
  const projects=m.call('agent.list_projects',{}).structuredContent;
  assert.equal(projects.pagination.total,22);assert.ok(projects.results.every(p=>!('owner'in p)&&!('sourceEvidence'in p)&&!('authScopes'in p)));
  const opportunities=m.call('agent.list_opportunities',{}).structuredContent;
  assert.equal(opportunities.pagination.total,4);assert.ok(!JSON.stringify(opportunities).includes('IDACC'));
  assert.throws(()=>m.call('agent.get_opportunity',{opportunityId:'agent-profile-intake'}));
  const detail=m.call('agent.get_opportunity',{opportunityId:'contribution-template-pilot'}).structuredContent;
  assert.equal(detail.results[0].reviewRequired,true);assert.ok(detail.results[0].acceptanceCriteria.length);
  const expected=feed(),got=[];let offset=0,revision;
  do{const result=m.call('agent.list_tasks',{offset,limit:20,...(revision?{revision}:{})});const d=result.structuredContent;
    assert.equal(d.sourceRevision,expected.revision);assert.equal(d.grantsAuthority,false);assert.equal(d.readOnly,true);
    assert.equal(d.syncPolicy.missingTaskAction,'retain-for-review');assert.equal(d.syncPolicy.crmUserEdits,'conflict-review');
    assert.ok(Buffer.byteLength(JSON.stringify(result))<65536);got.push(...d.results);offset=d.pagination.nextOffset;revision=d.sourceRevision;
  }while(offset!==null);
  assert.equal(got.length,60);assert.equal(new Set(got.map(t=>t.sourceId)).size,60);
  const original=expected.projects.flatMap(p=>p.tasks).sort((a,b)=>a.sourceId.localeCompare(b.sourceId));assert.deepEqual(got,original);
});

test('unknown tools, write names, private lookups, URLs, credentials, identifiers and invalid filters fail closed',()=>{
  const m=makeModel();for(const name of ['register_external_agent','agent.submit_contribution','agent.get_receipt','get_agent_reputation','agent.list_tasks/../admin'])assert.throws(()=>m.call(name,{}));
  for(const args of [{url:'https://private.invalid'},{headers:{Authorization:'secret'}},{token:'secret'},{receiptId:'x'},{projectId:'wallet'},{projectId:'id-agent-control-center'},{projectId:'agent%2fadmin'},{limit:0},{limit:21},{offset:0.5},{offset:1},{revision:'x'},{priority:'high'},{status:'private'}])assert.throws(()=>m.call('agent.list_tasks',args));
  for(const opportunityId of ['%63ontribution-template-pilot','../admin','__proto__','constructor', 'missing'])assert.throws(()=>m.call('agent.get_opportunity',{opportunityId}));
  assert.throws(()=>m.call('agent.list_opportunities',{priority:'P0'}));
});

test('later pages require the unchanged snapshot revision',()=>{
  let catalog=structuredClone(BITTREES_PROJECT_REGISTRY);const m=makeModel({projects:()=>catalog});const first=m.call('agent.list_projects',{}).structuredContent;
  catalog.projects[0].summary+=' changed';assert.throws(()=>m.call('agent.list_projects',{offset:10,revision:first.sourceRevision}),/snapshot changed/);
});

test('record-size budgeting paginates honestly without truncating records or advancing past omitted data',()=>{
  const f=feed(),original=f.projects[0].tasks[0];
  f.projects=[{projectId:original.projectId,tasks:Array.from({length:20},(_,i)=>({...original,sourceId:`task-${i}`,description:'x'.repeat(11000)}))}];
  const m=makeModel({taskFeed:()=>f});const r=m.call('agent.list_tasks',{limit:20});
  assert.equal(r.structuredContent.pagination.byteLimited,true);assert.equal(r.structuredContent.results.length,2);assert.equal(r.structuredContent.pagination.nextOffset,2);
  assert.equal(r.structuredContent.results[0].description.length,11000);assert.ok(Buffer.byteLength(JSON.stringify(r))<65536);
  f.projects[0].tasks[0].description='x'.repeat(13000);assert.throws(()=>m.call('agent.list_tasks',{}),/source text/);
});

test('private and extra fields never cross a public snapshot projection',()=>{
  const catalog=structuredClone(BITTREES_PROJECT_REGISTRY);catalog.projects[0].privateKey='NEVER-PUBLIC';catalog.projects[0].controller={session:'NEVER-PUBLIC'};
  const f=feed();f.projects[0].tasks[0].privateHistory={secret:'NEVER-PUBLIC'};
  const m=makeModel({projects:()=>catalog,taskFeed:()=>f});
  for(const name of ['agent.list_projects','agent.list_tasks'])assert.ok(!JSON.stringify(m.call(name,{})).includes('NEVER-PUBLIC'));
});
test('actual HTTP task pages exactly match the existing sanitized public GET feed',()=>serverTest(async base=>{
  const old=await(await fetch(base+'/tasks.json')).json(),expected=old.data,got=[];let offset=0,revision;
  do{
    const response=await post(base,packet('tools/call',{name:'agent.list_tasks',arguments:{limit:20,offset,...(revision?{revision}:{})}}));
    assert.equal(response.status,200);const raw=await response.text();assert.ok(Buffer.byteLength(raw)<=65536);
    const d=JSON.parse(raw).result.structuredContent;assert.equal(d.sourceRevision,expected.revision);assert.deepEqual(d.syncPolicy,expected.syncPolicy);
    got.push(...d.results);offset=d.pagination.nextOffset;revision=d.sourceRevision;
  }while(offset!==null);
  assert.deepEqual(got,expected.projects.flatMap(p=>p.tasks).sort((a,b)=>a.sourceId.localeCompare(b.sourceId)));
}));

test('stateless protocol negotiates initialization, lists tools, reads and accepts supported notifications',()=>serverTest(async base=>{
  let r=await post(base,packet('initialize',{protocolVersion:'2099-01-01',capabilities:{},clientInfo:{name:'test',version:'1'}}));
  assert.equal(r.status,200);let j=await r.json();assert.equal(j.result.protocolVersion,'2025-11-25');assert.equal(r.headers.get('mcp-session-id'),null);
  r=await post(base,{jsonrpc:'2.0',method:'notifications/initialized'});assert.equal(r.status,202);assert.equal(await r.text(),'');
  j=await(await post(base,packet('tools/list'))).json();assert.equal(j.result.tools.length,4);
  j=await(await post(base,packet('tools/call',{name:'agent.list_tasks',arguments:{projectId:'agent',limit:1}}))).json();assert.equal(j.result.structuredContent.results[0].projectId,'agent');
  for(const version of ['2025-11-25','2025-06-18'])assert.equal((await post(base,packet('ping'),{'mcp-protocol-version':version})).status,200);
  assert.equal((await fetch(base+PUBLIC_MCP_PATH)).status,405);assert.equal((await fetch(base+PUBLIC_MCP_PATH,{method:'DELETE'})).status,405);
}));

test('transport rejects malformed requests, prototype keys, wrong negotiation, origins, queries and large bodies',()=>serverTest(async base=>{
  for(const raw of ['{','[]','null','{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"__proto__":{}}}'])assert.equal((await post(base,raw)).status,400,raw);
  for(const extra of [{origin:'https://evil.invalid'},{origin:'null'}])assert.equal((await post(base,packet('tools/list'),extra)).status,403);
  assert.equal((await post(base,packet('tools/list'),{'content-type':'text/plain'})).status,415);
  assert.equal((await post(base,packet('tools/list'),{accept:'application/json'})).status,406);
  assert.equal((await post(base,packet('tools/list'),{'mcp-protocol-version':'unsupported'})).status,400);
  assert.equal((await post(base,packet('tools/list'),{'mcp-protocol-version':''})).status,400);
  for(const request of [packet('tools/list',null),packet('tools/list',{_meta:true}),packet('tools/call',{name:'agent.list_tasks',arguments:null}),{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:{}}}])assert.equal((await post(base,request)).status,400);
  assert.equal((await post(base,{jsonrpc:'2.0',method:'tools/call',params:{name:'agent.list_tasks'}})).status,400);
  assert.equal((await post(base,packet('tools/call',{name:'agent.list_tasks',arguments:{constructor:{}}}))).status,400);
  assert.equal((await post(base,' '.repeat(16385))).status,413);
  assert.equal((await fetch(base+PUBLIC_MCP_PATH+'?url=https://private.invalid',{method:'POST',headers,body:JSON.stringify(packet('tools/list'))})).status,400);
}));

test('bearer/cookie presence cannot change output or enter legacy stores and outbox services',()=>{
  const forbidden=new Proxy({},{get(){throw Error('PRIVATE SERVICE ACCESSED')}});
  return serverTest(async base=>{
    const call=packet('tools/call',{name:'agent.list_tasks',arguments:{limit:1}});
    const a=await(await post(base,call)).json(),b=await(await post(base,call,{authorization:'Bearer must-not-be-used',cookie:'session=must-not-be-used'})).json();
    assert.deepEqual(a,b);assert.equal(a.result.isError,false);
    const unknown=await(await post(base,packet('tools/call',{name:'submit_contribution',arguments:{}}))).json();assert.ok(unknown.error);
  },{workflow:forbidden,contributionService:forbidden});
});

test('preparsed platform payloads and final wire output are independently size bounded',async()=>{
  async function invoke(handler,value){const req=new PassThrough();req.method='POST';req.headers=headers;req.body=value;let status,body;const res={writeHead(s){status=s},end(b){body=b}};await handler(req,res);return {status,body}}
  const h=createPublicAgentMcpHandler(makeModel());assert.equal((await invoke(h,{...packet('tools/list'),padding:'x'.repeat(17000)})).status,413);
  assert.equal((await invoke(h,packet('tools/call',{name:'agent.list_tasks',arguments:{limit:1}}))).status,200);
  const huge=createPublicAgentMcpHandler({tools:()=>[],call:()=>({content:[{type:'text',text:'x'.repeat(66000)}]})});
  const r=await invoke(huge,packet('tools/call',{name:'agent.list_tasks',arguments:{}}));assert.equal(r.status,503);assert.ok(r.body.length<1000);
});
test('oversized public source snapshots fail closed before projection',()=>{
  const oversized=structuredClone(BITTREES_PROJECT_REGISTRY);oversized.unused='x'.repeat(270000);
  assert.throws(()=>makeModel({projects:()=>oversized}).tools(),/source catalog limit/);
  const taskSource=feed();taskSource.unused='x'.repeat(270000);assert.throws(()=>makeModel({taskFeed:()=>taskSource}).call('agent.list_tasks',{}),/task source unavailable/);
});

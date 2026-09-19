import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {buildStaticAssets,createRequestHandler,BITTREES_PROJECT_REGISTRY,PROJECT_READINESS_REGISTRY,callMcpTool} from '../src/portal.mjs';
import {CATALOG,validateCatalog,catalogView,selectionFromParams} from '../src/ecosystem/catalog.mjs';
const ids=['bitlogic','bittrees-vault','skillmesh','metatokens','wallet','treeswap','builders-advocacy-group','mycloud','node'];
const names=/bitlogic|skillmesh|bittrees[- ]vault|metatokens|treeswap|builders[- ]advocacy|mycloud|bittrees node|wallet\.bittrees|node\.bittrees/i;
test('withdrawn products are absent from every generated public asset and readiness record',()=>{
  assert.equal(BITTREES_PROJECT_REGISTRY.projects.length,22);
  for(const id of ids){assert.ok(!BITTREES_PROJECT_REGISTRY.projects.some(p=>p.id===id));assert.ok(!PROJECT_READINESS_REGISTRY.projects.some(p=>p.projectId===id));assert.equal(callMcpTool('get_bittrees_project',{projectId:id}).structuredContent.status,'not_found');}
  for(const asset of buildStaticAssets())if(typeof asset.body==='string')assert.doesNotMatch(asset.body,names,asset.path);
});
test('a future snapshot cannot republish excluded identities, aliases or pending entries',()=>{
  const copied=structuredClone(CATALOG);for(const id of ids)copied.projects.push({...structuredClone(CATALOG.projects[0]),id});
  copied.projects.push({...structuredClone(CATALOG.projects[0]),id:'renamed-product',aliases:['bag']});
  assert.equal(validateCatalog(copied).projects.length,22);
  const view=catalogView(copied,selectionFromParams(new URLSearchParams()),{includePending:true});assert.doesNotMatch(JSON.stringify(view),names);assert.ok(!view.projects.some(p=>ids.includes(p.id)));
  for(const id of [...ids,'vault','bag','ipsf-node','bittrees-wallet'])assert.throws(()=>selectionFromParams(new URLSearchParams({mode:'selected',projects:id})),/not available/);
});
test('live handler hides withdrawn project routes and refuses saved connection handoffs',async()=>{
  const server=createServer(createRequestHandler());server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const path of ['/projects','/readiness','/projects.json','/readiness.json','/catalog.json','/llms.txt','/llms-full.txt','/.well-known/ai-catalog.json','/mcp/server-card','/onboarding']){const r=await fetch(origin+path);assert.equal(r.status,200,path);assert.doesNotMatch(await r.text(),names,path);}
    for(const id of ids){assert.equal((await fetch(origin+'/v1/projects/'+id)).status,404);const r=await fetch(origin+'/connect?mode=selected&projects='+id,{redirect:'manual'});assert.equal(r.status,400);assert.equal(r.headers.get('location'),null);}
  }finally{await new Promise(r=>server.close(r));}
});

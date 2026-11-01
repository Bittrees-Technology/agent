import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { publicCatalog, isExcludedProject } from './public-project-policy.mjs';

export const PUBLIC_MCP_PATH = '/api/public-mcp';
export const PUBLIC_MANIFEST_PATH = '/.well-known/bittrees-tools.json';
export const PUBLIC_MCP_VERSIONS = ['2025-11-25', '2025-06-18'];
export const PUBLIC_MCP_INPUT_BYTES = 16384;
export const PUBLIC_MCP_OUTPUT_BYTES = 65536;
const PAGE_BYTES = 24000;
const ORIGIN = 'https://agent.bittrees.org';
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const HASH = /^[a-f0-9]{64}$/;
const plain = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bytes = v => Buffer.byteLength(JSON.stringify(v));
const fail = (message, code = -32602, status = 400) => { throw Object.assign(Error(message), { code, status }); };
const schema = properties => ({type:'object', properties, additionalProperties:false});
const textSchema = maxLength => ({type:'string', maxLength});
const enumSchema = values => ({type:'string', enum:[...new Set(values)].sort()});
function keys(v, allowed, required = [], code = -32602) {
  if (!plain(v) || Object.keys(v).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(v,k))) fail('Invalid request fields.',code);
}
function safeJson(v, depth = 0) {
  if (depth > 12) fail('Request nesting limit exceeded.');
  if (Array.isArray(v)) { if(v.length>100) fail('Request array limit exceeded.'); v.forEach(x=>safeJson(x,depth+1)); }
  else if (v && typeof v === 'object') {
    if(!plain(v) || Object.keys(v).length>100) fail('Invalid request object.');
    for(const [k,x] of Object.entries(v)) { if(['__proto__','prototype','constructor'].includes(k)) fail('Unsupported request key.'); safeJson(x,depth+1); }
  } else if (!['string','boolean','number'].includes(typeof v) && v !== null) fail('Invalid JSON value.');
}
function string(v, max = 4000) {
  if(typeof v !== 'string' || v.length>max) fail('Public source text is unavailable.',-32603,503);
  return v;
}
function strings(v, max = 30) {
  if(!Array.isArray(v)||v.length>max) fail('Public source list is unavailable.',-32603,503);
  return v.map(x=>string(x,2000));
}
function link(v) {
  if(v===undefined || v===null) return null;
  let url;try{url=new URL(v)}catch{fail('Public source link is unavailable.',-32603,503)}
  if(url.protocol!=='https:'||url.username||url.password) fail('Public source link is unavailable.',-32603,503);
  return url.href;
}
function publicId(v) {
  if(typeof v!=='string'||!ID.test(v)) fail('Invalid public identifier.');
  return v;
}
const limitations = [
  'Public curated snapshots only; private queue state and live execution are not verified.',
  'Discovery, task status and contribution briefs grant no access, assignment, compensation or execution authority.',
  'No imports or writes are performed. Source owners must review any subsequent action.',
];

// Providers are synchronous public snapshot builders. Never pass a queue,
// credential, database, registry controller or generic URL-fetching service.
export function createPublicAgentReadModel({projects, opportunities, taskFeed, sourceCommit = null}) {
  function snapshot() {
    const catalog=publicCatalog(projects()), allowed=new Set(catalog.projects.map(p=>p.id));
    if(catalog.projects.length>300||bytes(catalog)>256*1024) fail('Public source catalog limit exceeded.',-32603,503);
    const projectRows=catalog.projects.map(p=>({
      id:publicId(p.id),name:string(p.name,200),summary:string(p.summary),
      publicUrl:link(p.publicUrl),repositoryUrl:link(p.repositoryUrl),
      lanes:strings(p.lanes),availability:string(p.availability,100),
      lifecycle:string(p.lifecycle,100),approval:string(p.approval,100),affiliation:string(p.affiliation,100),
    })).sort((a,b)=>a.id.localeCompare(b.id));
    // Retired/private project opportunities are not reintroduced through MCP.
    const raw=opportunities();if(!Array.isArray(raw)||raw.length>300||bytes(raw)>256*1024) fail('Public opportunity source unavailable.',-32603,503);
    const opportunityRows=raw.filter(o=>Array.isArray(o.projectIds)&&o.projectIds.length&&o.projectIds.every(id=>allowed.has(id)&&!isExcludedProject(id))).map(o=>({
      id:publicId(o.id),title:string(o.title,300),summary:string(o.summary),
      lane:string(o.lane,100),priority:string(o.priority,100),status:string(o.status,100),
      projectIds:strings(o.projectIds,300),acceptanceCriteria:strings(o.acceptanceCriteria),
      sourceUrl:`${ORIGIN}/v1/workflow/opportunities/${o.id}`,reviewRequired:true,
    })).sort((a,b)=>a.id.localeCompare(b.id));
    return {catalog,allowed,projectRows,opportunityRows};
  }
  const pageProperties={offset:{type:'integer',minimum:0,maximum:10000},limit:{type:'integer',minimum:1,maximum:20},revision:{type:'string',pattern:'^[a-f0-9]{64}$'}};
  const projectProperty={type:'string',pattern:ID.source,maxLength:80};
  function tools() {
    const s=snapshot(),enumFor=key=>enumSchema(s.opportunityRows.map(o=>o[key]));
    return [
      ['agent.list_projects','Read a bounded page of public project discovery metadata.',schema({...pageProperties,query:textSchema(200)})],
      ['agent.list_opportunities','Read public contribution opportunities; owner review remains required.',schema({...pageProperties,projectId:projectProperty,lane:enumFor('lane'),priority:enumFor('priority'),status:enumFor('status')})],
      ['agent.get_opportunity','Read one public opportunity brief and acceptance criteria; no receipt or private queue lookup.',{...schema({opportunityId:{...projectProperty,enum:s.opportunityRows.map(o=>o.id)}}),required:['opportunityId']}],
      ['agent.list_tasks','Read a public task-feed page with original source IDs, hashes and revision. Does not sync CRM.',schema({...pageProperties,projectId:projectProperty,priority:enumSchema(['P0','P1','P2']),status:enumSchema(['todo','in-progress','blocked','done'])})],
    ].map(([name,description,inputSchema])=>({name,description,inputSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}));
  }
  function call(name,args={}) {
    const tool=tools().find(t=>t.name===name);if(!tool) fail('Unknown public read tool.');
    keys(args,Object.keys(tool.inputSchema.properties),tool.inputSchema.required??[]);
    for(const [key,value] of Object.entries(args)) {
      const p=tool.inputSchema.properties[key];
      if(p.type==='integer'&&(!Number.isSafeInteger(value)||value<p.minimum||value>p.maximum))fail('Invalid page bounds.');
      if(p.type==='string'&&(typeof value!=='string'||(p.maxLength&&value.length>p.maxLength)||(p.pattern&&!new RegExp(p.pattern).test(value))||(p.enum&&!p.enum.includes(value))))fail('Invalid public read filter.');
    }
    if((args.offset??0)>0&&!args.revision)fail('Pass the first page revision when requesting later pages.');
    const s=snapshot();if(args.projectId&&!s.allowed.has(args.projectId))fail('Unknown public project.');
    let rows,revision,reviewedAt=s.catalog.reviewedAt??null,syncPolicy=null;
    if(name==='agent.list_projects') {
      revision=digest(s.projectRows);const q=(args.query??'').trim().toLowerCase();
      rows=s.projectRows.filter(p=>!q||`${p.id} ${p.name} ${p.summary}`.toLowerCase().includes(q));
    } else if(name==='agent.list_opportunities'||name==='agent.get_opportunity') {
      revision=digest(s.opportunityRows);reviewedAt=null;
      rows=s.opportunityRows.filter(o=>(!args.opportunityId||o.id===args.opportunityId)&&(!args.projectId||o.projectIds.includes(args.projectId))&&['lane','priority','status'].every(k=>!args[k]||o[k]===args[k]));
      if(args.opportunityId&&!rows.length)fail('Unknown public opportunity.');
    } else {
      const feed=taskFeed();if(feed.schema!=='agent.bittrees.task-feed.v1'||!HASH.test(feed.revision)||!Array.isArray(feed.projects)||bytes(feed)>256*1024)fail('Public task source unavailable.',-32603,503);
      revision=feed.revision;reviewedAt=feed.reviewedAt??null;
      syncPolicy={direction:'source-to-crm',missingTaskAction:'retain-for-review',completionAuthority:'source-review',crmUserEdits:'conflict-review',writesRequire:'approved-mcp-actor-and-crm-project-grants'};
      rows=feed.projects.filter(p=>s.allowed.has(p.projectId)&&!isExcludedProject(p.projectId)).flatMap(p=>p.tasks.map(t=>{
        if(t.projectId!==p.projectId||!HASH.test(t.contentHash)||!['todo','in-progress','blocked','done'].includes(t.status)||!['P0','P1','P2'].includes(t.priority))fail('Public task record unavailable.',-32603,503);
        return {sourceId:string(t.sourceId,200),projectId:publicId(t.projectId),title:string(t.title,300),description:string(t.description,12000),status:t.status,priority:t.priority,area:string(t.area,200),acceptanceCriteria:strings(t.acceptanceCriteria),progressNote:string(t.progressNote,4000),sourceUrl:link(t.sourceUrl),contentHash:t.contentHash};
      })).sort((a,b)=>a.sourceId.localeCompare(b.sourceId)).filter(t=>(!args.projectId||t.projectId===args.projectId)&&(!args.priority||t.priority===args.priority)&&(!args.status||t.status===args.status));
    }
    if(args.revision&&args.revision!==revision)fail('Public snapshot changed. Restart pagination from the first page.');
    const offset=args.offset??0,limit=name==='agent.get_opportunity'?1:args.limit??10,results=[];
    for(const row of rows.slice(offset,offset+limit)) {
      if(bytes([...results,row])>PAGE_BYTES)break;
      results.push(row);
    }
    if(!results.length&&offset<rows.length)fail('Public record exceeds the response limit.',-32603,503);
    const nextOffset=offset+results.length<rows.length?offset+results.length:null;
    const value={schema:'bittrees.agent.public-read.v1',source:ORIGIN,sourceRevision:revision,sourceReviewedAt:reviewedAt,sourceCommit,readOnly:true,grantsAuthority:false,limitations,results,pagination:{offset,limit,returned:results.length,total:rows.length,nextOffset,byteLimited:results.length<Math.min(limit,Math.max(0,rows.length-offset))},syncPolicy};
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false};
  }
  return {tools,call};
}

export function publicAgentToolManifest() {
  return JSON.parse(readFileSync(new URL('../bittrees.tools.json',import.meta.url),'utf8'));
}
async function body(req) {
  function parse(value) {
    const raw=typeof value==='string'?value:Buffer.isBuffer(value)?new TextDecoder('utf-8',{fatal:true}).decode(value):JSON.stringify(value);
    if(Buffer.byteLength(raw)>PUBLIC_MCP_INPUT_BYTES)fail('Request exceeds 16 KiB.',-32600,413);
    let result;try{result=JSON.parse(raw)}catch{fail('Invalid JSON.',-32700)}
    safeJson(result);return result;
  }
  if(req.body!==undefined)return parse(req.body);
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);chunks.length=0;error?reject(error):resolve(value)};
    const timer=setTimeout(()=>finish(Object.assign(Error('Request body timed out.'),{status:408,code:-32600})),5000);timer.unref?.();
    req.on('data',chunk=>{if(settled)return;const b=Buffer.from(chunk);size+=b.length;if(size>PUBLIC_MCP_INPUT_BYTES)return finish(Object.assign(Error('Request exceeds 16 KiB.'),{status:413,code:-32600}));chunks.push(b)});
    req.on('end',()=>{if(settled)return;try{finish(null,parse(Buffer.concat(chunks)))}catch(e){finish(e)}});
    req.on('error',()=>finish(Object.assign(Error('Request interrupted.'),{status:400,code:-32600})));
    req.on('aborted',()=>finish(Object.assign(Error('Request interrupted.'),{status:400,code:-32600})));
  });
}
export function createPublicAgentMcpHandler(model,{headers={}}={}) {
  return async(req,res)=>{
    let id=null;
    const send=(status,value,extra={})=>{
      let encoded=value===undefined?'':JSON.stringify(value);
      if(Buffer.byteLength(encoded)>PUBLIC_MCP_OUTPUT_BYTES){status=503;encoded=JSON.stringify({jsonrpc:'2.0',id,error:{code:-32603,message:'Public response exceeds its limit.'}})}
      res.writeHead(status,{...headers,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(encoded),'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',...extra});res.end(req.method==='HEAD'?undefined:encoded);
    };
    try {
      if(req.headers.origin&&!['https://agent.bittrees.org','https://mcp.bittrees.org'].includes(req.headers.origin))fail('Origin is not allowed.',-32600,403);
      if(req.method==='OPTIONS')return send(204,undefined,{Allow:'POST, OPTIONS'});
      if(req.method!=='POST')return send(405,{error:'method_not_allowed'},{Allow:'POST, OPTIONS'});
      if(String(req.headers['content-type']??'').split(';')[0].trim().toLowerCase()!=='application/json')fail('Content-Type must be application/json.',-32600,415);
      const accept=String(req.headers.accept??'').split(',').filter(v=>!/(?:^|;)\s*q=0(?:\.0*)?\s*(?:;|$)/.test(v)).map(v=>v.split(';')[0].trim().toLowerCase());
      if(!accept.includes('application/json')||!accept.includes('text/event-stream'))fail('Accept must include application/json and text/event-stream.',-32600,406);
      const m=await body(req);keys(m,['jsonrpc','id','method','params'],['jsonrpc','method'],-32600);
      if(m.jsonrpc!=='2.0'||typeof m.method!=='string'||m.method.length>100)fail('Invalid JSON-RPC request.',-32600);
      if(Object.hasOwn(m,'id')){if(!(typeof m.id==='string'&&m.id.length<=128)&&!Number.isSafeInteger(m.id))fail('Invalid JSON-RPC request ID.',-32600);id=m.id;}
      const version=req.headers['mcp-protocol-version'];
      if(m.method!=='initialize'&&!PUBLIC_MCP_VERSIONS.includes(version))fail('A supported MCP-Protocol-Version header is required.',-32600);
      if(m.method==='initialize'&&version!==undefined&&!PUBLIC_MCP_VERSIONS.includes(version))fail('Unsupported MCP protocol version.',-32600);
      const p=Object.hasOwn(m,'params')?m.params:{};
      if(!plain(p)||(p._meta!==undefined&&!plain(p._meta)))fail('Invalid request parameters.');
      if(!Object.hasOwn(m,'id')) {
        if(m.method==='notifications/initialized'){keys(p,['_meta']);return send(202)}
        if(m.method==='notifications/cancelled'){
          keys(p,['requestId','reason','_meta'],['requestId']);
          if(!(typeof p.requestId==='string'&&p.requestId.length<=128)&&!Number.isSafeInteger(p.requestId))fail('Invalid cancelled request ID.');
          if(p.reason!==undefined&&(typeof p.reason!=='string'||p.reason.length>200))fail('Invalid cancellation reason.');
          return send(202);
        }
        fail('Unsupported notification.',-32600);
      }
      let result;
      if(m.method==='initialize'){
        keys(p,['protocolVersion','capabilities','clientInfo','_meta'],['protocolVersion','capabilities','clientInfo']);
        if(typeof p.protocolVersion!=='string'||p.protocolVersion.length>40||!plain(p.capabilities)||!plain(p.clientInfo)||typeof p.clientInfo.name!=='string'||p.clientInfo.name.length>120||typeof p.clientInfo.version!=='string'||p.clientInfo.version.length>120)fail('Invalid initialization parameters.');
        result={protocolVersion:PUBLIC_MCP_VERSIONS.includes(p.protocolVersion)?p.protocolVersion:PUBLIC_MCP_VERSIONS[0],capabilities:{tools:{listChanged:false}},serverInfo:{name:'bittrees-agent-public-reads',version:'1.0.0'},instructions:'Public snapshot reads only. No credentials, private history, mutations or CRM imports. No session is established.'};
      }else if(m.method==='tools/list'){keys(p,['_meta']);result={tools:model.tools()}}
      else if(m.method==='tools/call'){keys(p,['name','arguments','_meta'],['name']);if(typeof p.name!=='string')fail('Invalid tool name.');result=model.call(p.name,Object.hasOwn(p,'arguments')?p.arguments:{})}
      else if(m.method==='ping'){keys(p,['_meta']);result={}}
      else fail('Method not found.',-32601,200);
      return send(200,{jsonrpc:'2.0',id,result});
    }catch(error){return send(error.status??400,{jsonrpc:'2.0',id,error:{code:error.code??-32600,message:error.code?error.message:'Invalid public read request.'}})}
  };
}

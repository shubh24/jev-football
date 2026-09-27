import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs';
import {RequestSlots} from './src/request-slots.mjs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { buildDecisionRequest, sanitizeObservation, validateDecision } from './src/decision.mjs';
import { sanitizeTeamState } from './src/match/decision.mjs';
import {decideModelControl} from './src/match/model-control.mjs';
import {decideCoordinated} from './src/match/coordinated-control.mjs';
const decideOutfield=process.env.JEV_OUTFIELD_CONTROLLER==='raw'?decideModelControl:decideCoordinated;

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4317);
function getKey() {
  if (process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY) return process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY;
  const file = process.env.JEV_ENV_FILE || resolve(homedir(), 'projects/sales-engine/.env');
  if (!existsSync(file)) return '';
  const match = readFileSync(file, 'utf8').match(/^\s*(?:export\s+)?JEV_API_KEY\s*=\s*(.*?)\s*$/m);
  if (!match) return '';
  const value = match[1];
  return /^['"]/.test(value) ? value.slice(1, value.indexOf(value[0], 1)) : value.split(' #')[0].trim();
}
const key = getKey();
const clients = new Set();
let matchState = { phase: 'loading' };
const slots = new RequestSlots(3,6);
const recentDecisions=[];
function decisionLog(entry){
  const row={at:new Date().toISOString(),port,...entry};recentDecisions.push(row);if(recentDecisions.length>100)recentDecisions.shift();
  try{
    const dir=resolve(root,'artifacts'),file=resolve(dir,'server-decisions.jsonl');mkdirSync(dir,{recursive:true});
    if(existsSync(file)&&statSync(file).size>2_000_000)renameSync(file,file+'.previous');
    appendFileSync(file,JSON.stringify(row)+'\n');
  }catch{console.warn('Could not write the local decision log');}
}
const calls = new Map();
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' };
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('JSON required');
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16000) throw new Error('Request too large'); }
  return JSON.parse(data);
}
const server = http.createServer(async (req, res) => {
  const host = req.headers.host;
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) return json(res, 403, { error: 'Local access only' });
  if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Origin rejected' });
  const path = new URL(req.url, `http://${host}`).pathname;
  try {
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ready: Boolean(key), model: 'jev-1.13.0' });
    if (req.method === 'GET' && path === '/api/diagnostics') return json(res,200,{active:slots.active,waiting:slots.waiting.length,recent:recentDecisions});
    if (req.method === 'GET' && path === '/api/match') return json(res, 200, matchState);
    if (req.method === 'POST' && path === '/api/match') {
      const data = await body(req);
      matchState = { phase: String(data.phase).slice(0, 30), round: Number(data.round) || 1, goals: Number(data.goals) || 0, saves: Number(data.saves) || 0, mode: data.mode === 'live' ? 'live' : 'practice', lastResult: String(data.lastResult || '').slice(0, 30) };
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && path === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n'); clients.add(res);
      const timer = setInterval(() => res.write(': alive\n\n'), 20000);
      req.on('close', () => { clearInterval(timer); clients.delete(res); }); return;
    }
    if (req.method === 'POST' && path === '/api/control') {
      const data = await body(req);
      if (!['start', 'restart', 'replay', 'next'].includes(data.command)) return json(res, 400, { error: 'Invalid command' });
      for (const client of clients) client.write(`data: ${JSON.stringify({ command: data.command })}\n\n`);
      return json(res, 200, { sentTo: clients.size, command: data.command });
    }
    if (req.method === 'POST' && (path === '/api/decision' || path === '/api/team-decision' || path === '/api/teammate-decision' || path === '/api/keeper-decision')) {
      if (!key) return json(res, 503, { error: 'JEV key is not configured. Select Practice in settings.' });
      const keeperMode=path==='/api/keeper-decision',teamMode=path!=='/api/decision';
      const observation = teamMode?sanitizeTeamState(await body(req)):sanitizeObservation(await body(req));
      const now = Date.now();
      const bucket=calls.get(path)||[];calls.set(path,bucket);
      while (bucket.length && bucket[0] < now - 60000) bucket.shift();
      if (bucket.length >= (teamMode?1200:180)){decisionLog({path,requestId:observation.requestId,sequence:observation.sequence,status:429,code:'DECISION_RATE_LIMIT'});return json(res,429,{error:'Decision rate limit reached. Wait briefly, then continue.',code:'DECISION_RATE_LIMIT',requestId:observation.requestId});}
      bucket.push(now);
      const start = performance.now();
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2200);
      const cancel=()=>{if(!res.writableEnded)controller.abort(new DOMException('Client cancelled','AbortError'));};res.on('close',cancel);
      let releaseSlot;
      const log=(status,code,detail)=>decisionLog({path,requestId:observation.requestId,sequence:observation.sequence,time:observation.time,status,code,detail,latencyMs:Math.round(performance.now()-start)});
      try {
        releaseSlot=await slots.acquire(controller.signal);
        const call=async(payload)=>{
          if(controller.signal.aborted)throw new Error('Decision cancelled');
          const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(1800)])});
          if(!response.ok)throw Object.assign(new Error(`JEV returned HTTP ${response.status}`),{code:'JEV_UPSTREAM_HTTP',upstreamStatus:response.status});
          return response.json();
        };
        if(teamMode){
          const result=await decideOutfield(observation,call,{keepers:keeperMode,team:path==='/api/teammate-decision'?0:1,signal:controller.signal});
          log(200,'OK');return json(res,200,{...result,requestId:observation.requestId,sequence:observation.sequence,planVersion:observation.planVersion,latencyMs:Math.round(performance.now()-start),source:'jev'});
        }
        const data=await call(buildDecisionRequest(observation));
        const decision = validateDecision(data);
        log(200,'OK');return json(res, 200, { ...decision, requestId: observation.requestId, shotId: observation.shotId, latencyMs: Math.round(performance.now() - start), model: data.model, source: 'jev' });
      } catch(error) {
        if(res.destroyed){log(499,'CLIENT_CANCELLED');return;}
        const timeout=controller.signal.aborted||error.name==='TimeoutError',code=timeout?'JEV_TIMEOUT':error.code==='DECISION_BUSY'?'DECISION_BUSY':error.code==='JEV_UPSTREAM_HTTP'?'JEV_UPSTREAM_HTTP':error instanceof TypeError?'JEV_CONNECTION_FAILED':'JEV_INVALID_RESPONSE';
        const status=timeout?504:code==='DECISION_BUSY'?503:502;
        const detail=timeout?'JEV did not finish within the request time limit.':code==='DECISION_BUSY'?'The decision queue is full.':code==='JEV_UPSTREAM_HTTP'?`JEV returned HTTP ${error.upstreamStatus}.`:code==='JEV_CONNECTION_FAILED'?'The connection to JEV failed.':'JEV returned an invalid response.';
        log(status,code,code==='JEV_INVALID_RESPONSE'&&/^Invalid (model choice|probability|distribution): /.test(error.message)?error.message:detail);return json(res,status,{error:detail,code,requestId:observation.requestId});
      }
      finally { clearTimeout(timer);res.off('close',cancel);releaseSlot?.(); }
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const relative = path === '/' ? 'index.html' : path === '/match' || path === '/match/' ? 'match.html' : decodeURIComponent(path.slice(1));
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep) || (!relative.startsWith('src/') && !relative.startsWith('node_modules/three/') && !['index.html', 'match.html', 'match.css', 'styles.css', 'favicon.svg', 'assets/players/footballer.glb', 'tests/player-preview.html'].includes(relative))) return json(res, 404, { error: 'Not found' });
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(content);
  } catch (error) { if(path.startsWith('/api/')&&path.endsWith('decision'))decisionLog({path,status:400,code:'INVALID_REQUEST',detail:String(error.message).slice(0,160)});json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'Not found' : 'Invalid request',code:error.code==='ENOENT'?'NOT_FOUND':'INVALID_REQUEST' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`ELEVEN is running at http://127.0.0.1:${port} — JEV ${key ? 'configured' : 'not configured'}`));

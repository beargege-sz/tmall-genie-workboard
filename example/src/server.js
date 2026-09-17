import http from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {createJournalStore} from './journal.js';
import {listPhotos, screenPhoto} from './photos.js';
import {screenSnapshot, boardTemplateResponse} from './screen.js';
import {createMetricStore} from './metrics.js';
import {startUsageCollector} from './codex-usage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const view = process.env.DASHBOARD_VIEW_TOKEN || '';
const webhook = process.env.ALIGENIE_WEBHOOK_TOKEN || '';
if (view.length < 32 || webhook.length < 32 || view === webhook) throw Error('Set two different random tokens, at least 32 characters each.');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const origin = process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:' + port;
const journalRoot = path.resolve(process.env.JOURNAL_LIBRARY_DIR || path.join(root,'example-data/journals'));
const photosRoot = path.resolve(process.env.PHOTO_LIBRARY_DIR || path.join(journalRoot,'2026/photos'));
const journal = createJournalStore(journalRoot);
const metricPath = path.join(root,'runtime/metrics.json');
await mkdir(path.dirname(metricPath), {recursive:true});
try { await writeFile(metricPath, JSON.stringify({sources:{}}), {flag:'wx',mode:0o600}); }
catch(error) { if(error.code !== 'EEXIST') throw error; }
const metrics = createMetricStore(metricPath);
const equal = (left,right) => {
  const a=Buffer.from(left),b=Buffer.from(right);
  return a.length===b.length && timingSafeEqual(a,b);
};
function send(res,status,data,type='application/json; charset=utf-8') {
  const body=Buffer.isBuffer(data)?data:typeof data==='string'?data:JSON.stringify(data);
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  res.end(body);
}
async function snapshot() {
  const [s,m,p]=await Promise.all([journal.read(),metrics.read(),listPhotos(photosRoot)]);
  return screenSnapshot(s,m,p,{origin,token:view});
}
async function body(req) {
  const chunks=[]; let size=0;
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>256000) throw Error('body_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
const staticFiles = {
  '/':['public/index.html','text/html; charset=utf-8'],
  '/app.js':['public/app.js','text/javascript; charset=utf-8'],
  '/styles.css':['public/styles.css','text/css; charset=utf-8']
};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url, 'http://localhost');
    if(req.method==='GET' && url.pathname==='/health') return send(res,200,{ok:true});
    if(req.method==='GET' && staticFiles[url.pathname]) {
      const [file,type]=staticFiles[url.pathname];
      return send(res,200,await readFile(path.join(root,file)),type);
    }
    if(req.method==='GET' && url.pathname==='/aligenie/'+process.env.ALIGENIE_VERIFY_NAME && process.env.ALIGENIE_VERIFY_NAME) {
      return send(res,200,process.env.ALIGENIE_VERIFY_CONTENT || '', 'text/plain; charset=utf-8');
    }
    if(req.method==='POST' && url.pathname==='/webhooks/aligenie') {
      if(!equal(String(req.headers['x-workboard-key'] || ''),webhook)) return send(res,401,{error:'Unauthorized'});
      const input=await body(req);
      if(input.intentName!=='ShowBoard') return send(res,400,{error:'Expected ShowBoard intent'});
      const template=process.env.ALIGENIE_BOARD_TEMPLATE;
      const data=template?boardTemplateResponse(template,await snapshot(),{origin,token:view}):{
        returnCode:'0',returnMessage:'success',returnValue:{
          reply:'语音测试成功。',resultType:'RESULT',executeCode:'SUCCESS',
          gwCommands:[{commandDomain:'AliGenie.Speaker',commandName:'Speak',
            payload:{type:'text',text:'语音测试成功。',expectSpeech:false}}]
        }
      };
      return send(res,200,data);
    }
    if(url.pathname==='/api/screen' || url.pathname.startsWith('/media/photos/')) {
      if(!equal(url.searchParams.get('view') || '',view)) return send(res,401,{error:'Unauthorized'});
      if(req.method!=='GET') return send(res,405,{error:'Read only'});
      if(url.pathname==='/api/screen') return send(res,200,await snapshot());
      const id=url.pathname.slice('/media/photos/'.length);
      const photo=(await listPhotos(photosRoot)).find(p=>p.id===id);
      if(!photo) return send(res,404,{error:'Not found'});
      return send(res,200,await screenPhoto(photo.absolutePath),'image/jpeg');
    }
    return send(res,404,{error:'Not found'});
  } catch(error) {
    send(res,error instanceof SyntaxError?400:503,{error:'Request unavailable'});
  }
});
server.listen(port,host,()=>{
  console.log('Workboard listening on loopback port '+server.address().port);
  if(process.env.CODEX_USAGE_ENABLED==='1') startUsageCollector(metrics,{
    binary:process.env.CODEX_USAGE_BINARY,
    authFile:path.join(os.homedir(),'.codex/auth.json'),
    expectedAccountHash:process.env.CODEX_USAGE_ACCOUNT_HASH
  });
});

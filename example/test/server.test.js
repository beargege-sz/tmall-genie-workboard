import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('standalone service protects data and returns a template command', async () => {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const view=randomBytes(32).toString('hex'), hook=randomBytes(32).toString('hex');
  const child=spawn(process.execPath,['src/server.js'],{cwd:root,env:{
    ...process.env,PORT:'0',DASHBOARD_VIEW_TOKEN:view,ALIGENIE_WEBHOOK_TOKEN:hook,
    ALIGENIE_BOARD_TEMPLATE:'MY_BOARD_TEST',CODEX_USAGE_ENABLED:'0',
    JOURNAL_LIBRARY_DIR:path.join(root,'example-data/journals'),
    PHOTO_LIBRARY_DIR:path.join(root,'example-data/journals/2026/photos'),
    PUBLIC_ORIGIN:'https://board.example.com'
  },stdio:['ignore','pipe','pipe']});
  try {
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('startup timeout')),10000);
      child.once('error',reject);
      child.once('exit',()=>{clearTimeout(timer);reject(Error('early exit'));});
      child.stdout.on('data',chunk=>{
        const match=/loopback port (\d+)/.exec(String(chunk));
        if(match){clearTimeout(timer);resolve(match[1]);}
      });
    });
    const base='http://127.0.0.1:'+port;
    assert.equal((await fetch(base+'/health')).status,200);
    assert.equal((await fetch(base+'/api/screen')).status,401);
    assert.equal((await fetch(base+'/media/photos/not-found')).status,401);
    const snapshot=await (await fetch(base+'/api/screen?view='+view)).json();
    assert.equal(snapshot.remaining,'--');
    assert.match(snapshot.todo1,/完成演示原型/);
    assert.deepEqual(snapshot.photos,[]);
    assert.equal((await fetch(base+'/webhooks/aligenie',{method:'POST',body:'{}'})).status,401);
    const response=await fetch(base+'/webhooks/aligenie',{method:'POST',
      headers:{'Content-Type':'application/json','X-Workboard-Key':hook},
      body:JSON.stringify({intentName:'ShowBoard'})});
    const result=await response.json();
    assert.equal(result.returnValue.gwCommands[1].payload.data.template,'MY_BOARD_TEST');
    assert.equal((await fetch(base+'/.env')).status,404);
  } finally { child.kill('SIGTERM'); }
});

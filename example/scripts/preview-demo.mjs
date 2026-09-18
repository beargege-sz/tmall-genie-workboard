// Local-only presentation fixture. Never reads .env, journals, photos or Codex.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const publicRoot = new URL('../public/', import.meta.url);
const todos = ['整理本周学习笔记','完成个人网站原型','检查资料备份','阅读一本技术书','准备周末分享','优化照片展示','补充项目测试','更新使用文档','安排户外活动','整理下周计划'];
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/api/screen') {
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({
      remaining:'68%',resetTime:'重置 9/21 09:00（北京时间）',
      resetCountdown:'距重置 2天 1小时 0分',usageNote:'模拟数据 · 非真实账户额度',
      ...Object.fromEntries(Array.from({length:12},(_,i)=>['todo'+(i+1),todos[i] ? (i+1)+'. '+todos[i] : ''])),
      photos:[{url:'/demo.svg',caption:'演示图片 · 照片按原始比例展示，私人内容未载入'}]
    }));return;
  }
  if(url.pathname === '/demo.svg'){
    res.setHeader('Content-Type','image/svg+xml');
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#224e61"/><stop offset="1" stop-color="#152a36"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="72" y="55" width="496" height="250" rx="12" fill="none" stroke="#7db3bd" stroke-width="2"/><text x="320" y="171" text-anchor="middle" fill="#e4f3f4" font-family="sans-serif" font-size="30">周记照片展示区</text><text x="320" y="213" text-anchor="middle" fill="#a1c3cb" font-family="sans-serif" font-size="18">等比例显示 · 3–5 分钟轮换</text></svg>');return;
  }
  const files={'/':['index.html','text/html'],'/styles.css':['styles.css','text/css'],'/app.js':['app.js','text/javascript']};
  if(!files[url.pathname]) {res.writeHead(404);res.end();return;}
  const [file,type]=files[url.pathname];
  let content=await readFile(fileURLToPath(new URL(file,publicRoot)),'utf8');
  if(file==='index.html') content=content.replace('个人工作台</h1>','个人工作台 · 演示</h1>');
  if(file==='app.js') content=content.replace('const now = new Date();',"const now = new Date('2026-09-19T00:00:00Z');");
  res.setHeader('Content-Type',type+'; charset=utf-8');res.end(content);
});
server.listen(8799,'127.0.0.1',()=>console.log('Demo only: http://127.0.0.1:8799'));

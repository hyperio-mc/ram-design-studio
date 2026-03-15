#!/usr/bin/env node
'use strict';
const https = require('https');
const { generateDesign } = require('./community-design-generator');
const { generateRuleBasedPRD, parsePRD, cleanScreenName, mdToHtml } = require('./prd-utils');
function renderElSVG(el, depth) {
  if (!el || depth > 5) return '';
  const x=el.x||0,y=el.y||0,w=Math.max(0,el.width||0),h=Math.max(0,el.height||0);
  const fill=el.fill||'none';
  const oA=(el.opacity!==undefined&&el.opacity<0.99)?` opacity="${el.opacity.toFixed(2)}"` :'';
  const rA=el.cornerRadius?` rx="${Math.min(el.cornerRadius,w/2,h/2)}"` :'';
  if(el.type==='frame'){const bg=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${rA}${oA}/>`;const kids=(el.children||[]).map(c=>renderElSVG(c,depth+1)).join('');return kids?`${bg}<g transform="translate(${x},${y})">${kids}</g>`:bg;}
  if(el.type==='ellipse') return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" fill="${fill}"${oA}/>`;
  if(el.type==='text'){const fh=Math.max(1,Math.min(h,(el.fontSize||13)*0.7));return `<rect x="${x}" y="${y+(h-fh)/2}" width="${w}" height="${fh}" fill="${fill}"${oA} rx="1"/>`;}
  return '';
}
function screenThumbSVG(s,tw,th){const kids=(s.children||[]).map(c=>renderElSVG(c,0)).join('');return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" width="${tw}" height="${th}" style="display:block;border-radius:6px;flex-shrink:0"><rect width="${s.width}" height="${s.height}" fill="${s.fill||'#111'}"/>${kids}</svg>`;}

const sub = {
  id: 'ds-req-hlki9',
  prompt: 'A finance monitoring that handles the reporting of financial metrics across an organization. Design should be modern and simple like Robinhood',
  app_type: 'finance',
  credit: 'Anonymous',
  submitted_at: new Date().toISOString(),
};

console.log('📋 Expanding prompt → PRD...');
const prdMarkdown = generateRuleBasedPRD(sub.prompt, sub.app_type);
const prd = parsePRD(prdMarkdown);
console.log('   App name:', prd.appName, '| Tagline:', prd.tagline);

console.log('🎨 Generating design...');
const { doc, meta } = generateDesign({ prompt: sub.prompt, appNameOverride: prd.appName, taglineOverride: prd.tagline });
console.log('   Archetype:', meta.archetype, '| App:', meta.appName, '| Screens:', meta.screens);

const P = meta.palette;
const encoded = Buffer.from(JSON.stringify(doc)).toString('base64');
const THUMB_H = 180;
const thumbsHTML = (doc.children||[]).map((s,i) => {
  const tw=Math.round(THUMB_H*(s.width/s.height));
  return `<div style="text-align:center;flex-shrink:0">${screenThumbSVG(s,tw,THUMB_H)}<div style="font-size:9px;opacity:.3;margin-top:8px;letter-spacing:1px">${s.width<500?'MOBILE':'DESKTOP'} ${i%5+1}</div></div>`;
}).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${meta.appName} — Community Design</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${P.bg};color:${P.fg};font-family:'SF Mono','Fira Code',ui-monospace,monospace;min-height:100vh}
nav{padding:20px 40px;border-bottom:1px solid ${P.accent}22;display:flex;justify-content:space-between;align-items:center}
.logo{font-size:14px;font-weight:700;letter-spacing:4px}.nav-id{font-size:11px;color:${P.accent};letter-spacing:1px}
.hero{padding:80px 40px 40px;max-width:900px}
.tag{font-size:10px;letter-spacing:3px;color:${P.accent};margin-bottom:20px}
h1{font-size:clamp(48px,8vw,96px);font-weight:900;letter-spacing:-2px;line-height:1;margin-bottom:20px}
.sub{font-size:16px;opacity:.5;max-width:480px;line-height:1.6;margin-bottom:36px}
.meta{display:flex;gap:32px;margin-bottom:44px;flex-wrap:wrap}
.meta-item span{display:block;font-size:10px;opacity:.4;letter-spacing:1px;margin-bottom:4px}
.meta-item strong{color:${P.accent}}
.actions{display:flex;gap:14px;margin-bottom:60px;flex-wrap:wrap}
.btn{padding:14px 28px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:none;text-decoration:none;font-family:inherit;display:inline-block}
.btn-p{background:${P.accent};color:${P.bg}}.btn-s{background:transparent;color:${P.fg};border:1px solid ${P.fg}33}
.preview{padding:0 40px 80px}.preview-label{font-size:10px;letter-spacing:2px;opacity:.4;margin-bottom:20px}
.thumbs{display:flex;gap:16px;overflow-x:auto;padding-bottom:8px}
.thumbs::-webkit-scrollbar{height:4px}.thumbs::-webkit-scrollbar-thumb{background:${P.accent}44;border-radius:2px}
.prompt-section{padding:40px;border-top:1px solid ${P.accent}22}
.p-label{font-size:10px;letter-spacing:2px;color:${P.accent};margin-bottom:12px}
.p-text{font-size:18px;opacity:.6;font-style:italic;max-width:600px;line-height:1.6}
.prd-section{padding:40px;border-top:1px solid ${P.accent}22;max-width:780px}
.prd-section h3{font-size:10px;letter-spacing:2px;color:${P.accent};margin:28px 0 10px;font-weight:700;text-transform:uppercase}
.prd-section h3:first-child{margin-top:0}
.prd-section li{font-size:14px;opacity:.65;line-height:1.72;max-width:680px;margin-bottom:4px}
.prd-section ul{padding-left:18px;margin:6px 0}
.prd-section strong{color:${P.fg};opacity:1}
.prd-section br{display:block;margin:8px 0;content:''}
footer{padding:28px 40px;border-top:1px solid ${P.accent}11;font-size:11px;opacity:.3;display:flex;justify-content:space-between}
</style></head><body>
<nav><div class="logo">DESIGN STUDIO</div><div class="nav-id">COMMUNITY · ${sub.id}</div></nav>
<section class="hero">
  <div class="tag">COMMUNITY DESIGN · ${meta.archetype.toUpperCase()} · ${new Date(sub.submitted_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}).toUpperCase()}</div>
  <h1>${meta.appName}</h1>
  <p class="sub">${meta.tagline}</p>
  <div class="meta">
    <div class="meta-item"><span>ARCHETYPE</span><strong>${meta.archetype.toUpperCase()}</strong></div>
    <div class="meta-item"><span>SCREENS</span><strong>${meta.screens} (5 MOBILE + 5 DESKTOP)</strong></div>
    <div class="meta-item"><span>PALETTE</span><strong>${P.bg} · ${P.accent}</strong></div>
    <div class="meta-item"><span>SUBMITTED BY</span><strong>${sub.credit||'Anonymous'}</strong></div>
  </div>
  <div class="actions">
    <button class="btn btn-p" onclick="openInViewer()">▶ Open in Pen Viewer</button>
    <button class="btn btn-s" onclick="downloadPen()">↓ Download .pen</button>
    <button class="btn btn-s" onclick="shareOnX()">𝕏 Share</button>
    <a class="btn btn-s" href="https://zenbin.org/p/design-gallery-3">← Gallery</a>
  </div>
</section>
<section class="preview">
  <div class="preview-label">SCREEN PREVIEW · 5 MOBILE + 5 DESKTOP</div>
  <div class="thumbs">${thumbsHTML}</div>
</section>
<section class="prompt-section">
  <div class="p-label">ORIGINAL PROMPT</div>
  <p class="p-text">"${sub.prompt}"</p>
</section>
<section class="prd-section">
  <div class="p-label">PRODUCT BRIEF</div>
  ${mdToHtml(prdMarkdown)}
</section>
<footer>
  <span>Generated by RAM Design Studio · with Product Brief</span>
  <span>zenbin.org/p/${sub.id}-v2</span>
</footer>
<script>
const D='${encoded}';
function openInViewer(){try{const j=atob(D);JSON.parse(j);localStorage.setItem('pv_pending',JSON.stringify({json:j,name:'${meta.appName.toLowerCase()}.pen'}));window.open('https://zenbin.org/p/pen-viewer-2','_blank');}catch(e){alert('Error: '+e.message);}}
function downloadPen(){try{const j=atob(D);const b=new Blob([j],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='${meta.appName.toLowerCase()}.pen';a.click();URL.revokeObjectURL(a.href);}catch(e){alert('Error: '+e.message);}}
function shareOnX(){const text=encodeURIComponent('${meta.appName} — AI-generated app design from RAM Design Studio 🎨');const url=encodeURIComponent(window.location.href);window.open('https://x.com/intent/tweet?text='+text+'&url='+url,'_blank');}
<\/script></body></html>`;

console.log('   HTML:', (html.length/1024).toFixed(1)+'KB');

const slug = 'community-ds-req-hlki9-v3';
const payload = JSON.stringify({ title: `${meta.appName} — Community Design`, html });
const r = https.request({
  hostname: 'zenbin.org', path: `/v1/pages/${slug}`, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
}, res => {
  let d=''; res.on('data',c=>d+=c);
  res.on('end',() => {
    if (res.statusCode===200||res.statusCode===201) console.log('✅ https://zenbin.org/p/'+slug);
    else console.error('❌', res.statusCode, d.slice(0,100));
  });
});
r.on('error', e => console.error(e.message));
r.write(payload); r.end();

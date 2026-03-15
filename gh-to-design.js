'use strict';
// gh-to-design.js
// Given any public GitHub repo, fetches its README + metadata,
// infers the app concept, and generates + publishes a full 10-screen .pen design.
//
// Usage:  node gh-to-design.js <owner/repo>
//   e.g.  node gh-to-design.js hyperio-mc/ram-design-studio

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const { generateDesign, detectArchetype, ARCHETYPES } = require('./community-design-generator');

const CONFIG_PATH = path.join(__dirname, 'community-config.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}

const ZENBIN_HOST  = 'zenbin.org';

// ── HTTP ──────────────────────────────────────────────────────────────────────
function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function ghGet(path) {
  const r = await req({
    hostname: 'api.github.com',
    path,
    method: 'GET',
    headers: {
      'User-Agent': 'ram-design-studio/1.0',
      'Accept': 'application/vnd.github.v3+json',
      ...(config.GITHUB_TOKEN ? { 'Authorization': `token ${config.GITHUB_TOKEN}` } : {}),
    },
  });
  return JSON.parse(r.body);
}

// ── README parser ─────────────────────────────────────────────────────────────
function extractConcept(repoMeta, readmeText) {
  // Build a rich description from available signals
  const parts = [];

  if (repoMeta.description) parts.push(repoMeta.description);
  if (repoMeta.topics?.length) parts.push(repoMeta.topics.join(' '));

  // Pull first 800 chars of README (strip markdown)
  if (readmeText) {
    const clean = readmeText
      .replace(/```[\s\S]*?```/g, '')      // code blocks
      .replace(/`[^`]+`/g, '')             // inline code
      .replace(/#+\s*/g, '')               // headings
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
      .replace(/[*_~]/g, '')               // bold/italic
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 800);
    parts.push(clean);
  }

  return parts.join(' ');
}

// ── Tagline generator ─────────────────────────────────────────────────────────
// Produce a short punchy tagline from the repo description
function makeTagline(description, appName) {
  const d = (description || '').toLowerCase();

  // Common tech patterns → taglines
  if (/ai|gpt|llm|generat/.test(d))         return 'Intelligence. Amplified.';
  if (/real.?time|live|stream/.test(d))      return 'Live. Always.';
  if (/collab|team|together/.test(d))        return 'Built for Teams.';
  if (/automat|workflow|pipeline/.test(d))   return 'Automate Everything.';
  if (/design|ui|visual|studio/.test(d))     return 'Design Without Limits.';
  if (/analytic|data|insight|metric/.test(d))return 'Data. Understood.';
  if (/deploy|infra|cloud|server/.test(d))   return 'Ship. Scale. Repeat.';
  if (/open.?source|community/.test(d))      return 'Built by Everyone.';
  if (/mobile|app|ios|android/.test(d))      return 'Your App. Everywhere.';
  if (/api|sdk|developer|dev/.test(d))       return 'Build Anything.';

  return `${appName}. Elevated.`;
}

// ── App name from repo ────────────────────────────────────────────────────────
function repoToAppName(repoName) {
  // e.g. "ram-design-studio" → "RAM" or "RAMDS"
  const parts = repoName.replace(/-/g, ' ').split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].toUpperCase().slice(0, 8);
  // Use initials if many parts
  if (parts.length >= 3) return parts.map(p => p[0]).join('').toUpperCase().slice(0, 6);
  // Two parts: first word uppercased
  return parts[0].toUpperCase().slice(0, 8);
}

// ── Republish helpers (same as processor) ────────────────────────────────────
function renderElSVG(el, depth) {
  if (!el || depth > 5) return '';
  const x = el.x||0, y = el.y||0, w = Math.max(0,el.width||0), h = Math.max(0,el.height||0);
  const fill = el.fill||'none';
  const oAttr = (el.opacity!==undefined && el.opacity<0.99) ? ` opacity="${el.opacity.toFixed(2)}"` : '';
  const rAttr = el.cornerRadius ? ` rx="${Math.min(el.cornerRadius,w/2,h/2)}"` : '';
  if (el.type==='frame') {
    const bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${rAttr}${oAttr}/>`;
    const kids = (el.children||[]).map(c=>renderElSVG(c,depth+1)).join('');
    return kids ? `${bg}<g transform="translate(${x},${y})">${kids}</g>` : bg;
  }
  if (el.type==='ellipse') return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" fill="${fill}"${oAttr}/>`;
  if (el.type==='text') { const fh=Math.max(1,Math.min(h,(el.fontSize||13)*0.7)); return `<rect x="${x}" y="${y+(h-fh)/2}" width="${w}" height="${fh}" fill="${fill}"${oAttr} rx="1"/>`; }
  return '';
}

function screenThumbSVG(s, tw, th) {
  const kids = (s.children||[]).map(c=>renderElSVG(c,0)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" width="${tw}" height="${th}" style="display:block;border-radius:6px;flex-shrink:0"><rect width="${s.width}" height="${s.height}" fill="${s.fill||'#111'}"/>${kids}</svg>`;
}

function buildPage(repo, doc, meta, encoded) {
  const THUMB_H = 180;
  const thumbsHTML = (doc.children||[]).map((s,i) => {
    const tw = Math.round(THUMB_H*(s.width/s.height));
    const isMobile = s.width<500;
    return `<div style="text-align:center;flex-shrink:0">${screenThumbSVG(s,tw,THUMB_H)}<div style="font-size:9px;opacity:.3;margin-top:8px;letter-spacing:1px">${isMobile?'MOBILE':'DESKTOP'} ${i%5+1}</div></div>`;
  }).join('');

  const accent  = meta.palette.accent;
  const bg      = meta.palette.bg;
  const fg      = meta.palette.fg;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${meta.appName} — GitHub Design</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${bg};color:${fg};font-family:'SF Mono','Fira Code',ui-monospace,monospace;min-height:100vh}
  nav{padding:20px 40px;border-bottom:1px solid ${accent}22;display:flex;justify-content:space-between;align-items:center}
  .logo{font-size:14px;font-weight:700;letter-spacing:4px}
  .nav-repo{font-size:11px;color:${accent};letter-spacing:1px}
  .hero{padding:80px 40px 40px;max-width:900px}
  .tag{font-size:10px;letter-spacing:3px;color:${accent};margin-bottom:20px}
  h1{font-size:clamp(48px,8vw,96px);font-weight:900;letter-spacing:-2px;line-height:1;margin-bottom:20px}
  .sub{font-size:16px;opacity:.5;max-width:520px;line-height:1.6;margin-bottom:36px}
  .meta{display:flex;gap:32px;margin-bottom:44px;flex-wrap:wrap}
  .meta-item span{display:block;font-size:10px;opacity:.4;letter-spacing:1px;margin-bottom:4px}
  .meta-item strong{color:${accent};font-size:13px}
  .actions{display:flex;gap:14px;margin-bottom:60px;flex-wrap:wrap}
  .btn{padding:14px 28px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:none;text-decoration:none;font-family:inherit;display:inline-block}
  .btn-p{background:${accent};color:${bg}}
  .btn-s{background:transparent;color:${fg};border:1px solid ${fg}33}
  .preview{padding:0 40px 80px}
  .preview-label{font-size:10px;letter-spacing:2px;opacity:.4;margin-bottom:20px}
  .thumbs{display:flex;gap:16px;overflow-x:auto;padding-bottom:8px}
  .thumbs::-webkit-scrollbar{height:4px}.thumbs::-webkit-scrollbar-track{background:transparent}
  .thumbs::-webkit-scrollbar-thumb{background:${accent}44;border-radius:2px}
  .desc-section{padding:40px;border-top:1px solid ${accent}22}
  .d-label{font-size:10px;letter-spacing:2px;color:${accent};margin-bottom:12px}
  .d-text{font-size:16px;opacity:.55;max-width:640px;line-height:1.8}
  .repo-link{color:${accent};text-decoration:none;opacity:.7}
  .repo-link:hover{opacity:1}
  footer{padding:28px 40px;border-top:1px solid ${accent}11;font-size:11px;opacity:.3;display:flex;justify-content:space-between}
</style>
</head>
<body>
<nav>
  <div class="logo">DESIGN STUDIO</div>
  <div class="nav-repo">GITHUB · ${repo.full_name}</div>
</nav>
<section class="hero">
  <div class="tag">AUTO-GENERATED · ${meta.archetype.toUpperCase()} · ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}).toUpperCase()}</div>
  <h1>${meta.appName}</h1>
  <p class="sub">${meta.tagline}</p>
  <div class="meta">
    <div class="meta-item"><span>REPO</span><strong><a class="repo-link" href="https://github.com/${repo.full_name}" target="_blank">${repo.full_name}</a></strong></div>
    <div class="meta-item"><span>ARCHETYPE</span><strong>${meta.archetype.toUpperCase()}</strong></div>
    <div class="meta-item"><span>SCREENS</span><strong>10 (5 MOBILE + 5 DESKTOP)</strong></div>
    <div class="meta-item"><span>STARS</span><strong>${repo.stargazers_count ?? 0}</strong></div>
  </div>
  <div class="actions">
    <button class="btn btn-p" onclick="openInViewer()">▶ Open in Pen Viewer</button>
    <button class="btn btn-s" onclick="downloadPen()">↓ Download .pen</button>
    <a class="btn btn-s" href="https://zenbin.org/p/design-gallery-2">← Gallery</a>
  </div>
</section>
<section class="preview">
  <div class="preview-label">SCREEN PREVIEW · 5 MOBILE + 5 DESKTOP</div>
  <div class="thumbs">${thumbsHTML}</div>
</section>
<section class="desc-section">
  <div class="d-label">REPO DESCRIPTION</div>
  <p class="d-text">${repo.description || 'No description provided.'}</p>
</section>
<footer>
  <span>Generated by RAM Design Studio from github.com/${repo.full_name}</span>
  <span>zenbin.org/p/gh-${repo.name}</span>
</footer>
<script>
const D='${encoded}';
function openInViewer(){try{const j=atob(D);JSON.parse(j);localStorage.setItem('pv_pending',JSON.stringify({json:j,name:'${meta.appName.toLowerCase()}.pen'}));window.open('https://zenbin.org/p/pen-viewer-2','_blank');}catch(e){alert('Could not load: '+e.message);}}
function downloadPen(){try{const j=atob(D);const b=new Blob([j],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='${meta.appName.toLowerCase()}.pen';a.click();URL.revokeObjectURL(a.href);}catch(e){alert('Download failed: '+e.message);}}
<\/script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const repoArg = process.argv[2];
  if (!repoArg) {
    console.error('Usage: node gh-to-design.js <owner/repo>');
    process.exit(1);
  }

  console.log(`\n🔍 Fetching repo: ${repoArg}`);
  const repoMeta = await ghGet(`/repos/${repoArg}`);
  if (repoMeta.message) { console.error('GitHub error:', repoMeta.message); process.exit(1); }

  console.log(`   ${repoMeta.description || '(no description)'}`);
  console.log(`   Topics: ${(repoMeta.topics||[]).join(', ') || 'none'}`);
  console.log(`   Language: ${repoMeta.language || 'unknown'}`);

  // Fetch README
  let readmeText = '';
  try {
    const readmeMeta = await ghGet(`/repos/${repoArg}/readme`);
    if (readmeMeta.content) {
      readmeText = Buffer.from(readmeMeta.content, 'base64').toString('utf8');
    }
  } catch {}
  console.log(`   README: ${readmeText ? Math.round(readmeText.length/1024) + 'KB' : 'not found'}`);

  // Build concept string for archetype detection
  const concept = extractConcept(repoMeta, readmeText);
  const archetype = detectArchetype(concept);
  const appName = repoToAppName(repoMeta.name);
  const tagline = makeTagline(concept, appName);

  console.log(`\n🎨 Generating design...`);
  console.log(`   Archetype: ${archetype}`);
  console.log(`   App name:  ${appName}`);
  console.log(`   Tagline:   ${tagline}`);

  const { doc, meta } = generateDesign({
    prompt: concept,
    appNameOverride: appName,
    taglineOverride: tagline,
  });

  const encoded = Buffer.from(JSON.stringify(doc)).toString('base64');
  const html    = buildPage(repoMeta, doc, meta, encoded);

  console.log(`   HTML size: ${(html.length / 1024).toFixed(1)}KB`);

  // Publish to ZenBin
  const slug    = `gh-${repoMeta.name}`;
  const payload = JSON.stringify({ title: `${appName} — GitHub Design`, html });

  console.log(`\n📤 Publishing to zenbin.org/p/${slug}...`);

  for (const trySlug of [slug, slug + '-' + Date.now().toString(36).slice(-4)]) {
    const r = await req({
      hostname: ZENBIN_HOST,
      path: `/v1/pages/${trySlug}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, payload);

    if (r.status === 201 || r.status === 200) {
      console.log(`\n✅ https://zenbin.org/p/${trySlug}`);
      console.log(`   ${meta.archetype} archetype · 10 screens · ${(html.length/1024).toFixed(0)}KB\n`);
      return;
    }
    if (r.status !== 409) {
      console.error(`ZenBin error: ${r.status}`, r.body.slice(0, 200));
      return;
    }
    console.log(`   Slug taken, trying ${trySlug}...`);
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

'use strict';
// process-zenbin-queue.js
// Agent-side queue processor. Scans ZenBin for pending design requests
// (slugs matching ds-req-*) and processes them.
//
// The GitHub PAT ONLY lives here — never in any browser-facing HTML.
// ZenBin page creation requires no credentials, so the form page is clean.
//
// Run: node process-zenbin-queue.js
// Credentials loaded automatically from community-config.json

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Load config ───────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'community-config.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || config.GITHUB_TOKEN || '';
const GITHUB_REPO  = process.env.GITHUB_REPO  || config.GITHUB_REPO  || '';
const QUEUE_FILE   = config.QUEUE_FILE || 'queue.json';
const ZENBIN_HOST  = 'zenbin.org';
const QUEUE_PREFIX = 'ds-req-';

// ── LLM config (optional — enables PRD expansion before design generation) ────
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY || '';
const ANTHROPIC_BASE = (process.env.ANTHROPIC_BASE_URL || config.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const OPENAI_KEY     = process.env.OPENAI_API_KEY    || config.OPENAI_API_KEY    || '';
const OPENAI_BASE    = (config.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');

// ── HTTP helpers ──────────────────────────────────────────────────────────────
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

// Fetch a ZenBin page's HTML (GET /p/{slug})
async function fetchZenBin(slug) {
  return req({
    hostname: ZENBIN_HOST,
    path: `/p/${slug}`,
    method: 'GET',
    headers: { 'Accept': 'text/html' },
  });
}

// Create a ZenBin page (POST /v1/pages/{slug}) — no auth required
async function createZenBin(slug, title, html) {
  const body = JSON.stringify({ title, html });
  return req({
    hostname: ZENBIN_HOST,
    path: `/v1/pages/${slug}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
}

// Read queue.json from GitHub repo (public raw URL, no auth needed)
async function getRepoQueue() {
  return req({
    hostname: 'raw.githubusercontent.com',
    path: `/${GITHUB_REPO}/main/${QUEUE_FILE}`,
    method: 'GET',
    headers: { 'User-Agent': 'design-studio-agent/1.0' },
  });
}

// Update queue.json in GitHub repo via Contents API (PAT stays server-side)
async function updateRepoQueue(queue, currentSha) {
  const content = Buffer.from(JSON.stringify(queue, null, 2)).toString('base64');
  const body = JSON.stringify({
    message: `update: queue — ${queue.submissions.filter(s=>s.status==='done').length} published`,
    content,
    sha: currentSha,
  });
  return req({
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_REPO}/contents/${QUEUE_FILE}`,
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'design-studio-agent/1.0',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Accept': 'application/vnd.github.v3+json',
    },
  }, body);
}

// Get current SHA of queue.json (needed for updates)
async function getQueueSha() {
  const r = await req({
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_REPO}/contents/${QUEUE_FILE}`,
    method: 'GET',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'design-studio-agent/1.0',
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  if (r.status !== 200) throw new Error(`Could not get queue SHA: ${r.status}`);
  return JSON.parse(r.body).sha;
}

// ── Slug scanner ──────────────────────────────────────────────────────────────
// Submissions use slug format: ds-req-{timestamp_minutes_b36}
// e.g. ds-req-lm3k9x  (base36 of Unix minutes)
// Agent enumerates all minute-timestamps for the past LOOKBACK_MINUTES.
// Only 180 HTTPS GETs per run — fast and requires zero shared state.
// Processed slugs tracked in a local state file to skip re-checking.

const STATE_PATH = path.join(__dirname, 'zenbin-queue-state.json');
const DELAY_MS   = 400;  // ms between ZenBin GETs to avoid rate-limiting

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch {}
  return { processed_slugs: [], last_ts_min: 0 };
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Only check slugs newer than the last successful run (plus a 5-min overlap buffer).
// On first run, looks back 3 hours.
function slugsToCheck(lastTsMin) {
  const nowMin  = Math.floor(Date.now() / 60000);
  const fromMin = lastTsMin > 0 ? Math.max(lastTsMin - 5, nowMin - 180) : nowMin - 180;
  const slugs   = [];
  for (let m = fromMin; m <= nowMin; m++) {
    slugs.push(QUEUE_PREFIX + m.toString(36));
  }
  return slugs;
}

// Parse the submission JSON embedded in a ZenBin page
function parseSubmission(html) {
  const match = html.match(/<script[^>]+id="submission"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

// ── LLM request helper (handles both http:// and https:// base URLs) ──────────
function reqAny(urlStr, opts, body) {
  return new Promise((resolve, reject) => {
    const u   = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + (u.search || ''),
      method:   opts.method || 'POST',
      headers:  opts.headers || {},
    };
    const r = mod.request(options, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// ── LLM caller — tries Anthropic then OpenAI, returns null if neither works ───
async function callLLM(userPrompt) {
  if (ANTHROPIC_KEY) {
    try {
      const body = JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const r = await reqAny(`${ANTHROPIC_BASE}/v1/messages`, {
        headers: {
          'Content-Type':      'application/json',
          'Content-Length':    Buffer.byteLength(body),
          'x-api-key':         ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
      }, body);
      if (r.status === 200) return JSON.parse(r.body).content[0].text;
      console.warn(`  ⚠ Anthropic ${r.status}: ${r.body.slice(0, 120)}`);
    } catch (e) { console.warn(`  ⚠ Anthropic error: ${e.message}`); }
  }
  if (OPENAI_KEY) {
    try {
      const body = JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const r = await reqAny(`${OPENAI_BASE}/v1/chat/completions`, {
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization':  `Bearer ${OPENAI_KEY}`,
        },
      }, body);
      if (r.status === 200) return JSON.parse(r.body).choices[0].message.content;
      console.warn(`  ⚠ OpenAI ${r.status}: ${r.body.slice(0, 120)}`);
    } catch (e) { console.warn(`  ⚠ OpenAI error: ${e.message}`); }
  }
  return null;
}

// ── PRD expander ───────────────────────────────────────────────────────────────
const PRD_PROMPT_TEMPLATE = `You are a senior product designer and technical writer. Expand this app idea into a concise, specific product brief. Be direct and concrete — avoid vague generalities.

Format your response in exactly this markdown structure:

## App Name
[2-4 word name. No generic words like "App", "Hub", "Pro".]

## Tagline
[One punchy sentence, max 10 words.]

## Overview
[2-3 sentences: what it does, who it's for, what makes it different.]

## Target Users
- [User type with specific context]
- [User type with specific context]

## Core Features
- **Feature Name**: one-line description
(list 5-7 features)

## Design Direction
[3-4 sentences covering: specific color palette mood, typography style, layout density, interaction feel, and real design references.]

## Key Screens
- **Screen Name**: brief description
(list 5-6 screens)

Total: 280-420 words. Be specific. Cite real design references.

App idea: "{PROMPT}"
Category: {CATEGORY}`;

async function expandPromptToPRD(prompt, appType) {
  const userMsg = PRD_PROMPT_TEMPLATE
    .replace('{PROMPT}',   prompt)
    .replace('{CATEGORY}', appType && appType !== 'auto' ? appType : 'auto-detect');

  const llmText = await callLLM(userMsg);
  if (llmText) {
    console.log('  🤖 PRD generated via LLM');
    return llmText;
  }

  console.log('  📝 PRD generated via rule-based fallback (add ANTHROPIC_API_KEY or OPENAI_API_KEY to community-config.json for LLM expansion)');
  return generateRuleBasedPRD(prompt, appType);
}

function inferCategoryFromPrompt(p) {
  const t = p.toLowerCase();
  if (/finance|money|budget|bank|payment|invest|wealth|spend|saving|crypto|wallet|revenue|metric|reporting/.test(t)) return 'finance';
  if (/health|fitness|workout|exercise|sleep|nutrition|wellness|mental|meditation|care/.test(t)) return 'health';
  if (/social|community|friend|connect|chat|message|share|post|follow|telegram|discord/.test(t)) return 'social';
  if (/music|audio|podcast|playlist|song|listen|beat|sound/.test(t)) return 'music';
  if (/travel|map|route|trip|navigate|hotel|flight|explore|destination/.test(t)) return 'travel';
  if (/food|recipe|cook|restaurant|meal|eat|ingredient|diet/.test(t)) return 'food';
  if (/shop|commerce|market|buy|sell|product|store|ecommerce/.test(t)) return 'commerce';
  if (/learn|course|study|education|quiz|lesson|skill|tutor/.test(t)) return 'education';
  if (/design|creative|art|photo|video|edit|portfolio/.test(t)) return 'creative';
  return 'productivity';
}

function deriveNameFromPrompt(prompt, fallback) {
  const stopWords = new Set(['that','with','your','this','from','into','have','will','about','should','would','could','their','there','where','which','what','when','just','very','over','under','more','most','some','such','only','both','also','then','than','them','they','been','being','each','much','many','these','those','while','after','before','since','until','even','like','well','does','gets','lets','puts','uses','adds','ones','ones']);
  const words = prompt.replace(/[^a-z\s]/gi, ' ').toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
  if (words.length > 0) return words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return fallback;
}

function generateRuleBasedPRD(prompt, appType) {
  const cat = appType && appType !== 'auto' ? appType : inferCategoryFromPrompt(prompt);

  const defs = {
    finance: {
      name:     deriveNameFromPrompt(prompt, 'Ledger'),
      tagline:  'Your finances, beautifully clear.',
      overview: 'A financial monitoring and reporting app that gives individuals and organizations a clear, real-time view of their financial health. It surfaces key metrics, automates reporting, and turns raw transaction data into actionable insight.',
      users:    ['Finance teams needing automated cross-department reporting', 'Small business owners tracking cash flow and profitability', 'Individuals building wealth through data-driven spending habits'],
      features: ['**Dashboard**: Real-time KPIs — revenue, expenses, net position, and key ratios', '**Transaction Feed**: Categorized, searchable ledger with merchant tagging and bulk editing', '**Reports**: Auto-generated P&L, cash flow, and budget-vs-actual with PDF export', '**Budget Planner**: Set targets by category with real-time variance tracking', '**Alerts**: Configurable thresholds for anomaly detection and budget overruns', '**Analytics**: Trend charts, forecasting curves, and period-over-period comparison'],
      design:   'Deep navy or near-black backgrounds inspired by Robinhood and Revolut — financial data reads as more authoritative on dark surfaces. Primary accent in emerald green for positive values; red strictly for negative. All numerals in a monospaced typeface for optical alignment in tables and charts. Layout is data-dense but breathable: clear hierarchy with 4px baseline grid, subtle card separators, no decorative elements.',
      screens:  ['**Home Dashboard**: KPI summary cards, spending ring chart, recent activity feed', '**Transaction History**: Searchable ledger with category filter chips and CSV export', '**Report View**: P&L statement with drill-down into line items', '**Budget Tracker**: Category progress bars with over/under indicators', '**Analytics**: Trend lines, bar chart comparisons, and date-range selector'],
    },
    productivity: {
      name:     deriveNameFromPrompt(prompt, 'Flow'),
      tagline:  'Work that actually moves forward.',
      overview: 'A task and project management app built for focused individuals and lean teams. It combines rapid task capture, time blocking, and progress reviews in a single opinionated workspace that respects your time.',
      users:    ['Knowledge workers managing complex, multi-project workloads', 'Freelancers juggling multiple clients and deadlines', 'Small teams needing lightweight coordination without enterprise overhead'],
      features: ['**Task Inbox**: Rapid capture with natural-language date and priority parsing', '**Today View**: Focused daily agenda with time blocks and a burndown tracker', '**Projects**: Hierarchical task organization with status, owner, and due date', '**Weekly Review**: Auto-generated summary of completed work and open loops', '**Integrations**: Two-way calendar sync, Slack notifications, GitHub issue linking', '**Analytics**: Velocity charts, completion rate trends, and focus-time breakdown'],
      design:   'Clean and fast — inspired by Linear and Things 3. Warm off-white or light backgrounds for focus context; dark mode available. Indigo or electric blue for active states and CTAs. Geometric sans-serif for UI chrome; slightly warmer humanist for body text. Dense list views with compact 32px row heights; detail panels slide in from the right. Animation is minimal and purposeful.',
      screens:  ['**Inbox**: Capture bar, unprocessed task list, quick-triage controls', '**Today**: Time-blocked agenda with drag-to-reschedule and completion checkboxes', '**Project Board**: Kanban view with status columns and compact task cards', '**Task Detail**: Description, subtasks, attachments, activity log, due date', '**Weekly Review**: Completion stats, open loops, and next-week planning surface'],
    },
    social: {
      name:     deriveNameFromPrompt(prompt, 'Gather'),
      tagline:  'Closer to the people that matter.',
      overview: 'A community platform built for meaningful connection over passive scrolling. It creates structured shared spaces for groups with common interests through threaded discussion, collaborative content, and real-time coordination.',
      users:    ['Niche interest communities seeking alternatives to algorithmic social feeds', 'Friend groups wanting a private, organized digital home base', 'Creators building direct relationships with their audience'],
      features: ['**Spaces**: Topic-organized community rooms with threaded discussion and pinned content', '**Feed**: Reverse-chronological posts — no engagement algorithm', '**Direct Messages**: Private 1:1 and group messaging with rich media and reactions', '**Events**: In-app event creation with RSVP tracking and calendar export', '**Collections**: Shared curated boards for links, images, and recommendations', '**Discovery**: Interest-based community search without engagement-optimization tricks'],
      design:   'Warm and human — terracotta, amber, or dusty rose accents against off-white or warm ivory. Avatar-forward layouts with editorial typography: display headings in a humanist serif or variable-weight grotesque, body text well-leaded. Dense conversation threads use tight line-height; standalone post cards get generous breathing room. No algorithmic badge counts.',
      screens:  ['**Home Feed**: Chronological posts from connections, clean card layout', '**Space**: Community room with pinned content, thread list, member count', '**Thread**: Nested discussion with reply chains and emoji reactions', '**Profile**: Posts, collections, spaces joined, mutual connections', '**Direct Messages**: Conversation list + active chat with media preview'],
    },
    health: {
      name:     deriveNameFromPrompt(prompt, 'Vitals'),
      tagline:  'Your health, in full view.',
      overview: 'A personal health tracking app that unifies fitness, nutrition, sleep, and mental wellness into a coherent daily picture. Designed for sustainable habit-building through gentle accountability rather than aggressive gamification.',
      users:    ['Health-conscious individuals building long-term wellness routines', 'People managing chronic conditions who need symptom and medication tracking', 'Fitness enthusiasts who want performance data without sports-app complexity'],
      features: ['**Daily Check-in**: Morning wellness snapshot — sleep quality, mood, energy, hydration', '**Activity Log**: Workout tracking with type, duration, intensity, and GPS routes', '**Nutrition**: Meal and hydration logging with macro and calorie breakdown', '**Sleep Analysis**: Duration and quality trends with 30-day rolling averages', '**Correlations**: Cross-metric pattern detection (sleep vs. mood, steps vs. energy)', '**Habit Streaks**: Up to 8 tracked daily habits with gentle push reminders'],
      design:   'Calm and supportive — health UIs should never feel clinical. Soft warm-white or very light sage backgrounds. Primary accent in a confident but non-aggressive teal or green; warm amber for caution states; soft lavender for mental wellness contexts. Everything rounded — cards, buttons, charts. Motion is gentle: health data surfaces slowly, never urgently.',
      screens:  ['**Today**: Daily stats ring, habit checklist, quick-log shortcuts', '**Activity**: Workout history with effort color-coding and weekly summary', '**Nutrition**: Macro ring, meal log with food search and recent items', '**Sleep**: Last-night detail view + 30-day trend chart', '**Insights**: Weekly summary cards highlighting correlations and streak records'],
    },
  };

  const d = defs[cat] || defs.productivity;
  return [
    `## App Name\n${d.name}`,
    `## Tagline\n${d.tagline}`,
    `## Overview\n${d.overview}`,
    `## Target Users\n${d.users.map(u => `- ${u}`).join('\n')}`,
    `## Core Features\n${d.features.map(f => `- ${f}`).join('\n')}`,
    `## Design Direction\n${d.design}`,
    `## Key Screens\n${d.screens.map(s => `- ${s}`).join('\n')}`,
  ].join('\n\n');
}

// ── PRD parser — extracts design signals from the markdown ───────────────────
function parsePRD(markdown) {
  const result = { appName: null, tagline: null, designDirection: null, features: [], screens: [] };
  const sectionRegex = /^## (.+)$/gm;
  const positions = [];
  let m;
  while ((m = sectionRegex.exec(markdown)) !== null) {
    positions.push({ name: m[1].trim().toLowerCase(), pos: m.index + m[0].length });
  }
  const get = name => {
    const i = positions.findIndex(p => p.name === name);
    if (i < 0) return '';
    const start = positions[i].pos;
    const end   = i + 1 < positions.length ? positions[i + 1].pos - positions[i + 1].name.length - 5 : undefined;
    return markdown.slice(start, end).trim();
  };
  const raw = get('app name');
  if (raw) result.appName = raw.replace(/[\[\]]/g, '').split('\n')[0].trim().replace(/\.$/, '').replace(/^["']|["']$/g, '');
  const tag = get('tagline');
  if (tag) result.tagline = tag.replace(/[\[\]]/g, '').split('\n')[0].trim().replace(/\.$/, '').replace(/^["']|["']$/g, '');
  result.designDirection = get('design direction');
  result.features = get('core features').split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
  result.screens  = get('key screens').split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
  return result;
}

// ── Strip PRD screen entry to a clean title: "**Home Dashboard**: desc…" → "Home Dashboard" ──
function cleanScreenName(s) {
  return s
    .replace(/\*\*/g, '')           // remove bold markers
    .replace(/:.*$/, '')            // remove ": description" part
    .trim();
}

// ── Minimal markdown → HTML renderer (for PRD display) ───────────────────────
function mdToHtml(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em>$1</em>')
    .replace(/^- (.+)$/gm,   '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '')
    .replace(/^<\/p><p>(<[hul])/gm, '$1')
    .replace(/(<\/[hul][^>]*>)<\/p><p>/g, '$1')
    .trim();
}

// ── Design generator ──────────────────────────────────────────────────────────
const { generateDesign } = require('./community-design-generator');

// ── SVG thumbnail renderer ────────────────────────────────────────────────────
// Recursively renders .pen elements into SVG. Children use relative coords
// (offset by parent frame position via <g transform="translate">).
function renderElSVG(el, depth) {
  if (!el || depth > 5) return '';
  const x = el.x || 0, y = el.y || 0;
  const w = Math.max(0, el.width || 0), h = Math.max(0, el.height || 0);
  const fill = el.fill || 'none';
  const oAttr = (el.opacity !== undefined && el.opacity < 0.99) ? ` opacity="${el.opacity.toFixed(2)}"` : '';
  const rAttr = el.cornerRadius ? ` rx="${Math.min(el.cornerRadius, w/2, h/2)}"` : '';

  if (el.type === 'frame') {
    const bg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${rAttr}${oAttr}/>`;
    const kids = (el.children || []).map(c => renderElSVG(c, depth + 1)).join('');
    if (!kids) return bg;
    return `${bg}<g transform="translate(${x},${y})">${kids}</g>`;
  }
  if (el.type === 'ellipse') {
    const rx = w / 2, ry = h / 2;
    return `<ellipse cx="${x + rx}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="${fill}"${oAttr}/>`;
  }
  if (el.type === 'text') {
    // render as a filled bar — readable at thumbnail scale, font-size varies too much
    const fh = Math.max(1, Math.min(h, (el.fontSize || 13) * 0.7));
    return `<rect x="${x}" y="${y + (h - fh) / 2}" width="${w}" height="${fh}" fill="${fill}"${oAttr} rx="1"/>`;
  }
  return '';
}

function screenThumbSVG(screen, tw, th) {
  const sw = screen.width, sh = screen.height;
  const kids = (screen.children || []).map(c => renderElSVG(c, 0)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}" width="${tw}" height="${th}" style="display:block;border-radius:6px;flex-shrink:0"><rect width="${sw}" height="${sh}" fill="${screen.fill||'#111'}"/>${kids}</svg>`;
}

function buildHeartbeatHTML(sub, doc, meta, penJson, prdMarkdown, prdScreenNames) {
  const encoded = Buffer.from(JSON.stringify(penJson)).toString('base64');
  const screens = doc.children || [];
  // Thumbnail dimensions — all at height 180px, width proportional to aspect ratio
  const THUMB_H = 180;
  // prdScreenNames is array of 5 clean screen titles (shared between mobile + desktop)
  const screenLabels = (prdScreenNames && prdScreenNames.length) ? prdScreenNames : null;
  const thumbsHTML = screens.map((s, i) => {
    const tw = Math.round(THUMB_H * (s.width / s.height));
    const isMobile = s.width < 500;
    const screenIdx = i % 5; // 0-4 for both mobile and desktop halves
    const label = screenLabels
      ? `${isMobile ? 'M' : 'D'} · ${screenLabels[screenIdx] || (isMobile ? 'MOBILE' : 'DESKTOP') + ' ' + (screenIdx + 1)}`
      : `${isMobile ? 'MOBILE' : 'DESKTOP'} ${screenIdx + 1}`;
    return `<div style="text-align:center;flex-shrink:0">
      ${screenThumbSVG(s, tw, THUMB_H)}
      <div style="font-size:9px;opacity:.4;margin-top:8px;letter-spacing:1px;max-width:${tw}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label.toUpperCase()}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${meta.appName} — Community Design</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${meta.palette.bg};color:${meta.palette.fg};font-family:'SF Mono','Fira Code',ui-monospace,monospace;min-height:100vh}
  nav{padding:20px 40px;border-bottom:1px solid ${meta.palette.accent}22;display:flex;justify-content:space-between;align-items:center}
  .logo{font-size:14px;font-weight:700;letter-spacing:4px}
  .nav-id{font-size:11px;color:${meta.palette.accent};letter-spacing:1px}
  .hero{padding:80px 40px 40px;max-width:900px}
  .tag{font-size:10px;letter-spacing:3px;color:${meta.palette.accent};margin-bottom:20px}
  h1{font-size:clamp(48px,8vw,96px);font-weight:900;letter-spacing:-2px;line-height:1;margin-bottom:20px}
  .sub{font-size:16px;opacity:.5;max-width:480px;line-height:1.6;margin-bottom:36px}
  .meta{display:flex;gap:32px;margin-bottom:44px;flex-wrap:wrap}
  .meta-item span{display:block;font-size:10px;opacity:.4;letter-spacing:1px;margin-bottom:4px}
  .meta-item strong{color:${meta.palette.accent}}
  .actions{display:flex;gap:14px;margin-bottom:60px;flex-wrap:wrap}
  .btn{padding:14px 28px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:none;text-decoration:none;font-family:inherit;display:inline-block}
  .btn-p{background:${meta.palette.accent};color:${meta.palette.bg}}
  .btn-s{background:transparent;color:${meta.palette.fg};border:1px solid ${meta.palette.fg}33}
  .preview{padding:0 40px 80px}
  .preview-label{font-size:10px;letter-spacing:2px;opacity:.4;margin-bottom:20px}
  .thumbs{display:flex;gap:16px;overflow-x:auto;padding-bottom:8px}
  .thumbs::-webkit-scrollbar{height:4px}.thumbs::-webkit-scrollbar-track{background:transparent}
  .thumbs::-webkit-scrollbar-thumb{background:${meta.palette.accent}44;border-radius:2px}
  .prompt-section{padding:40px;border-top:1px solid ${meta.palette.accent}22}
  .p-label{font-size:10px;letter-spacing:2px;color:${meta.palette.accent};margin-bottom:12px}
  .p-text{font-size:18px;opacity:.6;font-style:italic;max-width:600px;line-height:1.6}
  .prd-section{padding:40px;border-top:1px solid ${meta.palette.accent}22;max-width:780px}
  .prd-section h3{font-size:10px;letter-spacing:2px;color:${meta.palette.accent};margin:28px 0 10px;font-weight:700}
  .prd-section h3:first-child{margin-top:0}
  .prd-section p,.prd-section li{font-size:14px;opacity:.65;line-height:1.72;max-width:680px}
  .prd-section ul{padding-left:18px;margin:6px 0}
  .prd-section li{margin-bottom:4px}
  .prd-section strong{opacity:1;color:${meta.palette.fg}}
  footer{padding:28px 40px;border-top:1px solid ${meta.palette.accent}11;font-size:11px;opacity:.3;display:flex;justify-content:space-between}
</style>
</head>
<body>
<nav>
  <div class="logo">DESIGN STUDIO</div>
  <div class="nav-id">COMMUNITY · ${sub.id}</div>
</nav>
<section class="hero">
  <div class="tag">COMMUNITY DESIGN · ${meta.archetype.toUpperCase()} · ${new Date(sub.submitted_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}).toUpperCase()}</div>
  <h1>${meta.appName}</h1>
  <p class="sub">${meta.tagline}</p>
  <div class="meta">
    <div class="meta-item"><span>ARCHETYPE</span><strong>${meta.archetype.toUpperCase()}</strong></div>
    <div class="meta-item"><span>SCREENS</span><strong>${meta.screens} (5 MOBILE + 5 DESKTOP)</strong></div>
    <div class="meta-item"><span>PALETTE</span><strong>${meta.palette.bg} · ${meta.palette.accent}</strong></div>
    <div class="meta-item"><span>SUBMITTED BY</span><strong>${sub.credit||'Anonymous'}</strong></div>
  </div>
  <div class="actions">
    <button class="btn btn-p" onclick="openInViewer()">▶ Open in Pen Viewer</button>
    <button class="btn btn-s" onclick="downloadPen()">↓ Download .pen</button>
    <button class="btn btn-s" onclick="shareOnX()">𝕏 Share</button>
    <a class="btn btn-s" href="https://zenbin.org/p/design-gallery-2">← Gallery</a>
    <a class="btn btn-s" href="https://zenbin.org/p/design-submit-3">Submit Idea</a>
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
${prdMarkdown ? `<section class="prd-section">
  <div class="p-label">PRODUCT BRIEF</div>
  ${mdToHtml(prdMarkdown)}
</section>` : ''}
<footer>
  <span>Generated by RAM Design Studio</span>
  <span>zenbin.org/p/${sub.id}</span>
</footer>
<script>
const D='${encoded}';
function openInViewer(){
  try{
    const jsonStr=atob(D);
    JSON.parse(jsonStr); // validate before sending
    localStorage.setItem('pv_pending',JSON.stringify({json:jsonStr,name:'${meta.appName.toLowerCase()}.pen'}));
    window.open('https://zenbin.org/p/pen-viewer-2','_blank');
  }catch(e){alert('Could not load pen data: '+e.message);}
}
function downloadPen(){
  try{
    const jsonStr=atob(D);
    const blob=new Blob([jsonStr],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='${meta.appName.toLowerCase()}.pen';
    a.click();
    URL.revokeObjectURL(a.href);
  }catch(e){alert('Download failed: '+e.message);}
}
function shareOnX(){
  const text=encodeURIComponent('Check out ${meta.appName} — an AI-generated app design from RAM Design Studio 🎨');
  const url=encodeURIComponent(window.location.href);
  window.open('https://x.com/intent/tweet?text='+text+'&url='+url,'_blank');
}
<\/script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🎨 Design Studio — ZenBin Queue Processor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Architecture: form writes to ZenBin (no auth) → agent reads + processes → PAT stays server-side\n');

  const state         = loadState();
  const toCheck       = slugsToCheck(state.last_ts_min || 0);
  const processed_set = new Set(state.processed_slugs || []);
  console.log(`Checking ${toCheck.length} slots (since last run)\n`);

  let found     = 0;
  let published = 0;
  let errors    = 0;

  // Load gallery registry from GitHub repo (public raw URL — no auth needed to read)
  let repoQueue  = { version: 1, submissions: [], updated_at: new Date().toISOString() };
  let queueSha   = null;
  const hasRepo  = GITHUB_TOKEN && GITHUB_REPO;

  if (hasRepo) {
    try {
      const raw = await getRepoQueue();
      if (raw.status === 200) {
        repoQueue = JSON.parse(raw.body);
        queueSha  = await getQueueSha();
        console.log(`📋 Loaded gallery registry: ${repoQueue.submissions.length} total submissions`);
      }
    } catch (err) {
      console.warn('⚠ Could not load repo queue (gallery updates will be skipped):', err.message);
    }
  } else {
    console.log('ℹ No GITHUB_TOKEN/GITHUB_REPO — designs will be published to ZenBin but gallery registry will not be updated.\n');
  }

  for (const slug of toCheck) {
    await sleep(DELAY_MS);

    if (processed_set.has(slug)) continue;

    // Check if a -done marker exists
    const doneSlug  = slug + '-done';
    const doneCheck = await fetchZenBin(doneSlug);
    await sleep(DELAY_MS);
    if (doneCheck.status === 200) {
      console.log(`  ✓  ${slug} — already done (marker found)`);
      processed_set.add(slug);
      continue;
    }

    // Fetch the submission page
    const pageRes = await fetchZenBin(slug);
    if (pageRes.status !== 200) {
      console.log(`  ✗  ${slug} — not found (HTTP ${pageRes.status}), skipping`);
      continue;
    }

    const sub = parseSubmission(pageRes.body);
    if (!sub) {
      console.log(`  ⚠  ${slug} — could not parse submission JSON`);
      continue;
    }

    found++;
    console.log(`\n▶ [${slug}] "${sub.prompt.slice(0,60)}..."`);

    try {
      // Step 1: Expand prompt into a full Product Requirements Document
      console.log('  📋 Expanding prompt into product brief...');
      const prdMarkdown = await expandPromptToPRD(sub.prompt, sub.app_type);
      const prd = parsePRD(prdMarkdown);
      if (prd.appName)  console.log(`     App name:  ${prd.appName}`);
      if (prd.tagline)  console.log(`     Tagline:   ${prd.tagline}`);
      if (prd.features.length) console.log(`     Features:  ${prd.features.length} extracted`);

      // Step 2: Generate design — PRD signals override auto-detected values
      console.log('  🎨 Generating design...');
      const { doc, meta } = generateDesign({
        prompt:              sub.prompt,  // use original prompt for archetype/palette detection
        appNameOverride:     sub.app_name_override || prd.appName || undefined,
        taglineOverride:     prd.tagline || undefined,
        screenNamesOverride: prd.screens.length ? prd.screens.map(cleanScreenName) : undefined,
      });
      console.log(`  ✓ ${meta.appName} (${meta.archetype}, ${meta.screens} screens)`);

      // Publish design page
      const designSlug = `community-${slug}`;
      sub.design_url   = `https://zenbin.org/p/${designSlug}`;
      sub.app_name     = meta.appName;
      sub.archetype    = meta.archetype;
      sub.published_at = new Date().toISOString();
      sub.status       = 'done';

      const prdScreenNames = prd.screens.length ? prd.screens.map(cleanScreenName) : null;
      const html = buildHeartbeatHTML(sub, doc, meta, doc, prdMarkdown, prdScreenNames);
      console.log(`  📤 Publishing to zenbin.org/p/${designSlug}...`);

      let publishedOk = false;
      for (const trySlug of [designSlug, designSlug + '-' + Date.now().toString(36)]) {
        const r = await createZenBin(trySlug, `${meta.appName} — Community Design`, html);
        if (r.status === 201 || r.status === 200) {
          sub.design_url = `https://zenbin.org/p/${trySlug}`;
          console.log(`  ✅ Published: ${sub.design_url}`);
          publishedOk = true;
          break;
        }
        if (r.status !== 409) {
          throw new Error(`ZenBin publish failed: ${r.status}`);
        }
      }

      if (!publishedOk) throw new Error('Could not publish — all slugs taken');

      // Create done marker (ZenBin page, no auth needed)
      await createZenBin(doneSlug, `Done: ${slug}`,
        `<html><body><p style="font-family:monospace;padding:24px">
          Submission ${slug} processed. Design at <a href="${sub.design_url}">${sub.design_url}</a>
        </p></body></html>`
      );

      // Update GitHub repo gallery registry (PAT used here only — server-side)
      if (hasRepo && queueSha) {
        repoQueue.submissions = repoQueue.submissions || [];
        const existing = repoQueue.submissions.findIndex(s => s.id === slug);
        if (existing >= 0) {
          repoQueue.submissions[existing] = sub;
        } else {
          repoQueue.submissions.push(sub);
        }
        repoQueue.updated_at = new Date().toISOString();
        const gr = await updateRepoQueue(repoQueue, queueSha);
        if (gr.status === 200) {
          const updated = JSON.parse(gr.body);
          queueSha = updated.content.sha;  // update SHA for next write
          console.log('  📝 Gallery registry updated (GitHub repo)');
        } else {
          console.warn(`  ⚠ Gallery update returned HTTP ${gr.status}`);
        }
      }

      processed_set.add(slug);
      published++;

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      errors++;
    }
  }

  // Persist state — next run only checks new slugs
  state.processed_slugs = [...processed_set];
  state.last_ts_min     = Math.floor(Date.now() / 60000);
  state.last_run        = new Date().toISOString();
  saveState(state);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Done: ${found} found, ${published} published, ${errors} errors`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

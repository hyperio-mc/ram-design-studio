'use strict';
// prd-utils.js
// Shared PRD (Product Requirements Document) utilities.
// Used by process-zenbin-queue.js (production pipeline) and reprocess-hlki9.js (utility script).

// ── Category detection ────────────────────────────────────────────────────────
// Returns one of the 4 categories that have rule-based PRD templates.
// Anything unrecognised falls back to 'productivity'.
function inferCategoryFromPrompt(p) {
  const t = p.toLowerCase();
  if (/finance|money|budget|bank|payment|invest|wealth|spend|saving|crypto|wallet|revenue|metric|reporting/.test(t)) return 'finance';
  if (/health|fitness|workout|exercise|sleep|nutrition|wellness|mental|meditation|care/.test(t)) return 'health';
  if (/social|community|friend|connect|chat|message|share|post|follow|telegram|discord/.test(t)) return 'social';
  return 'productivity';
}

// ── Name derivation ───────────────────────────────────────────────────────────
function deriveNameFromPrompt(prompt, fallback) {
  const stopWords = new Set(['that','with','your','this','from','into','have','will','about','should','would','could','their','there','where','which','what','when','just','very','over','under','more','most','some','such','only','both','also','then','than','them','they','been','being','each','much','many','these','those','while','after','before','since','until','even','like','well','does','gets','lets','puts','uses','adds','ones']);
  const words = prompt.replace(/[^a-z\s]/gi, ' ').toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
  return words.length > 0 ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : fallback;
}

// ── Rule-based PRD generator ──────────────────────────────────────────────────
// Produces a structured markdown PRD from a prompt using one of 4 category templates.
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

// ── PRD parser — extracts design signals from a markdown PRD ─────────────────
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

// ── Screen name cleaner: "**Home Dashboard**: desc…" → "Home Dashboard" ──────
function cleanScreenName(s, fallback = '') {
  if (!s || typeof s !== 'string') return fallback;
  const cleaned = s.replace(/\*\*/g, '').replace(/:.*$/, '').trim();
  return cleaned || fallback;
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

module.exports = { inferCategoryFromPrompt, deriveNameFromPrompt, generateRuleBasedPRD, parsePRD, cleanScreenName, mdToHtml };

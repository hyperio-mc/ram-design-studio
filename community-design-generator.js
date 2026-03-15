'use strict';
// community-design-generator.js
// Generates a 10-screen (5 mobile + 5 desktop) .pen v2.8 document
// from a natural-language prompt. Used by the community submission pipeline.

// ── IDs ─────────────────────────────────────────────────────────────────────
let _id = 0;
const uid = (pfx = 'c') => `${pfx}${++_id}`;
const resetId = () => { _id = 0; };

// ── Core helpers (mirrors vector-app.js conventions exactly) ─────────────────
const F = (x, y, w, h, fill, opts = {}) => ({
  id: uid(), type: 'frame', x, y, width: w, height: h,
  fill: fill || '#050509',
  clip: opts.clip !== undefined ? opts.clip : false,
  ...(opts.r !== undefined ? { cornerRadius: opts.r } : {}),
  ...(opts.stroke ? { stroke: { align: 'inside', thickness: opts.sw || 1, fill: opts.stroke } } : {}),
  ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
  children: opts.ch || [],
});

const T = (content, x, y, w, h, opts = {}) => ({
  id: uid(), type: 'text', content, x, y, width: w, height: h,
  textGrowth: 'fixed-width-height',
  fontSize: opts.size || 13,
  fontWeight: String(opts.weight || 400),
  fill: opts.fill || '#f4f0e8',
  textAlign: opts.align || 'left',
  ...(opts.ls !== undefined ? { letterSpacing: opts.ls } : {}),
  ...(opts.lh !== undefined ? { lineHeight: opts.lh } : {}),
  ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
});

const E = (x, y, w, h, fill, opts = {}) => ({
  id: uid(), type: 'ellipse', x, y, width: w, height: h,
  fill: fill || '#f4f0e8',
  ...(opts.stroke ? { stroke: { align: 'inside', thickness: opts.sw || 1, fill: opts.stroke } } : {}),
  ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
});

const Line  = (x, y, w, opts = {}) => F(x, y, w,  1, opts.fill || '#242430', {});
const VLine = (x, y, h, opts = {}) => F(x, y,  1, h, opts.fill || '#242430', {});

// Corner brackets (cinematic tech aesthetic)
const CB = (x, y, w, h, color, sz = 10, opacity = 0.5) => [
  F(x,         y,          sz, 1,  color, { opacity }),
  F(x,         y,          1,  sz, color, { opacity }),
  F(x + w - sz,y,          sz, 1,  color, { opacity }),
  F(x + w - 1, y,          1,  sz, color, { opacity }),
  F(x,         y + h - 1,  sz, 1,  color, { opacity }),
  F(x,         y + h - sz, 1,  sz, color, { opacity }),
  F(x + w - sz,y + h - 1,  sz, 1,  color, { opacity }),
  F(x + w - 1, y + h - sz, 1,  sz, color, { opacity }),
];

// Pill/badge
const Pill = (label, x, y, bg, fg, r = 10) => F(x, y, label.length * 6.5 + 16, 22, bg, {
  r,
  ch: [T(label, 8, 4, label.length * 6.5, 14, { size: 10, fill: fg, weight: 600, ls: 0.3 })],
});

// ── Archetype registry ────────────────────────────────────────────────────────
const ARCHETYPES = {
  music: {
    bg: '#08080f', surface: '#101018', border: '#202030', muted: '#606078',
    fg: '#f0ebe0', accent: '#c8953a', accent2: '#7a4fff',
    appName: 'SONIQ', tagline: 'Sound Without Boundaries',
    navItems: ['Library', 'Explore', 'Create', 'Radio', 'Profile'],
    screens: { mobile: ['hero','player','library','studio','profile'], desktop: ['landing','dashboard','library','editor','settings'] },
  },
  food: {
    bg: '#0d0b09', surface: '#161210', border: '#26201a', muted: '#706050',
    fg: '#f8f0e5', accent: '#d4863a', accent2: '#4a9e5c',
    appName: 'SAVOR', tagline: 'Every Meal, Mastered',
    navItems: ['Home', 'Recipes', 'Plan', 'Shop', 'Profile'],
    screens: { mobile: ['hero','feed','recipe','planner','profile'], desktop: ['landing','dashboard','recipes','detail','settings'] },
  },
  finance: {
    bg: '#060c14', surface: '#0d1622', border: '#1a2840', muted: '#4a6080',
    fg: '#edf3ff', accent: '#3a8fff', accent2: '#3acd7a',
    appName: 'LEDGR', tagline: 'Capital. Clarity. Control.',
    navItems: ['Overview', 'Accounts', 'Invest', 'Transfer', 'Settings'],
    screens: { mobile: ['hero','overview','accounts','invest','profile'], desktop: ['landing','dashboard','accounts','analytics','settings'] },
  },
  health: {
    bg: '#060f08', surface: '#0c1a10', border: '#162a1c', muted: '#4a7055',
    fg: '#eefff2', accent: '#3acd7a', accent2: '#f0a030',
    appName: 'VITLS', tagline: 'Your Body. Your Data.',
    navItems: ['Today', 'Activity', 'Nutrition', 'Sleep', 'Profile'],
    screens: { mobile: ['hero','today','activity','nutrition','profile'], desktop: ['landing','dashboard','activity','nutrition','settings'] },
  },
  travel: {
    bg: '#060a14', surface: '#0c1422', border: '#182030', muted: '#4a5878',
    fg: '#eef2ff', accent: '#4a9fff', accent2: '#e8c86a',
    appName: 'WAYPR', tagline: 'Anywhere. Anytime.',
    navItems: ['Explore', 'Trips', 'Saved', 'Map', 'Profile'],
    screens: { mobile: ['hero','explore','trip','map','profile'], desktop: ['landing','dashboard','explore','detail','settings'] },
  },
  social: {
    bg: '#0d0610', surface: '#18101e', border: '#28182e', muted: '#706080',
    fg: '#fff0ff', accent: '#c840ff', accent2: '#ff4060',
    appName: 'NEXUS', tagline: 'Connect. Create. Converge.',
    navItems: ['Feed', 'Explore', 'Create', 'Inbox', 'Profile'],
    screens: { mobile: ['hero','feed','explore','inbox','profile'], desktop: ['landing','dashboard','feed','create','settings'] },
  },
  education: {
    bg: '#07080f', surface: '#0f1020', border: '#1c1e34', muted: '#505080',
    fg: '#f0f0ff', accent: '#6060ff', accent2: '#40c8ff',
    appName: 'SCHOL', tagline: 'Knowledge. Accelerated.',
    navItems: ['Learn', 'Courses', 'Progress', 'Community', 'Profile'],
    screens: { mobile: ['hero','courses','lesson','progress','profile'], desktop: ['landing','dashboard','courses','lesson','settings'] },
  },
  commerce: {
    bg: '#0f0808', surface: '#1e1010', border: '#301818', muted: '#706050',
    fg: '#fff8f0', accent: '#e06030', accent2: '#3a8fff',
    appName: 'MARKD', tagline: 'Shop. Discover. Own.',
    navItems: ['Home', 'Shop', 'Orders', 'Saved', 'Profile'],
    screens: { mobile: ['hero','shop','product','cart','profile'], desktop: ['landing','dashboard','catalog','product','settings'] },
  },
  creative: {
    bg: '#080808', surface: '#111111', border: '#222222', muted: '#606060',
    fg: '#f8f8f8', accent: '#ff6060', accent2: '#60ff80',
    appName: 'CRVS', tagline: 'Create Without Limits',
    navItems: ['Studio', 'Gallery', 'Explore', 'Collab', 'Profile'],
    screens: { mobile: ['hero','gallery','studio','explore','profile'], desktop: ['landing','dashboard','gallery','editor','settings'] },
  },
  productivity: {
    bg: '#05050a', surface: '#0d0d16', border: '#1c1c28', muted: '#5a5a70',
    fg: '#f4f0e8', accent: '#c8a84b', accent2: '#3a8fff',
    appName: 'FOCUS', tagline: 'Work. Simplified.',
    navItems: ['Today', 'Projects', 'Tasks', 'Calendar', 'Profile'],
    screens: { mobile: ['hero','projects','task','calendar','profile'], desktop: ['landing','dashboard','projects','task','settings'] },
  },
};

// ── Archetype detection ───────────────────────────────────────────────────────
function detectArchetype(prompt) {
  const p = prompt.toLowerCase();
  if (/music|audio|podcast|playlist|sound|song|beat|track/.test(p)) return 'music';
  if (/food|recipe|cook|meal|diet|nutrition|restaurant|chef/.test(p)) return 'food';
  if (/finance|money|bank|invest|budget|pay|wallet|crypto|stock/.test(p)) return 'finance';
  if (/health|fitness|workout|exercise|medical|doctor|wellness/.test(p)) return 'health';
  if (/travel|trip|book|flight|hotel|destination|vacation/.test(p)) return 'travel';
  if (/social|friend|community|chat|message|network|forum/.test(p)) return 'social';
  if (/learn|education|course|study|school|tutor|quiz/.test(p)) return 'education';
  if (/shop|store|product|buy|commerce|cart|marketplace/.test(p)) return 'commerce';
  if (/creative|design|art|photo|video|media|draw|illustrat/.test(p)) return 'creative';
  return 'productivity';
}

// ── Name extraction ───────────────────────────────────────────────────────────
const SKIP = new Set(['that','this','with','from','have','want','need','like','just','some','your',
  'their','would','could','should','about','design','build','create','make','platform',
  'application','mobile','desktop','website','users','people','ideas','concept','app','for']);

function extractAppName(prompt, archetype) {
  const words = prompt.split(/\s+/).filter(w => w.length > 3 && !SKIP.has(w.toLowerCase()));
  const w = words[0];
  if (w) return w.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return ARCHETYPES[archetype].appName;
}

// ══════════════════════════════════════════════════════════════════════════════
// MOBILE SCREEN BUILDERS (375×812)
// All child coordinates are RELATIVE to the screen frame — ox is only used
// for the top-level F() call that places the frame on the canvas.
// ══════════════════════════════════════════════════════════════════════════════

function mobileHero(ox, P, appName, tagline) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  return F(ox, 0, 375, 812, bg, { clip: true, ch: [
    // subtle grid
    ...Array.from({length:5}, (_,i) => VLine(75*i + 12, 0, 812, { fill: border })),
    Line(0, 280, 375, { fill: border }),
    Line(0, 560, 375, { fill: border }),

    // status bar
    T('9:41', 16, 14, 60, 16, { size: 12, weight: 600, fill: fg }),
    T('●●●●', 295, 14, 70, 16, { size: 9, fill: muted }),

    // nav
    T(appName, 20, 46, 200, 24, { size: 17, weight: 800, ls: 3, fill: fg }),
    T('☰', 339, 46, 20, 22, { size: 18, fill: muted }),

    // hero text
    T(tagline, 24, 120, 310, 120, { size: 36, weight: 900, ls: -0.8, lh: 42, fill: fg }),
    F(24, 248, 48, 3, accent, {}),

    // abstract visual
    E(187, 316, 200, 200, accent + '14', {}),
    E(207, 336, 160, 160, accent + '20', {}),
    E(227, 356, 120, 120, accent + '30', {}),
    E(251, 380,  72,  72, accent + '55', {}),
    E(267, 396,  40,  40, accent + 'cc', {}),
    ...CB(95, 290, 205, 210, accent, 10, 0.5),

    // CTA
    F(24, 556, 327, 52, accent, { r: 6, ch: [
      T('Get Started', 0, 14, 327, 22, { size: 15, weight: 700, fill: bg, align: 'center' }),
    ]}),
    F(24, 620, 327, 48, bg, { r: 6, stroke: fg, sw: 1, opacity: 0.25, ch: [
      T('Learn More', 0, 13, 327, 22, { size: 14, fill: fg, align: 'center', opacity: 0.5 }),
    ]}),

    // bottom dots
    ...([0,1,2,3].map(i => E(170 + i*14, 756, 6, 6, i === 0 ? accent : fg, { opacity: i === 0 ? 1 : 0.25 }))),
  ]});
}

function mobileFeed(ox, P, appName, cardLabels, screenTitle) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  const cards = cardLabels || ['Featured Today','Just Added','Popular Now','Trending','For You'];
  const header = screenTitle || 'Explore';
  return F(ox, 0, 375, 812, bg, { clip: true, ch: [
    T('9:41', 16, 14, 60, 16, { size:12, weight:600, fill:fg }),
    T('●●●●', 295, 14, 70, 16, { size:9, fill:muted }),

    // header
    T(header, 24, 50, 280, 28, { size:22, weight:800, fill:fg }),
    E(323, 46, 36, 36, accent+'22', {}),
    T('🔍', 327, 52, 24, 24, { size:16, fill:muted }),

    // search bar
    F(24, 96, 327, 42, surface, { r:21, ch:[
      T('Search...', 36, 12, 260, 18, { size:13, fill:muted }),
    ]}),

    // label
    T('FEATURED', 24, 156, 140, 16, { size:10, weight:600, fill:accent, ls:1.5 }),

    // cards (4 cards)
    ...cards.slice(0,4).flatMap((label, i) => {
      const cy = 182 + i * 116;
      const subtitles = ['Begin your journey','Recently added','Trending this week','Curated for you'];
      return [
        F(24, cy, 327, 104, surface, { r:8, ch:[] }),
        F(24, cy, 4, 104, accent, { r:2 }),
        T(label, 44, cy+24, 240, 22, { size:16, weight:600, fill:fg }),
        T(subtitles[i]||'Explore now', 44, cy+50, 240, 16, { size:12, fill:muted }),
        Pill('NEW', 292, cy+28, accent+'33', accent),
      ];
    }),

    // bottom nav
    F(0, 732, 375, 80, surface, { ch:[
      Line(0, 0, 375, { fill:border }),
      ...[['◈','Home',0],['◉','Explore',1],['◎','Create',2],['◻','Profile',3]].map(([icon,label,j]) => {
        const nx = 20 + j * 84;
        return [
          F(nx + 18, 14, 48, 48, j===1?accent+'22':'#00000000', { r:24 }),
          T(icon, nx+22, 20, 40, 24, { size:18, fill:j===1?accent:muted }),
          T(label, nx+8, 46, 68, 14, { size:10, fill:j===1?accent:muted, align:'center', weight:j===1?600:400 }),
        ];
      }).flat(),
    ]}),
  ]});
}

function mobileDetail(ox, P, appName, itemName) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  const title = itemName || 'Item Details';
  return F(ox, 0, 375, 812, bg, { clip: true, ch: [
    T('9:41', 16, 14, 60, 16, { size:12, weight:600, fill:fg }),
    T('●●●●', 295, 14, 70, 16, { size:9, fill:muted }),

    // back nav
    T('← Back', 24, 46, 80, 20, { size:14, fill:muted }),

    // hero visual
    F(0, 76, 375, 200, surface, { ch:[
      E(107, 10, 160, 160, accent+'18', {}),
      E(137, 40, 100, 100, accent+'2a', {}),
      E(162, 65,  50,  50, accent+'55', {}),
      E(174, 77,  26,  26, accent+'cc', {}),
      ...CB(28, 10, 320, 180, accent, 12, 0.45),
    ]}),

    // info section
    T(title, 24, 296, 310, 36, { size:26, weight:800, ls:-0.5, fill:fg }),
    F(24, 338, 44, 3, accent, {}),
    T('Comprehensive information about this item.\nExplore all features and capabilities.', 24, 352, 310, 48, { size:13, fill:muted, lh:22 }),

    // stat row
    ...[['4.8','Rating'],['1.2k','Reviews'],['98%','Match']].flatMap(([v,l],i) => [
      F(24+i*110, 420, 100, 64, surface, { r:8, ch:[] }),
      T(v, 24+i*110, 436, 100, 24, { size:18, weight:700, fill:accent, align:'center' }),
      T(l, 24+i*110, 462, 100, 14, { size:10, fill:muted, align:'center', ls:0.5 }),
    ]),

    // tags
    ...(['Featured','Popular','New'].map((tag,i) => {
      const tx = 24 + i * 88;
      return [
        F(tx, 508, 76, 28, i===0?accent+'33':'#00000000', { r:14, stroke:i>0?fg:undefined, sw:1, opacity:i>0?0.2:1 }),
        T(tag, tx, 515, 76, 14, { size:11, fill:i===0?accent:fg, opacity:i===0?1:0.4, align:'center', weight:i===0?600:400 }),
      ];
    }).flat()),

    // description
    T('Everything you need to know is right here. This item has been carefully curated and reviewed by our team.', 24, 556, 327, 60, { size:13, fill:muted, lh:22 }),

    // action button
    F(24, 716, 327, 52, accent, { r:6, ch:[
      T('Open Now', 0, 14, 327, 22, { size:15, weight:700, fill:bg, align:'center' }),
    ]}),
  ]});
}

function mobileForm(ox, P, appName, screenTitle) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  const formTitle = screenTitle || 'Create New';
  return F(ox, 0, 375, 812, bg, { clip: true, ch: [
    T('9:41', 16, 14, 60, 16, { size:12, weight:600, fill:fg }),
    T('●●●●', 295, 14, 70, 16, { size:9, fill:muted }),

    T('← Back', 24, 46, 80, 20, { size:14, fill:muted }),
    T(formTitle, 24, 76, 320, 32, { size:26, weight:800, fill:fg }),
    T('Fill in the details below', 24, 112, 260, 18, { size:13, fill:muted }),

    // fields
    ...['Title','Description','Category','Tags'].flatMap((field, i) => {
      const fy = 148 + i * 104;
      const fh = i===1 ? 72 : 48;
      return [
        T(field.toUpperCase(), 24, fy, 200, 16, { size:10, weight:600, fill:accent, ls:1.2, opacity:0.8 }),
        F(24, fy+22, 327, fh, surface, { r:8, ch:[] }),
        F(24, fy+22, 327, fh, '#00000000', { r:8, stroke:fg, sw:1, opacity:0.1 }),
        ...(i===0 ? [T('Your title here', 40, fy+36, 280, 18, { size:14, fill:fg, opacity:0.25 })] : []),
      ];
    }),

    // submit
    F(24, 728, 327, 52, accent, { r:6, ch:[
      T('Submit', 0, 14, 327, 22, { size:15, weight:700, fill:bg, align:'center' }),
    ]}),
  ]});
}

function mobileProfile(ox, P, appName) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  return F(ox, 0, 375, 812, bg, { clip: true, ch: [
    T('9:41', 16, 14, 60, 16, { size:12, weight:600, fill:fg }),
    T('●●●●', 295, 14, 70, 16, { size:9, fill:muted }),

    // header bg
    F(0, 0, 375, 220, surface, { ch:[] }),
    Line(0, 220, 375, { fill:border }),

    // avatar
    E(147, 52, 80, 80, accent+'33', {}),
    E(167, 72, 40, 40, accent+'66', {}),
    T('U', 147, 62, 80, 60, { size:28, weight:700, fill:accent, align:'center' }),

    // name & role
    T('User Name', 24, 152, 327, 28, { size:22, weight:700, fill:fg, align:'center' }),
    T('Premium Member', 24, 183, 327, 18, { size:13, fill:accent, align:'center', weight:600 }),

    // stats
    F(24, 240, 327, 80, surface, { r:10, ch:[] }),
    ...[['142','Items'],['38','Saved'],['12','Shared']].flatMap(([v,l],i) => {
      const sx = 24 + i*109;
      return [
        T(v, sx, 258, 109, 28, { size:20, weight:700, fill:fg, align:'center' }),
        T(l,  sx, 288, 109, 16, { size:11, fill:muted, align:'center' }),
        ...(i<2 ? [VLine(24+109*(i+1), 256, 44, { fill:border })] : []),
      ];
    }),

    // menu items
    ...(['Account','Notifications','Privacy','Help','Sign Out'].map((item, i) => {
      const iy = 348 + i * 60;
      return [
        F(24, iy, 327, 52, surface, { r:8 }),
        T(item, 44, iy+16, 240, 20, { size:15, fill: i===4 ? '#cd3a4e' : fg, opacity: i===4 ? 0.8 : 0.7 }),
        T('›', 338, iy+14, 16, 22, { size:20, fill:muted }),
      ];
    }).flat()),
  ]});
}

// ══════════════════════════════════════════════════════════════════════════════
// DESKTOP SCREEN BUILDERS (1440×900)
// All child coordinates are RELATIVE to the screen frame — ox is only used
// for the top-level F() call. Sub-frame children are relative to their parent.
// ══════════════════════════════════════════════════════════════════════════════
const SW = 240; // sidebar width
const DH = 900;

function desktopLanding(ox, P, appName, tagline) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  return F(ox, 0, 1440, DH, bg, { clip: true, ch: [
    // grid bg
    ...Array.from({length:8}, (_,i) => VLine(i*180+90, 0, DH, { fill:border, opacity:0.4 })),
    ...Array.from({length:6}, (_,i) => Line(0, i*150+75, 1440, { fill:border, opacity:0.4 })),

    // nav
    F(0, 0, 1440, 64, bg, { ch:[
      Line(0, 63, 1440, { fill:border }),
      T(appName, 60, 20, 200, 26, { size:18, weight:800, ls:3, fill:fg }),
      ...['Product','Features','Pricing','About'].map((item,i) =>
        T(item, 280+i*110, 22, 90, 20, { size:14, fill:muted })
      ),
      F(1240, 16, 80, 32, '#00000000', { r:6, stroke:fg, sw:1, opacity:0.25, ch:[
        T('Log In', 0, 7, 80, 18, { size:13, fill:muted, align:'center' }),
      ]}),
      F(1332, 16, 80, 32, accent, { r:6, ch:[
        T('Sign Up', 0, 7, 80, 18, { size:13, fill:bg, weight:700, align:'center' }),
      ]}),
    ]}),

    // left hero
    T(tagline, 80, 130, 600, 180, { size:56, weight:900, ls:-2, lh:66, fill:fg }),
    F(80, 318, 56, 4, accent, {}),
    T('The most advanced platform for modern teams.\nBuild, collaborate, and scale with confidence.', 80, 336, 520, 64, { size:16, fill:muted, lh:28 }),
    F(80, 428, 180, 52, accent, { r:8, ch:[
      T('Get Started Free', 0, 14, 180, 22, { size:14, weight:700, fill:bg, align:'center' }),
    ]}),
    F(276, 428, 160, 52, '#00000000', { r:8, stroke:fg, sw:1, opacity:0.25, ch:[
      T('View Demo', 0, 14, 160, 22, { size:14, fill:muted, align:'center' }),
    ]}),

    // right visual
    F(760, 80, 620, 500, accent+'08', { r:16, ch:[] }),
    E(1020, 280, 200, 200, accent+'14', {}),
    E(1060, 320, 120, 120, accent+'22', {}),
    E(1090, 350,  60,  60, accent+'44', {}),
    E(1106, 366,  28,  28, accent+'cc', {}),
    ...CB(772, 88, 596, 484, accent, 16, 0.4),

    // feature section
    T('KEY FEATURES', 80, 620, 200, 16, { size:10, weight:600, fill:accent, ls:2 }),
    ...[
      ['Real-time sync','Instant updates across all devices'],
      ['Advanced analytics','Deep insights into your data'],
      ['Team collaboration','Work together seamlessly'],
      ['API access','Build custom integrations'],
    ].flatMap(([title, desc], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const fx = 80 + col * 660;
      const fy = 652 + row * 88;
      return [
        F(fx, fy, 4, 64, accent, { opacity:0.6 }),
        T(title, fx+16, fy+10, 440, 20, { size:15, weight:600, fill:fg }),
        T(desc,  fx+16, fy+33, 440, 18, { size:13, fill:muted }),
      ];
    }),

    // footer
    F(0, DH-48, 1440, 48, surface, { ch:[
      Line(0, 0, 1440, { fill:border }),
      T(`© 2026 ${appName}  ·  All rights reserved`, 60, 14, 400, 18, { size:12, fill:muted }),
      T('Privacy  ·  Terms  ·  Contact', 1220, 14, 180, 18, { size:12, fill:muted, align:'right' }),
    ]}),
  ]});
}

function desktopDashboard(ox, P, appName, screenTitle) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  return F(ox, 0, 1440, DH, bg, { clip: true, ch: [
    // sidebar
    F(0, 0, SW, DH, surface, { ch:[
      VLine(SW-1, 0, DH, { fill:border }),
      T(appName, 24, 24, 180, 24, { size:16, weight:800, ls:2, fill:fg }),
      Line(0, 64, SW, { fill:border }),
      ...['◈ Overview','◉ Browse','◎ Create','◇ Saved','◻ Settings'].map((item,i) => {
        const active = i===0;
        return [
          ...(active ? [F(0, 82+i*48, 3, 36, accent, {})] : []),
          F(active?12:0, 82+i*48, SW-(active?12:0), 36, active?accent+'14':'#00000000', { r:active?6:0 }),
          T(item, 24, 89+i*48, SW-48, 22, { size:13, fill:active?accent:muted, weight:active?600:400 }),
        ];
      }).flat(),
      Line(0, DH-80, SW, { fill:border }),
      E(24, DH-56, 36, 36, accent+'22', {}),
      T('U', 30, DH-49, 24, 22, { size:12, weight:700, fill:accent, align:'center' }),
      T('Your Account', 68, DH-52, 140, 16, { size:12, fill:fg }),
      T('Free plan', 68, DH-36, 100, 14, { size:10, fill:muted }),
    ]}),

    // top bar
    F(SW, 0, 1440-SW, 64, bg, { ch:[
      Line(0, 63, 1440-SW, { fill:border }),
      T(screenTitle || 'Overview', 32, 20, 400, 26, { size:20, weight:700, fill:fg }),
      T("Here's your summary", 32, 46, 240, 16, { size:12, fill:muted }),
      F(1440-SW-180, 16, 140, 32, accent, { r:6, ch:[
        T('+ New Item', 0, 7, 140, 18, { size:13, fill:bg, weight:700, align:'center' }),
      ]}),
    ]}),

    // stat cards
    ...([
      ['Total Items','1,284','+12%',accent],
      ['Active Now','348','+8%',accent2],
      ['This Week','96','+24%',accent],
      ['Completion','87%','+3%',accent2],
    ].map(([label,value,delta,col], i) => {
      const cw = (1440 - SW - 80 - 3*20) / 4;
      const cx = SW + 32 + i * (cw + 20);
      return F(cx, 80, cw, 104, surface, { r:10, ch:[
        T(label, 20, 20, cw-40, 16, { size:11, fill:muted, ls:0.5 }),
        T(value, 20, 44, cw-40, 32, { size:24, weight:700, fill:fg }),
        Pill(delta, 20, 83, col+'22', col),
      ]});
    })),

    // main chart
    F(SW+32, 204, 720, 300, surface, { r:10, ch:[
      T('Activity', 24, 20, 300, 20, { size:15, weight:600, fill:fg }),
      T('Past 30 days', 24, 44, 300, 16, { size:12, fill:muted }),
      Line(0, 64, 720, { fill:border }),
      // chart bars
      ...Array.from({length:30}, (_,i) => {
        const bh = Math.max(20, Math.round(40 + Math.sin(i*0.7)*30 + Math.cos(i*1.4)*20 + 30));
        return F(24+i*22, 64+200-bh, 14, bh, accent, { r:2, opacity: 0.3 + (i%5===0?0.4:0) });
      }),
    ]}),

    // right panel
    F(SW+32+740, 204, 1440-SW-80-740, 300, surface, { r:10, ch:[
      T('Recent', 20, 20, 200, 20, { size:15, weight:600, fill:fg }),
      Line(0, 48, 1440-SW-80-740, { fill:border }),
      ...Array.from({length:5}, (_,i) => [
        E(20, 64+i*44, 24, 24, accent+'22', {}),
        T(`Activity item ${i+1}`, 54, 64+i*44+2, 240, 18, { size:13, fill:fg }),
        T(`${i+1}h ago`, 54, 64+i*44+22, 240, 14, { size:11, fill:muted }),
        Line(0, 64+i*44+42, 1440-SW-80-740, { fill:border }),
      ]).flat(),
    ]}),

    // recent items table
    F(SW+32, 524, 1440-SW-64, 300, surface, { r:10, ch:[
      T('Recent Items', 24, 20, 300, 20, { size:15, weight:600, fill:fg }),
      Line(0, 48, 1440-SW-64, { fill:border }),
      ...(['Name','Category','Status','Date','Actions'].map((col,i) => {
        const colX = [24, 300, 540, 720, 900];
        return T(col, colX[i]||24+i*200, 58, 180, 16, { size:11, fill:muted, weight:600, ls:0.5 });
      })),
      Line(0, 80, 1440-SW-64, { fill:border }),
      ...Array.from({length:4}, (_,i) => [
        T(`Item ${i+1} Title`, 24, 96+i*48, 260, 18, { size:13, fill:fg }),
        T('Category', 300, 96+i*48, 200, 18, { size:13, fill:muted }),
        Pill(i%2===0?'Active':'Draft', 540, 94+i*48, i%2===0?accent2+'22':muted+'22', i%2===0?accent2:muted),
        T('Mar 14, 2026', 720, 96+i*48, 160, 18, { size:13, fill:muted }),
        T('Edit  ·  View', 900, 96+i*48, 120, 18, { size:13, fill:accent }),
        Line(0, 96+i*48+40, 1440-SW-64, { fill:border }),
      ]).flat(),
    ]}),

    // footer
    F(SW, DH-48, 1440-SW, 48, surface, { ch:[
      Line(0, 0, 1440-SW, { fill:border }),
      T(`${appName} Dashboard  ·  v1.0`, 32, 14, 300, 18, { size:12, fill:muted }),
    ]}),
  ]});
}

function desktopGrid(ox, P, appName, screenTitle) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  return F(ox, 0, 1440, DH, bg, { clip: true, ch: [
    // sidebar
    F(0, 0, SW, DH, surface, { ch:[
      VLine(SW-1, 0, DH, { fill:border }),
      T(appName, 24, 24, 180, 24, { size:16, weight:800, ls:2, fill:fg }),
      Line(0, 64, SW, { fill:border }),
      ...['◈ Overview','◉ Browse','◎ Create','◇ Saved','◻ Settings'].map((item,i) => {
        const active = i===1;
        return [
          ...(active ? [F(0, 82+i*48, 3, 36, accent, {})] : []),
          F(active?12:0, 82+i*48, SW-(active?12:0), 36, active?accent+'14':'#00000000', { r:active?6:0 }),
          T(item, 24, 89+i*48, SW-48, 22, { size:13, fill:active?accent:muted, weight:active?600:400 }),
        ];
      }).flat(),
    ]}),

    // top bar
    F(SW, 0, 1440-SW, 64, bg, { ch:[
      Line(0, 63, 1440-SW, { fill:border }),
      T(screenTitle || 'Browse', 32, 20, 400, 26, { size:20, weight:700, fill:fg }),
      // filters
      ...['All','Recent','Popular','Saved'].map((f,i) => {
        const active = i===0;
        return F(280+i*96, 16, 80, 32, active?accent:surface, { r:16, ch:[
          T(f, 0, 7, 80, 18, { size:13, fill:active?bg:muted, weight:active?600:400, align:'center' }),
        ]});
      }),
      // search
      F(1440-SW-220, 12, 180, 40, surface, { r:20, ch:[
        T('Search...', 20, 11, 140, 18, { size:13, fill:muted }),
      ]}),
    ]}),

    // grid
    ...Array.from({length:9}, (_,i) => {
      const cols = 3;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const iw = Math.floor((1440 - SW - 80 - (cols-1)*20) / cols);
      const ih = Math.floor(iw * 0.75);
      const ix = SW + 32 + col * (iw + 20);
      const iy = 80 + row * (ih + 20);
      return F(ix, iy, iw, ih, surface, { r:10, ch:[
        F(0, 0, iw, ih-60, accent+'08', { r:10 }),
        E(iw/2-40, ih*0.25-20, 80, 80, accent+'1a', {}),
        E(iw/2-25, ih*0.25-5, 50, 50, accent+'2a', {}),
        E(iw/2-12, ih*0.25+8, 24, 24, accent+'55', {}),
        Line(0, ih-60, iw, { fill:border }),
        T(`Item ${i+1}`, 16, ih-48, iw-80, 20, { size:14, weight:600, fill:fg }),
        T('Category', 16, ih-25, 120, 16, { size:11, fill:muted }),
        Pill('New', iw-68, ih-50, accent+'22', accent),
      ]});
    }),

    // footer
    F(SW, DH-48, 1440-SW, 48, surface, { ch:[
      Line(0, 0, 1440-SW, { fill:border }),
      T('9 items  ·  Page 1 of 12', 32, 14, 300, 18, { size:12, fill:muted }),
      F(1440-SW-200, 10, 80, 28, surface, { r:4, stroke:border, sw:1, ch:[T('← Prev', 0, 6, 80, 16, { size:12, fill:muted, align:'center' })] }),
      F(1440-SW-104, 10, 80, 28, surface, { r:4, stroke:border, sw:1, ch:[T('Next →', 0, 6, 80, 16, { size:12, fill:muted, align:'center' })] }),
    ]}),
  ]});
}

function desktopDetail(ox, P, appName, screenTitle) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  const cw = 1440 - SW;
  return F(ox, 0, 1440, DH, bg, { clip: true, ch: [
    // sidebar
    F(0, 0, SW, DH, surface, { ch:[
      VLine(SW-1, 0, DH, { fill:border }),
      T(appName, 24, 24, 180, 24, { size:16, weight:800, ls:2, fill:fg }),
      Line(0, 64, SW, { fill:border }),
      ...['◈ Overview','◉ Browse','◎ Create','◇ Saved','◻ Settings'].map((item,i) => {
        const active = i===1;
        return [
          ...(active ? [F(0, 82+i*48, 3, 36, accent, {})] : []),
          T(item, 24, 89+i*48, SW-48, 22, { size:13, fill:active?accent:muted, weight:active?600:400 }),
        ];
      }).flat(),
    ]}),

    // top bar
    F(SW, 0, cw, 64, bg, { ch:[
      Line(0, 63, cw, { fill:border }),
      T('← Back to Browse', 32, 22, 200, 20, { size:14, fill:muted }),
    ]}),

    // main layout: left hero + right info
    F(SW+32, 80, 600, 440, surface, { r:12, ch:[
      E(200, 80, 200, 200, accent+'14', {}),
      E(230, 110, 140, 140, accent+'22', {}),
      E(258, 138, 84, 84, accent+'44', {}),
      E(272, 152, 56, 56, accent+'77', {}),
      E(284, 164, 32, 32, accent+'cc', {}),
      ...CB(20, 20, 560, 400, accent, 16, 0.4),
      T('Preview', 240, 378, 120, 16, { size:12, fill:muted, align:'center' }),
    ]}),

    // right info panel
    T(screenTitle || 'Item Title', SW+32+620, 80, 720, 40, { size:32, weight:800, ls:-0.5, fill:fg }),
    F(SW+32+620, 128, 48, 4, accent, {}),
    T('Complete description of this item with all the details you need.\nA carefully curated piece for your collection.', SW+32+620, 144, 700, 52, { size:14, fill:muted, lh:26 }),
    F(SW+32+620, 220, 160, 52, accent, { r:8, ch:[
      T('Primary Action', 0, 14, 160, 22, { size:14, weight:700, fill:bg, align:'center' }),
    ]}),
    F(SW+32+620+176, 220, 120, 52, '#00000000', { r:8, stroke:fg, sw:1, opacity:0.2, ch:[
      T('Save', 0, 14, 120, 22, { size:14, fill:muted, align:'center' }),
    ]}),

    // detail table
    F(SW+32+620, 296, 700, 220, surface, { r:8, ch:[
      T('DETAILS', 20, 16, 200, 16, { size:10, fill:muted, weight:600, ls:1.5 }),
      Line(0, 40, 700, { fill:border }),
      ...(['Created','Category','Author','Version','License'].map((k,i) => [
        T(k, 20, 56+i*32, 160, 18, { size:13, fill:muted }),
        T(['Mar 14, 2026','Design','Studio','1.0','Open'][i], 200, 56+i*32, 480, 18, { size:13, fill:fg }),
        ...(i<4?[Line(0, 56+i*32+24, 700, { fill:border })]:[]),
      ]).flat()),
    ]}),

    // related section
    T('RELATED ITEMS', SW+32, 540, 300, 16, { size:10, fill:accent, weight:600, ls:1.5 }),
    ...Array.from({length:4}, (_,i) => {
      const rw = Math.floor((cw-80-3*20)/4);
      const rx = SW+32+i*(rw+20);
      return F(rx, 568, rw, 168, surface, { r:10, ch:[
        F(0, 0, rw, 100, accent+'08', { r:10 }),
        E(rw/2-24, 28, 48, 48, accent+'2a', {}),
        E(rw/2-14, 38, 28, 28, accent+'55', {}),
        Line(0, 100, rw, { fill:border }),
        T(`Related ${i+1}`, 16, 112, rw-32, 20, { size:13, weight:600, fill:fg }),
        T('Category', 16, 135, rw-32, 16, { size:11, fill:muted }),
      ]});
    }),

    // footer
    F(SW, DH-48, cw, 48, surface, { ch:[
      Line(0, 0, cw, { fill:border }),
      T('Item 1 of 48', 32, 14, 200, 18, { size:12, fill:muted }),
      T('← Previous  ·  Next →', cw-200, 14, 180, 18, { size:12, fill:accent, align:'right' }),
    ]}),
  ]});
}

function desktopSettings(ox, P, appName) {
  const { bg, surface, border, muted, fg, accent, accent2 } = P;
  const cw = 1440 - SW;
  return F(ox, 0, 1440, DH, bg, { clip: true, ch: [
    // sidebar
    F(0, 0, SW, DH, surface, { ch:[
      VLine(SW-1, 0, DH, { fill:border }),
      T(appName, 24, 24, 180, 24, { size:16, weight:800, ls:2, fill:fg }),
      Line(0, 64, SW, { fill:border }),
      ...['◈ Overview','◉ Browse','◎ Create','◇ Saved','◻ Settings'].map((item,i) => {
        const active = i===4;
        return [
          ...(active ? [F(0, 82+i*48, 3, 36, accent, {})] : []),
          T(item, 24, 89+i*48, SW-48, 22, { size:13, fill:active?accent:muted, weight:active?600:400 }),
        ];
      }).flat(),
    ]}),

    // top bar
    F(SW, 0, cw, 64, bg, { ch:[
      Line(0, 63, cw, { fill:border }),
      T('Settings', 32, 20, 240, 26, { size:20, weight:700, fill:fg }),
    ]}),

    // profile card
    F(SW+32, 80, cw-64, 120, surface, { r:10, ch:[
      E(24, 28, 64, 64, accent+'22', {}),
      T('U', 32, 32, 48, 52, { size:22, weight:700, fill:accent, align:'center' }),
      T('Your Name', 108, 32, 300, 26, { size:20, weight:700, fill:fg }),
      T('user@example.com', 108, 61, 300, 18, { size:13, fill:muted }),
      F(cw-64-152, 36, 120, 36, accent+'22', { r:6, ch:[
        T('Edit Profile', 0, 8, 120, 20, { size:13, fill:accent, align:'center', weight:600 }),
      ]}),
    ]}),

    // settings columns
    ...[
      { title:'Preferences', y:224, items:['Theme','Language','Timezone','Date Format'], vals:['Dark','English','UTC-8','MM/DD/YYYY'] },
      { title:'Notifications', y:224, items:['Email Alerts','Push Notifications','Weekly Digest','Marketing'], vals:['On','On','Off','Off'], col2:true },
      { title:'Security', y:548, items:['Password','Two-Factor Auth','Active Sessions','API Keys'], vals:['••••••','Enabled','2 devices','View'] },
      { title:'Plan', y:548, items:['Current Plan','Billing Cycle','Next Bill','Usage'], vals:['Free','Monthly','Apr 1, 2026','68%'], col2:true },
    ].flatMap(({ title, y, items, vals, col2 }) => {
      const sx = SW + 32 + (col2 ? (cw-64)/2+20 : 0);
      const sw2 = (cw-64)/2 - 10;
      const totalH = 32 + items.length * 52;
      return [
        T(title.toUpperCase(), sx, y, 240, 16, { size:10, fill:muted, weight:600, ls:1.5 }),
        F(sx, y+24, sw2, totalH, surface, { r:10 }),
        ...items.flatMap((item,i) => {
          const iy = y+24+16+i*52;
          const isToggle = ['Email Alerts','Push Notifications','Weekly Digest','Marketing','Two-Factor Auth'].includes(item);
          const isOn = vals[i] === 'On' || vals[i] === 'Enabled';
          return [
            T(item, sx+20, iy, 300, 20, { size:14, fill:fg, opacity:0.7 }),
            ...(isToggle ? [
              F(sx+sw2-68, iy-2, 48, 24, isOn?accent:surface, { r:12, stroke:isOn?undefined:border, sw:1, ch:[
                E(isOn?26:6, 4, 16, 16, '#ffffff', { opacity:0.9 }),
              ]}),
            ] : [
              T(vals[i], sx+sw2-100, iy, 80, 20, { size:13, fill:muted, align:'right' }),
            ]),
            ...(i<items.length-1 ? [Line(sx+20, y+24+52+i*52, sw2-40, { fill:border })] : []),
          ];
        }),
      ];
    }),

    // footer
    F(SW, DH-48, cw, 48, surface, { ch:[
      Line(0, 0, cw, { fill:border }),
      T(`${appName} v1.0  ·  Build 2026.03`, 32, 14, 300, 18, { size:12, fill:muted }),
      T('Delete Account', cw-160, 14, 140, 18, { size:12, fill:'#cd3a4e', opacity:0.5, align:'right' }),
    ]}),
  ]});
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ══════════════════════════════════════════════════════════════════════════════

const MW = 375, MH = 812;
const DW = 1440;
const MGAP = 60;
const DGAP = 100;
const MSX = i => i * (MW + MGAP);
const DESKTOP_START = 5 * (MW + MGAP) + 200;
const DSX = i => DESKTOP_START + i * (DW + DGAP);

function generateDesign({ prompt, appNameOverride, taglineOverride, screenNamesOverride }) {
  resetId();

  const archetype = detectArchetype(prompt);
  const pal = ARCHETYPES[archetype];
  const appName = appNameOverride || extractAppName(prompt, archetype);
  const tagline = taglineOverride || pal.tagline;

  // Screen names from PRD (5 names map to both mobile + desktop)
  const sn = screenNamesOverride || [];

  const P = {
    bg:      pal.bg,
    surface: pal.surface,
    border:  pal.border,
    muted:   pal.muted,
    fg:      pal.fg,
    accent:  pal.accent,
    accent2: pal.accent2,
  };

  // Mobile screens — sn[0..4] used as screen titles where applicable
  const m0 = mobileHero(MSX(0), P, appName, tagline);
  const m1 = mobileFeed(MSX(1), P, appName, null, sn[1]);
  const m2 = mobileDetail(MSX(2), P, appName, sn[2] || appName + ' Detail');
  const m3 = mobileForm(MSX(3), P, appName, sn[3]);
  const m4 = mobileProfile(MSX(4), P, appName);

  // Desktop screens — sn[0..4] used as section titles
  const d0 = desktopLanding(DSX(0), P, appName, tagline);
  const d1 = desktopDashboard(DSX(1), P, appName, sn[0]);
  const d2 = desktopGrid(DSX(2), P, appName, sn[1]);
  const d3 = desktopDetail(DSX(3), P, appName, sn[2]);
  const d4 = desktopSettings(DSX(4), P, appName);

  const doc = {
    version: '2.8',
    variables: {
      bg:     { type: 'color', value: pal.bg },
      fg:     { type: 'color', value: pal.fg },
      accent: { type: 'color', value: pal.accent },
      muted:  { type: 'color', value: pal.muted },
    },
    children: [m0, m1, m2, m3, m4, d0, d1, d2, d3, d4],
  };

  const meta = {
    archetype,
    appName,
    tagline,
    palette: { bg: pal.bg, fg: pal.fg, accent: pal.accent, accent2: pal.accent2 },
    screens: 10,
  };

  return { doc, meta };
}

module.exports = { generateDesign, detectArchetype, ARCHETYPES };

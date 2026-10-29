#!/usr/bin/env node
/**
 * smoke.mjs — 没有浏览器时的渲染冒烟测试。
 *
 * 用最小 DOM 桩执行 index.html 的内联 JS，断言四个渲染区真的产出了内容，
 * 并验证「运行时同步失败 → 回退内嵌数据」的兜底逻辑不会抛错。
 *
 * 用法：node scripts/smoke.mjs
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = await readFile(join(ROOT, 'index.html'), 'utf8');
const JS = HTML.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
const IDS = [...new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];

const els = new Map();
class El {
  constructor(id) {
    this.id = id; this._html = ''; this._text = ''; this._val = '';
    this.dataset = {}; this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set value(v) { this._val = String(v); }
  get value() { return this._val; }
  addEventListener() {} removeEventListener() {}
  appendChild() {} remove() {} focus() {} select() {} blur() {}
  setAttribute(k, v) { this[k] = v; } getAttribute(k) { return this[k] ?? null; }
  scrollIntoView() {} animate() {} closest() { return null; } matches() { return false; }
  querySelector() { return null; } querySelectorAll() { return []; }
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
}
for (const id of IDS) els.set(id, new El(id));
const get = (id) => els.get(id) ?? (els.set(id, new El(id)), els.get(id));

const timers = [];
const sandbox = {
  console, Intl, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, RegExp, Error, Promise,
  setTimeout: (fn) => (timers.push(fn), 0),
  requestAnimationFrame: (fn) => (timers.push(fn), 0),
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: { _d: new Map(), getItem(k) { return this._d.get(k) ?? null; }, setItem(k, v) { this._d.set(k, v); } },
  location: { hash: '', href: 'file:///index.html' },
  history: { replaceState() {} },
  navigator: { clipboard: { writeText: async () => {} } },
  fetch: async () => { throw new Error('offline'); },
  document: {
    documentElement: { dataset: {} },
    body: { appendChild() {}, removeChild() {} },
    activeElement: { tagName: 'BODY' },
    createElement: () => new El('tmp'),
    addEventListener() {},
    getElementById: (id) => get(id),
    querySelector: (sel) => (sel.startsWith('#') ? get(sel.slice(1)) : null),
    querySelectorAll: () => [],
  },
  window: {
    scrollTo() {},
  },
};
sandbox.globalThis = sandbox;
sandbox.window = { ...sandbox.window, ...{ scrollTo() {} } };

try {
  vm.runInContext(JS, vm.createContext(sandbox), { filename: 'inline.js' });
} catch (e) {
  console.error(`✗ 内联 JS 执行抛错：${e.message}`);
  process.exit(1);
}

for (const fn of timers.splice(0)) {
  try { fn(); } catch (e) { console.error(`✗ 定时器回调抛错：${e.message}`); process.exit(1); }
}
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));

const EXPECT = [
  ['stats', /<div class="stat"><b>/],
  ['top6', /class="card mini"/],
  ['skillGrid', /class="card skill"/],
  ['recipeList', /class="card recipe"/],
  ['recipeNav', /data-recipe-jump/],
  ['matrix', /<table class="mx">/],
  ['fHost', /<option value="/],
  ['count', /^\d+ \/ \d+$/],
];

let bad = 0;
for (const [id, re] of EXPECT) {
  const el = els.get(id);
  const out = el?._html || el?._text || '';
  const pass = re.test(out);
  console.log(`  ${pass ? '✓' : '✗'} #${String(id).padEnd(11)} ${String(out.length).padStart(6)} 字符  ${out.slice(0, 52).replace(/\s+/g, ' ')}`);
  if (!pass) bad++;
}

const grid = els.get('skillGrid')?._html ?? '';
const cards = (grid.match(/class="card skill"/g) || []).length;
console.log(`  · 技能卡片 ${cards} 张，统计块 ${((els.get('stats')?._html ?? '').match(/class="stat"/g) || []).length} 个`);
console.log(`  · 离线兜底：syncDot.state=${els.get('syncDot')?.dataset?.state ?? '(未设置)'}（期望 err）`);
if (els.get('syncDot')?.dataset?.state !== 'err') { console.error('  ✗ 离线时未回退到内嵌数据'); bad++; }
if (cards < 10) { console.error('  ✗ 技能卡片数量异常'); bad++; }

console.log(bad ? `\n✗ 冒烟测试失败：${bad} 项` : '\n✓ 冒烟测试通过');
process.exit(bad ? 1 : 0);

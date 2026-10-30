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
    const self = this;
    this._cls = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => self._cls.add(x)),
      remove: (...c) => c.forEach((x) => self._cls.delete(x)),
      toggle: (c, on) => (on === undefined ? (self._cls.has(c) ? self._cls.delete(c) : self._cls.add(c)) : on ? self._cls.add(c) : self._cls.delete(c)),
      contains: (c) => self._cls.has(c),
    };
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
  querySelector(sel) {
    this._q ??= new Map();
    if (!this._q.has(sel)) this._q.set(sel, new El(sel));
    return this._q.get(sel);
  }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
}
for (const id of IDS) els.set(id, new El(id));
const get = (id) => els.get(id) ?? (els.set(id, new El(id)), els.get(id));

const timers = [];
const docListeners = [];
const sandbox = {
  console, Intl, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, RegExp, Error, Promise,
  URLSearchParams, URL,
  setTimeout: (fn) => (timers.push(fn), 0),
  requestAnimationFrame: (fn) => (timers.push(fn), 0),
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: { _d: new Map(), getItem(k) { return this._d.get(k) ?? null; }, setItem(k, v) { this._d.set(k, v); } },
  location: { hash: '', href: 'file:///index.html' },
  history: {
    replaceState(_state, _title, url) {
      if (typeof url === 'string') sandbox.location.hash = url.startsWith('#') ? url : '#' + url;
    },
  },
  navigator: { clipboard: { writeText: async () => {} } },
  fetch: async () => { throw new Error('offline'); },
  document: {
    documentElement: { dataset: {} },
    body: { appendChild() {}, removeChild() {} },
    activeElement: { tagName: 'BODY' },
    createElement: () => new El('tmp'),
    addEventListener(type, fn) { docListeners.push([type, fn]); },
    getElementById: (id) => get(id),
    querySelector: (sel) => (sel.startsWith('#') ? get(sel.slice(1)) : null),
    querySelectorAll: () => [],
  },
  window: {
    scrollTo() {},
    addEventListener(type, fn) { docListeners.push(['window:' + type, fn]); },
  },
};
sandbox.globalThis = sandbox;
sandbox.window = { ...sandbox.window, scrollTo() {}, addEventListener(type, fn) { docListeners.push(['window:' + type, fn]); } };

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
  ['featGrid', /class="feat/],
  ['featNote', /生成|示意/],
];

let bad = 0;
for (const [id, re] of EXPECT) {
  const el = els.get(id);
  const out = el?._html || el?._text || '';
  const pass = re.test(out);
  console.log(`  ${pass ? '✓' : '✗'} #${String(id).padEnd(11)} ${String(out.length).padStart(6)} 字符  ${out.slice(0, 52).replace(/\s+/g, ' ')}`);
  if (!pass) bad++;
}

// 通过事件委托打开详情抽屉，验证抽屉模板与复制按钮
const firstCard = {
  dataset: { id: 'neka-nat--freecad-mcp' },
  closest: () => firstCard,
};
for (const [type, fn] of docListeners) {
  if (type === 'click') { try { fn({ target: firstCard }); } catch (e) { console.error(`✗ 点击委托抛错：${e.message}`); process.exit(1); } }
}
const drawer = els.get('drawer')?._html ?? '';
const drawerChecks = [
  ['综合分拆解', /综合分拆解/],
  ['评分条', /class="bar"/],
  ['安装命令', /class="io"/],
  ['提示词模板', /提示词模板/],
  ['复制按钮', /class="copy"/],
  ['仓库链接', /https:\/\/github\.com\/neka-nat\/freecad-mcp/],
];
for (const [name, re] of drawerChecks) {
  const pass = re.test(drawer);
  console.log(`  ${pass ? '✓' : '✗'} 抽屉·${String(name).padEnd(10)} ${pass ? '' : '缺失'}`);
  if (!pass) bad++;
}

// URL 状态：抽屉打开后 hash 应带上 skill=<id>
const hashAfterOpen = sandbox.location.hash;
const urlOk = /^#[a-z]+\?.*skill=neka-nat--freecad-mcp/.test(hashAfterOpen);
console.log(`  ${urlOk ? '✓' : '✗'} URL 状态  ${hashAfterOpen || '(空)'}`);
if (!urlOk) bad++;

// 精选：卡片数量、封面是 inline SVG、大图开关
const FEATURED = (await (await import('node:fs/promises')).readFile(join(ROOT, 'data/skills.json'), 'utf8'));
const featData = JSON.parse(FEATURED).featured ?? [];
const featHtml = els.get('featGrid')?._html ?? '';
const featCards = (featHtml.match(/class="feat( lead)?"/g) || []).length;
const svgs = (featHtml.match(/<svg class="art"/g) || []).length;
const featOk = featCards === featData.length && svgs === featData.length;
console.log(`  ${featOk ? '✓' : '✗'} 精选·封面      ${featCards} 张卡片 / ${svgs} 张生成封面（期望 ${featData.length}）`);
if (!featOk) bad++;
const leadOk = /class="feat lead"/.test(featHtml);
console.log(`  ${leadOk ? '✓' : '✗'} 精选·首图      ${leadOk ? '第一张走大卡版式' : '缺少 lead 版式'}`);
if (!leadOk) bad++;
const noteOk = /非仓库截图|生成/.test(els.get('featNote')?._text ?? '');
console.log(`  ${noteOk ? '✓' : '✗'} 精选·免责说明  ${noteOk ? '' : '缺「封面为生成图」说明'}`);
if (!noteOk) bad++;

try {
  sandbox.openArt(0);
  const modal = els.get('artModal');
  const body = modal.querySelector('.am-body')._html;
  const zoomOk = modal.classList.contains('open') && /<svg class="art"/.test(body) && featData[0] && body.includes(featData[0].name);
  console.log(`  ${zoomOk ? '✓' : '✗'} 精选·大图      ${zoomOk ? '点击封面可放大' : '大图未打开'}`);
  if (!zoomOk) bad++;
  for (const [type, fn] of docListeners) if (type === 'keydown') fn({ key: 'Escape', target: { tagName: 'BODY' } });
  const closedOk = !modal.classList.contains('open');
  console.log(`  ${closedOk ? '✓' : '✗'} 精选·Esc 关闭  ${closedOk ? '' : '大图没关上'}`);
  if (!closedOk) bad++;
} catch (e) {
  console.error(`  ✗ 精选·大图      抛错：${e.message}`);
  bad++;
}

/* 维护块：文案与复制按钮都在，且落在首页里 */
const home = HTML.slice(HTML.indexOf('id="maintain"'), HTML.indexOf('id="maintain"') + 7000);
const maintOk = /id="maintain"/.test(home)
  && /refresh\.sh/.test(home)
  && /deploy-pages\.sh/.test(home)
  && /gh-pages/.test(home);
console.log(`  ${maintOk ? '✓' : '✗'} 维护块        ${maintOk ? '检索 / 自检 / 发布三步都在首页' : '维护块缺内容'}`);
if (!maintOk) bad++;

const maintCopies = ((home.match(/class="copy" data-copy=/g) || []).length);
const copiesOk = maintCopies >= 2;
console.log(`  ${copiesOk ? '✓' : '✗'} 维护块·复制   ${maintCopies} 个静态复制按钮（期望 ≥2）`);
if (!copiesOk) bad++;

const grid = els.get('skillGrid')?._html ?? '';
const cards = (grid.match(/class="card skill"/g) || []).length;
console.log(`  · 技能卡片 ${cards} 张，统计块 ${((els.get('stats')?._html ?? '').match(/class="stat"/g) || []).length} 个`);
console.log(`  · 离线兜底：syncDot.state=${els.get('syncDot')?.dataset?.state ?? '(未设置)'}（期望 err）`);
if (els.get('syncDot')?.dataset?.state !== 'err') { console.error('  ✗ 离线时未回退到内嵌数据'); bad++; }
if (cards < 10) { console.error('  ✗ 技能卡片数量异常'); bad++; }

console.log(bad ? `\n✗ 冒烟测试失败：${bad} 项` : '\n✓ 冒烟测试通过');
process.exit(bad ? 1 : 0);

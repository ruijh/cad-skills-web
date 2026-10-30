#!/usr/bin/env node
/**
 * report.mjs — 检索结果的「差集报告」，只读，不改图鉴。
 *
 * 回答两个问题：
 *   1. cache.json 里有、图鉴里还没有的仓库 —— 值得收吗？（补齐来源）
 *   2. 图鉴里有、但已经归档 / 从检索里消失的仓库 —— 该标注还是该下架？
 *
 *   node scripts/report.mjs            # 打印 + 写 data/candidates.json
 *   node scripts/report.mjs --top 30   # 只看前 30 个候选
 *   node scripts/report.mjs --all      # 连「弱相关」也算进候选表
 *
 * 不做自动收录：新增一个仓库要定形态 / 宿主 / 能力，这一步必须人来看。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const p = (f) => path.join(process.cwd(), f);
const readJSON = async (f, fallback) => {
  try { return JSON.parse(await readFile(p(f), 'utf8')); } catch { return fallback; }
};
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const when = (iso) => (iso ?? '').slice(0, 10) || '—';
const days = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? Math.round((Date.now() - t) / 864e5) : null;
};

// 检索式很宽（"cad mcp" 会捞到通用 agent 框架，描述里带一句 "CAD" 也算命中），
// 这里按「有没有点名具体 CAD 软件 / 格式」粗筛：点名的算相关，只说 "CAD" 两个字算弱相关。
const TOOL_RE = /(freecad|openscad|kicad|cadquery|solidworks|fusion ?360|rhino|catia|creo|onshape|solidcraft|opencascade|nurbs|parasolid|\bdwg\b|\bdxf\b|\bstep\b|\bstep(-|\.)?file|\biges\b|\bstl\b|sheet[- ]?metal|\bbim\b|revit|blender[- ]?cad|3d[- ]?model)/i;
const CAD_RE = /\bcad\b/i;
const sorted_by_star = (a, b) => b.stargazers_count - a.stargazers_count;

const topN = (() => {
  const i = process.argv.indexOf('--top');
  const n = i > 0 ? Number(process.argv[i + 1]) : 20;
  return Number.isFinite(n) && n > 0 ? n : 20;
})();

const cache = await readJSON('data/cache.json', null);
if (!cache) {
  console.error('✗ 没有 data/cache.json，先跑 node scripts/build-data.mjs --fetch');
  process.exit(1);
}
const cls = await readJSON('data/classification.json', []);
const skills = (await readJSON('data/skills.json', { skills: [] })).skills ?? [];
const catalog = new Map(cls.map((c) => [c.repo, c]));
const holders = new Map(skills.map((s) => [s.repo, s]));

const known = new Set(cache.map((r) => r.full_name));
const raw = cache.filter((r) => !catalog.has(r.full_name) && !r.fork && !r.archived).sort(sorted_by_star);
const haystack = (r) => `${r.full_name} ${r.description ?? ''} ${(r.topics ?? []).join(' ')}`;
const isRelevant = (r) => TOOL_RE.test(haystack(r)) || CAD_RE.test(r.full_name);
const candidates = raw.filter(isRelevant);
const weak = raw.filter((r) => !isRelevant(r));
const all = process.argv.includes('--all');
const showing = all ? raw : candidates;

const missing = cls
  .filter((c) => !known.has(c.repo))
  .map((c) => c.repo);
const archived = cache
  .filter((r) => catalog.has(r.full_name) && r.archived)
  .map((r) => r.full_name);
const stale = cls
  .map((c) => ({ repo: c.repo, d: days(cache.find((r) => r.full_name === c.repo)?.pushed_at) }))
  .filter((x) => x.d !== null && x.d > 540)
  .sort((a, b) => b.d - a.d);

console.log(`检索快照 ${cache.length} 个仓库 · 图鉴 ${cls.length} 个`);
console.log(`未收录：相关候选 ${candidates.length} 个 · 弱相关 ${weak.length} 个（检索式偏宽，弱相关的多是通用 agent 框架）\n`);

if (showing.length) {
  console.log(`候选（按 star，前 ${Math.min(topN, showing.length)} 个）：`);
  console.log(pad('STARS', 7), pad('LICENSE', 13), pad('PUSHED', 12), 'REPO');
  for (const r of showing.slice(0, topN)) {
    console.log(
      pad(r.stargazers_count, 7),
      pad(r.license ?? '—', 13),
      pad(when(r.pushed_at), 12),
      r.full_name,
    );
    if (r.description) console.log(' '.repeat(7), pad('', 13), pad('', 12), '  ' + r.description.slice(0, 96));
  }
  console.log('\n· 要收的话：把仓库补进 data/classification.json（形式 / 宿主 / 能力），再跑 build-data');
} else {
  console.log('· 没有新候选：检索式覆盖到的仓库都已经在图鉴里了');
}

if (archived.length) {
  console.log(`\n! 已归档（值得在图鉴里标一下「停止维护」）：${archived.join(', ')}`);
}
if (missing.length) {
  console.log(`! 图鉴里有、检索里没抓到（改名 / 删库 / 不在检索式覆盖里）：${missing.join(', ')}`);
}
if (stale.length) {
  console.log(`! 超过 18 个月没 push：${stale.slice(0, 8).map((s) => `${s.repo}(${s.d}d)`).join(', ')}`);
}

const out = {
  generated_at: new Date().toISOString(),
  fetch_requires: 'node scripts/build-data.mjs --fetch（先刷新 cache.json）',
  totals: { cache: cache.length, catalog: cls.length, candidates: candidates.length, weak: weak.length },
  note: 'candidates 是命中 CAD 关键词的；weak 只计数，多半是检索式带出来的通用 agent 项目',
  candidates: candidates.map((r) => ({
    repo: r.full_name,
    stars: r.stargazers_count,
    license: r.license ?? null,
    pushed: when(r.pushed_at),
    days_since_push: days(r.pushed_at),
    lang: r.language ?? null,
    desc: r.description ?? '',
    url: r.html_url,
  })),
  weak_examples: weak.slice(0, 5).map((r) => r.full_name),
  archived_in_catalog: archived,
  missing_from_cache: missing,
  stale_in_catalog: stale.map((s) => ({ repo: s.repo, days_since_push: s.d })),
  featured_repos: (await readJSON('data/featured.json', { items: [] })).items?.map((f) => f.repo) ?? [],
  catalog_size_note: `${holders.size} 个已上图鉴（含 ${archived.length} 个已归档）`,
};
await writeFile(p('data/candidates.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`\n✓ 已写入 data/candidates.json（候选 ${out.candidates.length} 个）`);

#!/usr/bin/env node
/**
 * discover.mjs — 只做检索，不改任何数据。
 *
 * 用途：人工分类（data/classification.json）的输入。跑完把候选仓库按 star 排出来，
 * 再决定哪些进图鉴、各自的形态 / 宿主 / 能力。
 *
 *   node scripts/discover.mjs
 *   node scripts/discover.mjs --query "solidworks mcp"
 *
 * 注意：GitHub Search API 未认证时 10 次/分钟，脚本会对每次请求 sleep 8s。
 */

const DEFAULT_QUERIES = [
  ['cad mcp', 3],
  ['freecad mcp', 1],
  ['cadquery mcp', 1],
  ['openscad mcp', 1],
  ['cad skill', 1],
  ['"claude skill" cad', 1],
  ['"agent skill" cad', 1],
  ['topic:mcp-server cad', 1],
  ['mcp cad in:name,description', 1],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q, page) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`
    + `&sort=stars&order=desc&per_page=10&page=${page}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cad-skills-web-discover' },
  });
  if (!res.ok) {
    console.warn(`  ! ${q} p${page} -> HTTP ${res.status}`);
    return [];
  }
  const json = await res.json();
  return json.items ?? [];
}

async function main() {
  const qIdx = process.argv.indexOf('--query');
  const queries = qIdx > 0 ? [[process.argv[qIdx + 1], 1]] : DEFAULT_QUERIES;

  const seen = new Map();
  for (const [q, pages] of queries) {
    for (let page = 1; page <= pages; page++) {
      const items = await search(q, page);
      for (const it of items) if (!seen.has(it.full_name)) seen.set(it.full_name, it);
      console.log(`· ${q} p${page}: ${items.length} 条（累计 ${seen.size}）`);
      await sleep(8000);
    }
  }

  const rows = [...seen.values()].sort((a, b) => b.stargazers_count - a.stargazers_count);
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(`\n${rows.length} 个候选：\n`);
  console.log(pad('STARS', 7), pad('LICENSE', 14), pad('PUSHED', 12), 'REPO');
  for (const r of rows) {
    console.log(
      pad(r.stargazers_count, 7),
      pad(r.license?.spdx_id ?? '—', 14),
      pad((r.pushed_at ?? '').slice(0, 10), 12),
      r.full_name,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

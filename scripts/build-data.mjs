#!/usr/bin/env node
/**
 * build-data.mjs — 把「GitHub 元数据 + 人工分类 + 接入配方」合成 data/skills.json，
 * 并把同一份数据内嵌进 index.html（所以 index.html 双击也能离线打开）。
 *
 * 用法：
 *   node scripts/build-data.mjs            # 用 data/cache.json（已提交的元数据快照）
 *   node scripts/build-data.mjs --fetch    # 先用 GitHub Search API 刷新 cache.json
 *
 * 依赖：只有 Node 18+ 内置模块，无第三方依赖。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...f) => join(ROOT, ...f);

const QUERIES = [
  ['cad mcp', 3],
  ['freecad mcp', 1],
  ['cadquery mcp', 1],
  ['openscad mcp', 1],
  ['cad skill', 1],
  ['"claude skill" cad', 1],
  ['"agent skill" cad', 1],
  ['topic:mcp-server cad', 1],
  ['mcp cad in:name,description', 1],
  // 宿主缺口专项（这些查询才会捞到 SolidWorks / Fusion / Rhino / Creo 等分家的实现）
  ['solidworks mcp', 1],
  ['fusion 360 mcp', 1],
  ['catia mcp', 1],
  ['rhino mcp', 1],
  ['grasshopper mcp cad', 1],
  ['creo mcp', 1],
  ['solid edge mcp', 1],
  ['cnc mcp cad', 1],
  ['laser cutting mcp', 1],
  ['step file mcp cad', 1],
];

const LICENSE_SCORE = {
  'MIT': 15, 'Apache-2.0': 15, 'BSD-2-Clause': 15, 'BSD-3-Clause': 15,
  'ISC': 15, 'Unlicense': 15, 'MIT-0': 15, '0BSD': 15,
  'MPL-2.0': 10, 'LGPL-2.1': 6, 'LGPL-3.0': 6,
  'GPL-3.0': 4, 'GPL-2.0': 4, 'AGPL-3.0': 4,
};
const LICENSE_SCORE_UNKNOWN = 8;

function licenseScore(spdx) {
  if (!spdx || spdx === 'NOASSERTION') return LICENSE_SCORE_UNKNOWN;
  return LICENSE_SCORE[spdx] ?? 8;
}

function activeScore(pushedAt, now) {
  const days = (now - new Date(pushedAt)) / 86400000;
  if (!Number.isFinite(days)) return 4;
  if (days <= 90) return 15;
  if (days <= 180) return 12;
  if (days <= 365) return 8;
  return 4;
}

function starScore(stars) {
  const v = Math.log10(Math.max(1, stars) + 1) / Math.log10(60001);
  return Math.round(Math.min(1, v) * 450) / 10; // 满分 45，一位小数
}

function tierOf(stars) {
  if (stars >= 5000) return 'S';
  if (stars >= 100) return 'A';
  return 'B';
}

async function fetchCache() {
  // 先读既有快照：--fetch 只更新命中项，不丢掉手工补充的候选（Rhino / Creo 等来自额外检索）
  let prev = [];
  try { prev = JSON.parse(await readFile(p('data/cache.json'), 'utf8')); } catch { /* 首次运行 */ }
  const out = new Map(prev.map((r) => [r.full_name, r]));
  for (const [q, pages] of QUERIES) {
    for (let page = 1; page <= pages; page++) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`
        + `&sort=stars&order=desc&per_page=10&page=${page}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'cad-skills-web-builder',
          // 有 token 时用认证额度（5000/h、搜索 30/min），否则退化到未认证
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
      });
      if (!res.ok) {
        console.warn(`  ! ${q} p${page} -> HTTP ${res.status}（保留旧缓存数据）`);
        continue;
      }
      const json = await res.json();
      for (const it of json.items ?? []) {
        // 已有条目只更新可变字段（star / pushed_at / 许可 / topics），保留其余
        out.set(it.full_name, {
          full_name: it.full_name,
          stargazers_count: it.stargazers_count,
          language: it.language,
          description: it.description,
          html_url: it.html_url,
          pushed_at: it.pushed_at,
          license: it.license?.spdx_id ?? null,
          archived: it.archived,
          fork: it.fork,
          topics: it.topics ?? [],
          open_issues_count: it.open_issues_count,
        });
      }
      console.log(`  · ${q} p${page}: +${json.items?.length ?? 0}`);
      // 未认证搜索 10 次/分钟；有 token 时是 30 次/分钟
      await new Promise((r) => setTimeout(r, process.env.GITHUB_TOKEN ? 2200 : 8000));
    }
  }
  const merged = [...out.values()].sort((a, b) => b.stargazers_count - a.stargazers_count);
  await writeFile(p('data/cache.json'), JSON.stringify(merged, null, 2) + '\n');
  console.log(`cache.json 已更新：${merged.length} 个仓库`);
}

async function main() {
  if (process.argv.includes('--fetch')) await fetchCache();

  const cache = JSON.parse(await readFile(p('data/cache.json'), 'utf8'));
  const classification = JSON.parse(await readFile(p('data/classification.json'), 'utf8'));
  const recipes = JSON.parse(await readFile(p('data/recipes.json'), 'utf8'));
  let audit = {};
  try {
    audit = JSON.parse(await readFile(p('data/audit.json'), 'utf8'));
  } catch {
    console.warn('  ! 未找到 data/audit.json，人工核读一律记为未核');
  }

  const byRepo = new Map(cache.map((r) => [r.full_name, r]));
  const now = Date.now();
  const skills = [];

  for (const c of classification) {
    const meta = byRepo.get(c.repo);
    if (!meta) {
      console.warn(`  ! cache 里没有 ${c.repo}（跳过，或先跑 --fetch）`);
      continue;
    }
    const a = audit[c.repo] ?? null;
    const audited = Boolean(a?.read);
    const caps = c.caps ?? [];
    const score = {
      star: starScore(meta.stargazers_count),
      active: activeScore(meta.pushed_at, now),
      license: licenseScore(meta.license),
      audit: audited ? 10 : 0,
      caps: audited ? Math.round(Math.min(caps.length, 10) * 1.5 * 10) / 10 : 0,
    };
    const total = Math.round((score.star + score.active + score.license + score.audit + score.caps) * 10) / 10;

    skills.push({
      id: c.repo.replace('/', '--').toLowerCase(),
      repo: meta.full_name,
      name: meta.full_name.split('/')[1],
      owner: meta.full_name.split('/')[0],
      url: meta.html_url,
      stars: meta.stargazers_count,
      lang: meta.language ?? '—',
      license: meta.license ?? null,
      pushed: (meta.pushed_at ?? '').slice(0, 10),
      desc: meta.description ?? '',
      note: c.note ?? '',
      form: c.form,
      host: c.host,
      caps,
      tier: tierOf(meta.stargazers_count),
      archived: Boolean(meta.archived),
      topics: meta.topics ?? [],
      audited,
      auditNote: a?.note ?? '',
      install: a?.install ?? '',
      score,
      total,
    });
  }

  skills.sort((x, y) => y.total - x.total || y.stars - x.stars);

  const hosts = [...new Set(skills.map((s) => s.host))].sort((a, b) => a.localeCompare(b, 'zh'));
  const capsAll = [...new Set(skills.flatMap((s) => s.caps))];
  const data = {
    generated_at: new Date().toISOString(),
    source: 'GitHub Search API（未认证），star 为抓取时快照',
    scoring: {
      star: 45, active: 15, license: 15, audit: 10, caps: 15,
      note: 'star 45 · 活跃 15 · 许可 15 · 人工核读 10 · 能力覆盖 15；是公开数据的计算结果，不是实测质量分',
    },
    counts: {
      skills: skills.length,
      stars: skills.reduce((n, s) => n + s.stars, 0),
      audited: skills.filter((s) => s.audited).length,
      hosts: hosts.length,
      recipes: recipes.length,
      tierS: skills.filter((s) => s.tier === 'S').length,
      forms: Object.fromEntries([...new Set(skills.map((s) => s.form))].map((f) => [f, skills.filter((s) => s.form === f).length])),
    },
    facets: { hosts, caps: capsAll, licenses: [...new Set(skills.map((s) => s.license ?? '未标注'))] },
    skills,
    recipes,
  };

  data.repo_url = process.env.CAD_SKILLS_REPO_URL || data.repo_url || '';
  const payload = JSON.stringify(data)
    // 内嵌进 <script> 时不能让数据里出现 </script>
    .replace(/<\//g, '<\\/');
  await writeFile(p('data/skills.json'), JSON.stringify(data, null, 2) + '\n');

  const html = await readFile(p('index.html'), 'utf8');
  const RE = /\/\*__REG_JSON__\*\/[\s\S]*?\/\*__END_REG__\*\//;
  if (!RE.test(html)) throw new Error('index.html 里找不到数据占位符 /*__REG_JSON__*/…/*__END_REG__*/');
  let out = html.replace(RE, '/*__REG_JSON__*/' + payload + '/*__END_REG__*/');
  // 运行时同步的 raw / jsDelivr 地址需要 owner/repo；从 repo_url 推导，推导不出就保留占位符（代码会跳过该源）
  const slug = (data.repo_url || '').match(/github\.com\/([^/]+\/[^/?#]+)/)?.[1];
  if (slug) out = out.replaceAll('REPO_PLACEHOLDER', slug.replace(/\.git$/, ''));
  await writeFile(p('index.html'), out);

  console.log(`✓ ${skills.length} 个 skill · ${recipes.length} 套配方 · 合计 ${data.counts.stars} star`);
  console.log(`✓ 已写入 data/skills.json 并内嵌进 index.html（${(payload.length / 1024).toFixed(1)} KB）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

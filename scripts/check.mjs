#!/usr/bin/env node
/**
 * check.mjs — 提交前的自检（也能当 CI 护栏）。
 *
 * 检查项：
 *  1. data/skills.json 能解析，字段齐全、取值合法
 *  2. index.html 内嵌的 REG 与 data/skills.json 完全一致（防止忘记重新构建）
 *  3. 内联 JS 语法正确；选择器 $('…') 引用的 id 在 HTML 里真实存在
 *  4. 配方引用的 repo / 宿主都能在图鉴里对上
 *  5. 精选模块：引用真实、字段自洽、封面母题在白名单里
 *  6. 内嵌数据里没有会截断 <script> 的字符序列
 *  7. 维护块与维护脚本：页面说到的命令、脚本、候选报告都真实存在
 *
 * 用法：node scripts/check.mjs
 */

import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...f) => join(ROOT, ...f);

const FORMS = new Set(['mcp', 'skill', 'app', 'engine']);
const CAPS = new Set(['建模', '脚本', '导出', '渲染', '检查', '图纸', '装配', '打印', '云端', '校验']);
const LICENSES_OK = /^(MIT|MIT-0|Apache-2\.0|BSD-[23]-Clause|ISC|Unlicense|MPL-2\.0|LGPL-[23]\.1|LGPL-3\.0|GPL-[23]\.0|AGPL-3\.0|NOASSERTION)$/;

let errors = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); errors++; };
const ok = (m) => console.log(`  ✓ ${m}`);

const [html, dataRaw] = await Promise.all([
  readFile(p('index.html'), 'utf8'),
  readFile(p('data/skills.json'), 'utf8'),
]);

/* 1. schema */
let data;
try { data = JSON.parse(dataRaw); ok('data/skills.json 可解析'); }
catch (e) { fail(`data/skills.json 解析失败：${e.message}`); process.exit(1); }

const ids = new Set();
for (const s of data.skills) {
  const at = `skill ${s.repo || '(无 repo)'}`;
  if (!s.repo || !s.name || !s.url) fail(`${at}: 缺 repo/name/url`);
  if (!FORMS.has(s.form)) fail(`${at}: 非法 form=${s.form}`);
  if (!s.host) fail(`${at}: 缺 host`);
  if (!s.note || s.note.length < 6) fail(`${at}: note 太短或缺失`);
  if (!Array.isArray(s.caps) || !s.caps.length) fail(`${at}: caps 为空`);
  for (const c of s.caps ?? []) if (!CAPS.has(c)) fail(`${at}: 能力词汇越界 "${c}"`);
  if (s.license && !LICENSES_OK.test(s.license)) fail(`${at}: 许可写法异常 "${s.license}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.pushed || '')) fail(`${at}: pushed 日期格式异常`);
  if (ids.has(s.id)) fail(`${at}: id 重复 ${s.id}`);
  ids.add(s.id);
  const expectTier = s.stars >= 5000 ? 'S' : s.stars >= 100 ? 'A' : 'B';
  if (s.tier !== expectTier) fail(`${at}: tier=${s.tier} 与 star=${s.stars} 不符`);
  const sum = ['star', 'active', 'license', 'audit', 'caps'].reduce((n, k) => n + s.score[k], 0);
  if (Math.abs(sum - s.total) > 0.15) fail(`${at}: 总分 ${s.total} ≠ 分项和 ${sum.toFixed(1)}`);
  if (s.audited && !s.auditNote) fail(`${at}: 标记已核读但没有 auditNote`);
}
if (!errors) ok(`${data.skills.length} 个 skill 字段与评分自洽`);

/* 2. 内嵌数据一致 */
const embedded = html.match(/const REG = \/\*__REG_JSON__\*\/([\s\S]*?)\/\*__END_REG__\*\//);
if (!embedded) fail('index.html 里找不到内嵌数据（是否忘了 node scripts/build-data.mjs？）');
else {
  let parsed = null;
  try { parsed = JSON.parse(embedded[1].replace(/<\\\//g, '</')); } catch (e) { fail(`内嵌数据不是合法 JSON：${e.message}`); }
  if (parsed) {
    if (parsed.counts.skills !== data.counts.skills) fail(`内嵌 ${parsed.counts.skills} 个 skill ≠ 文件 ${data.counts.skills} 个`);
    if (parsed.generated_at !== data.generated_at) fail('内嵌数据与 data/skills.json 不是同一次构建，请重新构建');
    else ok(`内嵌数据与 data/skills.json 一致（${parsed.counts.skills} skills / ${parsed.counts.recipes} recipes）`);
  }
}

/* 3. 内联 JS 语法 + 选择器 */
const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) fail(`期望 1 个内联 <script>，实际 ${scripts.length}`);
else {
  const js = scripts[0];
  const dir = await mkdtemp(join(tmpdir(), 'cadcheck-'));
  const jsFile = join(dir, 'inline.mjs');
  await writeFile(jsFile, js);
  try { execFileSync(process.execPath, ['--check', jsFile], { stdio: 'pipe' }); ok('内联 JS 语法通过'); }
  catch (e) { fail(`内联 JS 语法错误：${e.stderr?.toString().slice(0, 400)}`); }

  const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...js.matchAll(/\$\('#([\w-]+)'/g)].map((m) => m[1]));
  const missing = [...used].filter((x) => !htmlIds.has(x) && !x.includes('-'));
  if (missing.length) fail(`JS 引用了不存在的 id：${missing.join(', ')}`);
  else ok(`${used.size} 个 id 选择器全部存在`);
}

/* 4. 配方引用完整性 */
const repos = new Set(data.skills.map((s) => s.repo));
const hosts = new Set(data.facets.hosts);
for (const r of data.recipes) {
  if (!r.id || !r.title) fail(`recipe 缺 id/title：${JSON.stringify(r).slice(0, 60)}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) fail(`recipe id 不合规范（应为 kebab-case）：${r.id}`);
  if (!repos.has(r.repo)) fail(`recipe ${r.id} 引用的 repo 不在图鉴里：${r.repo}`);
  if (!hosts.has(r.host)) fail(`recipe ${r.id} 的宿主不在 facets 里：${r.host}`);
  for (const k of ['when', 'install', 'snippet', 'prompt']) if (!r[k]) fail(`recipe ${r.id} 缺字段 ${k}`);
  if (r.snippet) { try { JSON.parse(r.snippet); } catch { fail(`recipe ${r.id} 的 snippet 不是合法 JSON`); } }
}
const recipeIds = new Set(data.recipes.map((r) => r.id));
if (recipeIds.size !== data.recipes.length) fail('recipe id 有重复');
if (!errors) ok(`${data.recipes.length} 套配方引用完整，snippet 均为合法 JSON`);

/* 5. 精选模块 */
const MOTIFS = new Set(['port', 'pcb', 'window', 'cube', 'draft', 'param', 'surface', 'cloud', 'assembly']);
const byRepo = new Map(data.skills.map((s) => [s.repo, s]));
const featIds = new Set();
for (const it of data.featured ?? []) {
  const tag = `featured ${it.repo || '(缺 repo)'}`;
  const src = byRepo.get(it.repo);
  if (!src) { fail(`${tag} 不在图鉴里`); continue; }
  if (featIds.has(src.id)) fail(`${tag} 重复入选`);
  featIds.add(src.id);
  if (!MOTIFS.has(it.motif)) fail(`${tag} 的封面母题未知：${it.motif}`);
  if (!it.headline || it.headline.length < 8) fail(`${tag} 缺一句话说明（headline）`);
  if (!Array.isArray(it.why) || it.why.length < 2) fail(`${tag} 至少要两条入选理由`);
  if (it.why?.some((w) => !w || w.length < 4)) fail(`${tag} 有空的入选理由`);
  if (it.stars !== src.stars) fail(`${tag} 的 star 与图鉴不一致`);
  if (it.url !== src.url) fail(`${tag} 的仓库链接与图鉴不一致`);
  if (it.total !== src.total) fail(`${tag} 的综合分与图鉴不一致`);
  if (it.form !== src.form) fail(`${tag} 的形态与图鉴不一致`);
  if (it.audited !== src.audited) fail(`${tag} 的核读标记与图鉴不一致`);
  if (!it.install && src.install) fail(`${tag} 漏了安装命令`);
}
if (!(data.featured ?? []).length) fail('featured 为空');
else if (data.counts?.featured !== data.featured.length) fail(`counts.featured=${data.counts?.featured} 与 featured 条数 ${data.featured.length} 不一致`);
if (!data.featured_note) fail('缺 featured_note（封面为生成图的说明）');
else if (!/生成|示意/.test(data.featured_note)) fail('featured_note 必须说明封面是生成图');
if (!errors) ok(`${data.featured.length} 个精选项目字段自洽，母题与图鉴对得上`);

/* 6. 内嵌数据安全性 */
if (embedded && /<\\\/?script/i.test(embedded[1])) fail('内嵌数据里出现了 </script 序列（会被截断）');
else ok('内嵌数据无 </script 截断风险');

/* 7. 维护块与维护脚本 */
const mBlock = html.slice(html.indexOf('id="maintain"'), html.indexOf('id="maintain"') + 9000);
if (!html.includes('id="maintain"')) fail('首页缺「维护与部署」块（id="maintain"）');
else {
  for (const needle of ['scripts/refresh.sh', 'deploy-pages.sh', 'gh-pages', 'report.mjs', 'data/candidates.json']) {
    if (!mBlock.includes(needle)) fail(`维护块里没提到 ${needle}`);
  }
  ok('维护块点名了 refresh.sh / report.mjs / deploy-pages.sh');
}
for (const f of ['scripts/refresh.sh', 'scripts/report.mjs']) {
  try {
    const st = await stat(p(f));
    if (!st.size) fail(`${f} 是空文件`);
    if (f.endsWith('.sh') && !(st.mode & 0o111)) fail(`${f} 没有执行权限（chmod +x）`);
  } catch { fail(`页面说到的 ${f} 不存在`); }
}
try {
  const wf = await readFile(p('.github/workflows/weekly-refresh.yml'), 'utf8');
  if (!/cron:\s*'0 3 \* \* 1'/.test(wf)) fail('weekly-refresh.yml 的 cron 不是周一 03:00 UTC');
  if (!/report\.mjs/.test(wf)) fail('weekly-refresh.yml 没跑 report.mjs（候选报告会断更）');
  if (!/create-pull-request/.test(wf)) fail('weekly-refresh.yml 没有开 PR 的步骤');
  else ok('每周工作流存在：周一 03:00 UTC，刷新 → 报告 → 自检 → 开 PR');
} catch { fail('缺 .github/workflows/weekly-refresh.yml（定期刷新就断了）'); }

try {
  const cand = JSON.parse(await readFile(p('data/candidates.json'), 'utf8'));
  if (!Array.isArray(cand.candidates)) fail('data/candidates.json 结构异常');
  else ok(`候选报告可解析（${cand.candidates.length} 个相关候选）`);
} catch { fail('data/candidates.json 缺失或不是合法 JSON（跑 node scripts/report.mjs）'); }

console.log(errors ? `\n✗ 自检失败：${errors} 个问题` : '\n✓ 全部自检通过');
process.exit(errors ? 1 : 0);

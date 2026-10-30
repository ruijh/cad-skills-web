> **状态：已上线** → https://github.com/ruijh/cad-skills-web · 站点 https://ruijh.github.io/cad-skills-web/
> Pages 的源是 `gh-pages` 分支根目录。改完 `main` 必须跑 `./scripts/deploy-pages.sh`，线上的才会变。

# 维护与发布

这份文档只讲两件事：**数据怎么保持新鲜**、**改完怎么上到线上**。两件事都是一条命令。

---

## 一、数据从哪来

页面里的 star、最近 push、许可、是否归档，没有一个是手抄的：

| 文件 | 谁写的 | 说明 |
| --- | --- | --- |
| `data/classification.json` | **人** | 92 个仓库的形态 / 宿主 / 能力 / 一句话点评。新增仓库得手动加。 |
| `data/cache.json` | `build-data.mjs --fetch` | GitHub 检索结果的原始快照（156 个仓库的最新数字）。 |
| `data/skills.json` | `build-data.mjs` | 由上面两份算出综合分、排名、统计，并内嵌回 `index.html`。 |
| `data/candidates.json` | `report.mjs` | 检索到但还没收录的候选、已归档的、半年没动的。 |

所以分工是：**数字由脚本刷，收录由人决定**。脚本不会自己往图鉴里加项目——那需要判断形态和宿主，判断错了整页结论都错。

```bash
GITHUB_TOKEN=xxx ./scripts/refresh.sh     # 检索 → 重建 → 差集报告 → 自检（约 1 分钟）
./scripts/refresh.sh --no-fetch          # 不联网，只用已提交的快照重建
```

`refresh.sh` 跑完会打印候选表（按 star 排）、已归档仓库、超过 18 个月没 push 的仓库，以及这次数据改了多少。**它不提交、不部署**——看完再决定。

### 定期自动跑

`.github/workflows/weekly-refresh.yml`：每周一 03:00 UTC（北京时间 11:00）跑 `build-data.mjs --fetch` → `report.mjs` → 自检，有变化就开 PR 到 `chore/weekly-data-refresh`；也可以在 Actions 页面手动 Run workflow。

注意两点：

- 它只改 `main`。**合并 PR 后仍要 `./scripts/deploy-pages.sh` 才会到线上。**
- 它是 `GITHUB_TOKEN` 开的 PR，不会触发其它工作流；要跑 Pages 部署就得手动镜像分支（见下一节）。

不想等 CI 就本地跑一次 `refresh.sh`，效果一样，只是要人记得。

---

## 二、发布

```
main      ← 你改代码、跑脚本、提交
gh-pages  ← 线上真正服务的内容（Pages 源，分支根目录）
```

改完 `main` 之后：

```bash
./scripts/deploy-pages.sh
# 等价于：git push origin refs/heads/main:refs/heads/gh-pages --force
```

推完 30–60 秒生效，地址 <https://ruijh.github.io/cad-skills-web/>。仓库里有 `.nojekyll`，否则 Jekyll 会吞掉 `_` 开头的文件。

> **最常见的坑**：只 `git push origin main`，以为就发布了。`gh-pages` 没动，线上一个字都不会变，而本地 `file://` 打开又是新的——于是开始怀疑缓存。先确认 `git ls-remote origin gh-pages` 的 SHA 和你 `main` 的一致。

### 网络受限时（`github.com:443` 被挡）

有些环境只放行 `api.github.com`，`git push` 会 `SSL connection timeout` 或 `CONNECT tunnel failed, response 502`。这时用 Git Data API 提交，一个 commit 同时更新两个分支：

```bash
# 1. 取本地 HEAD 的树，和远端 main 的树对比
# 2. 只把差异文件的 blob 通过 POST /repos/<owner>/<repo>/git/trees 内联上传
# 3. POST /git/commits 建 commit，PATCH /git/refs/heads/main（非强推）
# 4. 再 PATCH /git/refs/heads/gh-pages 指向同一个 commit（强推）
```

这需要一枚 `Contents: Read and write` 的 token（`GITHUB_TOKEN=… node /tmp/push-api.py`）。本仓库的「精选」与「维护」两次更新就是这样推上去的。**用完记得撤销 token**——它一旦进过聊天记录或 shell history 就该作废。

---

## 三、发布后自检

- [ ] `git ls-remote origin main gh-pages` 两个分支 SHA 相同
- [ ] 站点首页有：精选 9 张、Top 6、宿主 × 形态、维护块
- [ ] `https://ruijh.github.io/cad-skills-web/data/skills.json` 能打开，`generated_at` 是这次构建的时间
- [ ] 断网打开也是完整页面（数据内嵌在 `index.html` 里）
- [ ] `node scripts/check.mjs` 与 `node scripts/smoke.mjs` 都绿

---

## 四、仓库设置（需要在网页上点，token 权限不够）

- **About**：简介写「CAD × Agent 图鉴：92 个能让 AI 真正干活的 CAD 项目」；Homepage 填站点地址；Topics 建议 `cad` `mcp` `ai-agents` `claude-skills` `freecad` `openscad` `kicad` `awesome-list`。
- **Settings → Pages**：Source 保持 `Deploy from a branch` → `gh-pages` → `/ (root)`。
- **Actions**：`Weekly data refresh` 可手动触发；跑完生成的 PR 需要人工合并再镜像发布。

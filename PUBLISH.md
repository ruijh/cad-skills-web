> **状态：已发布** → https://github.com/ruijh/cad-skills-web · 站点 https://ruijh.github.io/cad-skills-web/
> Pages 用「Deploy from a branch：main / root」；CI 工作流暂放 `docs/ci/`，启用方法见 `docs/ci/README.md`。

# 发布到 GitHub 的三种方式

项目本身已经完整：`git log` 有 4 个提交，`node scripts/check.mjs` 与 `node scripts/smoke.mjs` 全绿。
剩下的只有「推到 GitHub」这一步，它需要凭据。任选一条路：

---

## 方式 A · 给我一枚 PAT（最省事，我全程代做）

1. 打开 <https://github.com/settings/tokens> → **Generate new token**
   - *fine-grained*：Repository access 选 All（或新建后单独授权），权限勾
     **Contents: Read and write**、**Pages: Read and write**、**Administration: Read and write**
   - 或 *classic*：勾 `repo` + `workflow`
2. 把 token 和你的 GitHub 用户名发我，我执行：

```bash
GITHUB_TOKEN=<token> ./scripts/publish.sh <你的用户名> cad-skills-web
```

它会：建公开仓库 → 推 `main` → 开启 Pages（GitHub Actions 源）→ 打印地址。
之后我会把 `repo_url` 写回数据、重新构建、二次提交，并验证 Pages 返回 200。

> token 用完建议在设置里撤销。

---

## 方式 B · 你自己推（不接触任何凭据）

```bash
# 1. 先在网页上建一个空的公开仓库：https://github.com/new  → 名字 cad-skills-web，不要勾 README
cd cad-skills-web
git remote add origin git@github.com:<你的用户名>/cad-skills-web.git   # 或 https://github.com/<你的用户名>/cad-skills-web.git
git push -u origin main
```

然后开 Pages：仓库 → **Settings → Pages → Source 选「GitHub Actions」**，`main` 一推 CI 就跑起来了。

最后记得让页面知道自己的仓库地址（运行时同步要用）：

```bash
CAD_SKILLS_REPO_URL=https://github.com/<你的用户名>/cad-skills-web node scripts/build-data.mjs
git commit -am "chore: 写入仓库地址" && git push
```

README 顶部那行线上链接也顺手替换成 `https://<你的用户名>.github.io/cad-skills-web/`。

---

## 方式 C · 网页上传（不想碰命令行）

1. 解压 `cad-skills-web-publish.zip`（与本文件同级目录）
2. 新建仓库后点 **uploading an existing file**，把解压出的所有文件（含 `.github/`、`.nojekyll`、`data/`、`scripts/`）拖进去
3. Commit → Settings → Pages → Source 选 GitHub Actions

⚠️ 网页上传会把 `.github/workflows/pages.yml` 也带上去，这是开启自动部署的前提，别漏。

---

## 发布后自检清单

- [ ] `https://github.com/<owner>/cad-skills-web` 能打开，README 渲染正常（封面图显示）
- [ ] Actions 里 `Deploy to GitHub Pages` 是绿色
- [ ] `https://<owner>.github.io/cad-skills-web/` 打开后首页有 5 个统计块、Top 6、宿主矩阵
- [ ] 右上角徽章显示「已同步 GitHub 最新数据」（说明运行时 fetch 通了）
- [ ] `data/skills.json` 能直接访问（`https://<owner>.github.io/cad-skills-web/data/skills.json`）

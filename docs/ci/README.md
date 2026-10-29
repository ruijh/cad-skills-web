# CI 工作流（待启用）

`pages.yml` 与 `weekly-refresh.yml` 放在这里、而不是 `.github/workflows/`，是因为创建仓库时用的
fine-grained token 没有 `workflows` 权限，推 `.github/workflows/` 会被 GitHub 拒绝
（`refusing to allow a Personal Access Token to create or update workflow ... without workflow scope`）。

**站点本身不依赖它们**：当前 Pages 用「分支发布」，直接从 `main` 根目录出静态文件。

想启用 CI / 每周数据刷新，二选一：

**A. 给 token 加 workflow 权限**（Repository permissions → Workflows: Read and write），然后：

```bash
mkdir -p .github/workflows
cp docs/ci/pages.yml docs/ci/weekly-refresh.yml .github/workflows/
git add .github/workflows && git commit -m "ci: 启用 Pages 自动部署与每周数据刷新" && git push
```

**B. 在 GitHub 网页上直接建文件**：New file → 路径填 `.github/workflows/pages.yml` → 粘贴本目录同名文件内容，重复一次。

启用 `pages.yml` 后，记得把仓库 Pages 的 Source 从「Deploy from a branch」改成「GitHub Actions」。

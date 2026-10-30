# CI 说明

真正生效的工作流在 [`.github/workflows/weekly-refresh.yml`](../../.github/workflows/weekly-refresh.yml)：
每周一 03:00 UTC 跑一遍 `build-data.mjs --fetch` + `report.mjs` + 自检，数据有变化就开一个 PR 到
`chore/weekly-data-refresh`，由人抽查合并。也可以在 Actions 页面手动 Run workflow 立刻跑一次。

这个目录现在只留这份说明，原因记在这里，免得以后有人重新踩一遍。

## 为什么曾经放在这里

建仓用的 fine-grained token 一开始没有 `Workflows: Read and write`，推 `.github/workflows/` 下任何文件
都会被 GitHub 拒绝（`refusing to allow a Personal Access Token to create or update workflow … without workflow scope`），
所以工作流先寄存在 `docs/ci/`，权限补齐后再 `git mv` 进 `.github/workflows/`。

## 为什么没有 `pages.yml`

站点用「分支发布」：Pages 的源是 `gh-pages` 分支根目录，`./scripts/deploy-pages.sh` 把 `main` 镜像过去。
如果同时放一个 `actions/deploy-pages` 的工作流，它会和分支源打架（Pages 的 Source 只能二选一），
每次 push 都会红一片。所以那个文件已删除；真要切回 Actions 发布，改 Settings → Pages → Source
为 `GitHub Actions`，再用 `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages`
三步写回来，同时去掉 `deploy-pages.sh` 那一步。

## 每周 PR 合并之后

CI 只改 `main`，**不会自动上线**。合并后仍然要跑：

```bash
./scripts/deploy-pages.sh
```

#!/usr/bin/env bash
# refresh.sh — 一条命令跑完「检索 → 重建 → 差集报告 → 自检」，不提交、不部署。
#
#   GITHUB_TOKEN=xxx ./scripts/refresh.sh          # 带 token 抓（5000/h，搜索 30/min，约 1 分钟）
#   ./scripts/refresh.sh                           # 不带 token（搜索 10/min，约 3 分钟）
#   ./scripts/refresh.sh --no-fetch                # 跳过联网，只用已提交的 data/cache.json 重建
#   ./scripts/refresh.sh --offline                 # 同上（别名）
#
# 跑完看两个东西：
#   data/candidates.json  新候选 / 归档 / 超 18 个月没 push 的仓库
#   git diff              这次 star / pushed_at 变了多少
# 满意再提交、镜像 gh-pages（./scripts/deploy-pages.sh）。
set -euo pipefail
cd "$(dirname "$0")/.."

NO_FETCH=0
for a in "$@"; do
  case "$a" in
    --no-fetch|--offline) NO_FETCH=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "未知参数：$a（可用 --no-fetch）" >&2; exit 2 ;;
  esac
done

if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "· 认证抓取：搜索额度 30 次/分钟"
elif [ "$NO_FETCH" = 0 ]; then
  echo "· 未认证抓取：搜索额度 10 次/分钟，9 条检索式大约 3 分钟；设 GITHUB_TOKEN 可提速并避免 403"
fi

start=$(date +%s)

if [ "$NO_FETCH" = 0 ]; then
  echo
  echo "① 检索 GitHub（刷新 data/cache.json）"
  node scripts/build-data.mjs --fetch
else
  echo
  echo "① 跳过检索（--no-fetch），用现有 data/cache.json"
  node scripts/build-data.mjs
fi

echo
echo "② 差集报告（谁还没收录 / 谁归档了 / 谁半年没动）"
node scripts/report.mjs | sed 's/^/   /'

echo
echo "③ 自检"
node scripts/check.mjs
node scripts/smoke.mjs

echo
echo "④ 改动一览"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git status --short | sed 's/^/   /' || true
  n=$(git status --porcelain | wc -l | tr -d ' ')
  if [ "$n" = 0 ]; then
    echo "   数据没有变化（star 快照可能本来就没动）"
  else
    echo
    echo "   提交 → 部署："
    echo "     git add -A && git commit -m 'chore(data): 定期刷新 star / 活跃度快照'"
    echo "     ./scripts/deploy-pages.sh     # 把 main 镜像到 gh-pages，Pages 才会更新"
  fi
fi

echo
echo "✓ 完成，用时 $(( $(date +%s) - start ))s"

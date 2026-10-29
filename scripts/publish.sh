#!/usr/bin/env bash
# publish.sh — 一键把本仓库发布到 GitHub 并开启 Pages（需要一枚有 repo 权限的 token）
#
# 用法：
#   GITHUB_TOKEN=ghp_xxx ./scripts/publish.sh <owner> [repo-name] [--private]
#
# owner  : 你的 GitHub 用户名或组织
# repo   : 默认 cad-skills-web
# 私有   : 加 --private（注意：私有仓库的 Pages 需要付费计划，通常用公开）
#
# 做四件事：建仓库 → 推 main → 开 Pages（GitHub Actions 源）→ 打印地址
set -euo pipefail

OWNER="${1:?用法: GITHUB_TOKEN=... ./scripts/publish.sh <owner> [repo] [--private]}"
REPO="${2:-cad-skills-web}"
VISIBILITY="public"
[[ "${3:-}" == "--private" ]] && VISIBILITY="private"
: "${GITHUB_TOKEN:?请先设置 GITHUB_TOKEN（需要 repo 权限；fine-grained 勾 Contents=Read/Write、Pages=Read/Write、Administration=Read/Write）}"

API="https://api.github.com"
auth=(-H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json")
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ 1/4 自检"
( cd "$ROOT" && node scripts/check.mjs >/dev/null && node scripts/smoke.mjs >/dev/null ) && echo "   ✓ check + smoke 通过"

echo "→ 2/4 创建仓库 ${OWNER}/${REPO}（${VISIBILITY}）"
if [[ "$OWNER" == "$(curl -s "${auth[@]}" "$API/user" | jq -r .login)" ]]; then
  CREATE_EP="$API/user/repos"
else
  CREATE_EP="$API/orgs/${OWNER}/repos"
fi
code=$(curl -s -o /tmp/repo-create.json -w '%{http_code}' "${auth[@]}" -X POST "$CREATE_EP" \
  -d "{\"name\":\"${REPO}\",\"private\":$([ "$VISIBILITY" = private ] && echo true || echo false),\"description\":\"CAD × Agent 图鉴：66 个 MCP server / SKILL.md / 自带 MCP 的 CAD 应用，按路线、宿主、许可、能力对比，附 16 套接入配方\",\"has_issues\":true,\"has_wiki\":false}")
case "$code" in
  201) echo "   ✓ 已创建" ;;
  422) echo "   · 仓库已存在，直接推" ;;
  *)   echo "   ✗ 创建失败 HTTP $code: $(jq -r '.message // .' /tmp/repo-create.json 2>/dev/null)"; exit 1 ;;
esac

echo "→ 3/4 推送 main"
cd "$ROOT"
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${OWNER}/${REPO}.git"
git push -u origin main --quiet && echo "   ✓ 已推送 $(git rev-parse --short HEAD)"

echo "→ 4/4 开启 GitHub Pages（GitHub Actions 源）"
curl -s -o /dev/null -w "   pages 配置 HTTP %{http_code}\n" "${auth[@]}" -X POST "$API/repos/${OWNER}/${REPO}/pages" \
  -d '{"build_type":"workflow"}' || true

cat <<EOF

完成。
  仓库   https://github.com/${OWNER}/${REPO}
  Pages  https://${OWNER}.github.io/${REPO}/   （首次部署约 1 分钟，看 Actions 页）
  设置页 https://github.com/${OWNER}/${REPO}/settings/pages

提醒：
  · 运行时同步要在 data 里写死仓库地址：
      CAD_SKILLS_REPO_URL=https://github.com/${OWNER}/${REPO} node scripts/build-data.mjs
  · README 顶部的线上链接记得替换成真实 Pages 地址
EOF

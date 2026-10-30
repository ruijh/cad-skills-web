#!/usr/bin/env bash
# 把 main 的当前内容镜像到 gh-pages 分支 —— GitHub Pages 目前从 gh-pages 根目录发布。
# 站点是纯静态文件，不需要构建；推完约 30~60 秒生效。
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH=${1:-main}
echo "→ 将 $BRANCH 的 HEAD 镜像到 gh-pages"
git push origin "refs/heads/$BRANCH:refs/heads/gh-pages" --force
echo "✓ 已推送，等 Pages 重建后访问 https://ruijh.github.io/cad-skills-web/"
echo "  查状态: curl -s https://api.github.com/repos/ruijh/cad-skills-web/pages | grep -E '\"status\"|html_url'"

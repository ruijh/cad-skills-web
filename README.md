# CAD Skills 图鉴 · cad-skills-web

**在线访问**：https://ruijh.github.io/cad-skills-web/ · **仓库**：https://github.com/ruijh/cad-skills-web

![CAD Skills 图鉴](assets/cover.svg)

> 收录 GitHub 上**能让 AI Agent 真正干活的 CAD 项目**——MCP server、`SKILL.md` 技能包、以及自带 MCP 的 CAD 应用。
> 纯静态单页，无框架无构建依赖，数据来源与评分口径全部公开。

🔗 线上：[`https://<your-name>.github.io/cad-skills-web/`](https://github.com/)（部署后替换）

---

## 这是什么

CAD 圈子里的「AI 集成」在 2025–2026 突然长出了一大片：FreeCAD 有六七个 MCP server、OpenSCAD 有五个同名仓库、
AutoCAD / SolidWorks / Fusion / Onshape / Inventor / KiCad 各有一套桌面自动化，还有一堆 `SKILL.md` 技能包。
问题是**它们都叫差不多的名字，却解决完全不同的问题**。

这个图鉴做的事就一件：把 92 个收录项摆到同一张表上，按真正决定成败的维度对比——

| 维度 | 为什么重要 |
|---|---|
| **路线**（MCP / Code / App / Skill） | 决定 AI 是「去操作别人的软件」还是「自己产出可编辑模型」，走错方向后面全白费 |
| **宿主软件** | FreeCAD / OpenSCAD / CadQuery / AutoCAD / SolidWorks / Fusion / Onshape / Inventor / SketchUp / Rhino / Grasshopper / Creo / Solid Edge / CATIA / KiCad / Revit… 26 个宿主，换宿主 = 换技能栈 |
| **许可** | 商用与闭源场景，AGPL 和 MIT 是两个世界 |
| **能力** | 建模 / 脚本 / 导出 / 渲染 / 检查 / 图纸 / 装配 / 打印 / 云端 / 校验 |
| **最近活跃** | 这个领域三个月不动基本等于弃坑 |
| **是否人工核读** | star 和描述都会骗人，只有 README 不会 |

## 功能一览

| 区块 | 内容 |
|---|---|
| 首页 · Hero | 收录数 / 合计 star / 人工核读数 / 宿主数 / 配方数，胶囊直达筛选 |
| 首页 · 路线问题 | MCP 路线 vs Code 路线 的对比与代价，四步决策树 |
| 首页 · Top 6 | 综合分前六，点开看拆解 |
| 首页 · 宿主 × 形态矩阵 | 哪个 CAD 软件已有哪种接法，一格一数字，点格直接筛选 |
| 技能页 | 形态 / 宿主 / 能力 / 许可四维筛选 + 文本搜索 + 四种排序；卡片带评分环、能力点阵、核读标记 |
| 详情抽屉 | 综合分逐项拆解、档案（star / 许可 / 最近 push / 核读结论）、安装命令、可复制的提示词模板 |
| 配方库 | 18 套「宿主 ID」接入配方：安装命令 + 客户端配置片段 + 提示词模板，一键复制 |
| 命令面板 | `Ctrl/⌘ K` 或 `/`：搜 skill、搜宿主 ID、跳页面、切主题、清筛选 |
| 深浅双主题 | `T` 键 / 顶栏按钮切换，写入 `localStorage`，默认跟随系统 |
| 运行时同步 | 页面加载后尝试从 GitHub 拉最新 `data/skills.json`，失败静默回退内嵌数据 |

## 直接打开

```bash
# 方式一：任意静态服务器
python -m http.server 8642
# 浏览器打开 http://localhost:8642

# 方式二：双击 index.html —— 数据已内嵌，file:// 也能跑
```

## 数据与构建

```bash
node scripts/data/../build-data.mjs           # 用已提交的 data/cache.json 重新生成
node scripts/build-data.mjs --fetch           # 先用 GitHub Search API 刷新 cache.json（未认证，10 次/分钟）
```

产物：`data/skills.json`（供运行时同步）+ 同一份数据内嵌进 `index.html`。

```
cad-skills-web/
├── index.html                # 单页应用（数据内嵌，无外部依赖）
├── data/
│   ├── cache.json            # GitHub 元数据快照（star / 许可 / pushed_at / topics）
│   ├── classification.json   # 人工分类：形态 / 宿主 / 能力 / 中文说明
│   ├── audit.json            # 人工核读记录：README 里核对到的事实 + 真实安装命令
│   ├── recipes.json          # 16 套接入配方（宿主 ID）
│   └── skills.json           # 构建产物
└── scripts/
    ├── build-data.mjs        # 合并 + 评分 + 内嵌（幂等，可重复跑）
    ├── discover.mjs          # 只跑检索、打印候选仓库（人工分类的输入）
    ├── check.mjs             # 提交前自检：schema / 内嵌一致 / 选择器 / 引用完整性
    └── smoke.mjs             # 无浏览器时的渲染冒烟测试（最小 DOM 桩）
```

### 自检

```bash
node scripts/check.mjs     # 7 项静态检查：字段合法性、内嵌一致性、JS 语法、25 个 id 选择器、配方引用、截断风险
node scripts/smoke.mjs     # 用最小 DOM 桩真跑一遍内联 JS：七大渲染区有内容、详情抽屉模板完整、离线兜底生效
```

### 综合分口径（非官方、非实测）

总分 100，抽屉里逐项展开：

| 分项 | 满分 | 依据 |
|---|---:|---|
| star 热度 | 45 | `log10(stars+1)` 对数归一，60k 封顶 |
| 近期活跃 | 15 | `pushed_at`：≤90 天 15 / ≤180 天 12 / ≤1 年 8 / 更久 4 |
| 许可友好 | 15 | MIT / Apache / BSD / ISC / Unlicense 15 · 其他 10 · 未标注 8 · LGPL 6 · GPL/AGPL 4 |
| 人工核读 | 10 | 逐仓库读过 README 并核对过能力与安装路径得 10，否则 0 |
| 能力覆盖 | 15 | 已核读项目的能力标签数 / 10 × 15（未核读记 0） |

> star 衡量关注度，不是质量。Tier 口径：S = 5k+ star，A = 100–5k，B = <100。

## 诚实的局限

- 本页**没有逐个实跑任何 server**。安装命令与配置片段来自各仓库 README，属于「形态示例」，请以 README 为准。
- 能力矩阵读自 README / description：未核读的 62 个项目只按描述归类，可能不准；`未提及` 不等于不支持。
- star 与活跃度是 GitHub Search API 的快照（未认证抓取），项目会改名、归档、停更。
- 同名仓库极多（`openscad-mcp` 5 个、`freecad-mcp` 6 个、`cadquery-mcp` 4 个），收录时按 star + 是否 headless + 是否有真实安装路径筛过一轮，但遗漏不可避免。

## 参与贡献

发现漏收、错标、或某个 README 已经更新（尤其是安装命令）——欢迎开 issue 或 PR：

1. 改 `data/classification.json`（分类与说明）或 `data/audit.json`（核读结论与安装命令）；
2. 跑 `node scripts/build-data.mjs`；
3. 提交 `data/` 与 `index.html` 的改动。

如果要新增仓库：先跑 `node scripts/build-data.mjs --fetch` 把它拉进 `data/cache.json`，再加分类。

## 许可

- 代码（`index.html`、`scripts/`、工作流）：**Apache-2.0**（见 `LICENSE`）
- 数据（`data/*.json`）：**CC BY 4.0**
- 各项目名称、描述与商标归其各自所有者

> 收录的各仓库许可各不相同（MIT / Apache / GPL / AGPL 已在图鉴里标注），引用与二次分发请分别遵循其协议。

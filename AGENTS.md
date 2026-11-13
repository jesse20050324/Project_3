# AGENTS.md — 项目交接手册（新会话先读这个）

> 本文件是项目唯一入口：新窗口打开本仓库，读完这里就能接着干活。
> 每次大的改动落地后，请更新「当前状态」一节再收尾。
> 最后更新：2026-11-13（v0.7.0 终端 UI 正式版）

## 项目是什么（30秒）

**游戏名：He said, she said**（宏观定稿见 `script/outline.md`；旧称「双线」只用于外部 UI 模板文件名 `双线UI-最终版.html`，不再作为游戏名）。

网页文字冒险游戏（React 19 + Vite 6 + TypeScript + js-yaml，无后端）。玩家扮演一个 AI 助手，**同时出现在男生、女生两部手机里**（左右双聊天窗，对话互相隔离）。玩家不能自由输入，只能选一条 AI 内心的想法，AI 把对应回复说出口。主题：恋爱初期的滤镜=投射，熟悉后滤镜褪去；玩家引导两人「认识到真实对方」或「外归因指责对方变了」，游戏不评判。用途：游戏设计留学作品集。push main 自动部署 GitHub Pages。

**可玩章节为 CH1、3、4、5、6、7、8**，CH2 已并入 CH3。叙事对外分四幕：认识至加微信、加微信至确认关系、交往至纪念日冲突前、纪念日冲突及结局。实现层继续沿用原章号和拍号。

## 只读红线（最重要）

- `script/**`（`ch3.yaml`、`ch4.yaml`、`ch5.yaml`、`设计流程.md`、`outline.md`、`feishu/*.mmd`、`feishu/build.mjs`）与用户审过的飞书 MMD **一律只读**。给玩家/用户看的定稿绝对不能改。
- 外部 UI 模板 `C:/Users/86181/WorkBuddy/2026-10-21-23-29-43/双线UI/*` 同样只读。
- 可改的是实现层：`content/`、`src/`、`tools/`、`docs/`、本文件、`.learnings/`、工作区引导层。
- 第五章的正文原句从剧本源**单向生成**到实现层，不许在 `content/chapter-05.yaml` 里手改台词；要改正文只能先改定稿源并重新走审稿流程。

## 文件地图（想细看去哪）

| 文件/目录 | 作用 | 状态 |
|---|---|---|
| AGENTS.md | 本手册，唯一入口 | 持续维护 |
| docs/引擎实现说明.md | **实现层唯一说明**：生成器、字段契约、三类时序、节拍调参、章状态机、验证命令 | 现行 |
| docs/设计方法论.md | 两条主线矛盾、四要素模型、记忆系统完整论证（给辅导老师看的也是它） | 定稿 |
| docs/记忆系统实现方案.md | 记忆系统 MVP 数据模型＋播控体验 | 现行 |
| docs/界面设计背景.md | v0.4–0.5 界面背景与模板取舍 | 历史参考 |
| script/ch3.yaml、ch4.yaml、ch5.yaml | 历史审定源；第五章当前上线稿见 `docs/剧本审稿/第五幕-上线定稿.yaml` | 只读 |
| script/设计流程.md | 剧本设计规程：时间轴先行五阶段＋自查三轮 | 现行 |
| script/outline.md | 宏观层：主题/结构定律/矛盾引擎/记忆矩阵体系/幕8两拍/两种终局 | 现行 |
| script/feishu/*.mmd | 飞书画板可视化（用户主要审稿界面），由 build.mjs 生成 | 只读生成物 |
| script/feishu/build.mjs | yaml → 飞书 mmd 构建器（含时间轴图生成） | 只读 |
| tools/build-chapter.mjs | **单向生成器**：第五幕上线定稿 + overlay → `content/chapter-05.yaml`；`--check` 做漂移校验 | 现行 |
| tools/ch5-timing.yaml | **实现层 overlay**：全局拍序、区间门、逐消息节拍、入场旗标、教学记忆收口、终局声明。调参只动这里 | 现行 |
| content/chapter-01、03、04.yaml | 旧章引擎格式（手写，幕号 2 空缺） | 现行 |
| content/chapter-05 至 08.yaml | **生成物**，不要手改。分别由 `build-chapter.mjs`、`build-later-chapters.mjs`、`build-chapter-08.mjs` 生成 | 现行 |
| content/GAPS.md | 早期缺口记录 | **已完全过时**，仅考古 |
| src/engine/timeline.ts | **时序唯一真相**：排序键、时间档、区间门状态、对侧进度；运行时与穷举仿真共用 | 现行 |
| src/engine/scheduler.ts | 纯状态机：全局裁决下一拍、严格等待门、区间放行、终局、持久化章切换 | 现行 |
| src/engine/simulate.ts | 无 React 的穷举仿真：可达性、无死锁、无区间越界、终局可达 | 现行 |
| src/engine/loadScript.ts | 严格解析 YAML（未知字段直接报错）、预建 `beatById`/`orderedBeats`、三层节拍解析 | 现行 |
| src/engine/validate.ts | 启动校验：时间轴、区间端点、终局、节拍数值、记忆候选、孤立拍 | 现行 |
| src/engine/reducer.ts、storage.ts | v2 存档：显式 `chapter`/`ritual`/`endings`/`runId`，旧 v1 档提示后重置 | 现行 |
| src/presentation.ts | 具名节拍预设（极快/快/正常/慢/长停顿）＋ `resolveTiming` 三层解析 | 现行 |
| src/Game.tsx、src/components/、src/index.css | 参考稿重做的 1440×920 固定画布、双栏、三态输入卡、内联 SVG/头像 | 现行 |
| src/**/*.test.* | 全量测试（含仿真、防漂移、v2 存档、节拍解析） | 全绿 |
| .learnings/ | AI 协作纠错记录（LRN-001~017、ERR-001~005） | 本地保留 |

> **v0.4.1 废案结论**：`#map` 结构/时序调试页面、游戏内调试条、顶栏「结构」「调试」入口与速度倍率按钮**已全部删除**，界面上不再有任何调试类 UI。节奏快慢只通过 `src/presentation.ts` 预设与 `tools/ch5-timing.yaml` overlay 调整。不要再往项目里加回结构图、状态面板或调速控件。

## 核心设定速览（细节看 docs/设计方法论.md）

- **两条主线矛盾（定稿）**：男生=焦虑型「过近」，真实=焦虑、想确认；她前期读作「他很有爱」，后期读作「烦人、控制欲强」。女生=回避型「过远」，真实=恐惧深层关系；他前期读作「独立、开朗」，后期读作「冷漠」。
- **记忆系统世界观**：AI 聊天记录阅后即焚，玩家手动存的高亮记忆才留得住；记忆池**分窗**，绝不跨窗。已实现效果为置灰硬门（CH1–CH4 教学闭环）＋幕5 入场清空教学记忆。第六、七幕的记忆选项由玩家选择，持有记忆仅解锁对应选项，普通选项一直可选。
- **教学闭环（CH1–4，已可玩）**：女窗 CH1 R1 存「店的位置」→ CH3 问路置灰门；男窗 CH3 存「我妹的同桌」→ CH4 表妹路线置灰门。进第五章时由 overlay 的 `清空教学记忆` 收口。
- **合法跨线**：AI 永不跨窗引用；角色面对面说的话可经对方转述入对方窗。
- **记忆矩阵体系（2026-11-07 定稿）**：每窗 2×2＝Ta的真实／对Ta的美化／自己的真实／自我的美化；第五至第七幕每窗共 7 条候选（4 条矩阵记忆＋3 条日常用途记忆），各 5 槽。已存记忆可舍弃或替换，使用后保留。判定挂 8·二。终局跟玩家选项走：道歉流或 game over。**结构定律：矩阵4格×槽位有限×产出使用频率要稳→故事线不能拉长。**
- **双窗播出与章间重置**：`playbackStep()` 按 `timeline.ts` 的全局排序键选可播拍。两窗可在不违反严格等待、区间及时间档的前提下并行播出；对窗正在输出时仍可选本窗已显示的想法。章间「上下文重置中」仪式与章号、终局、错误一起进 `EngineState` 与 v2 存档，刷新后可恢复，不再依赖 React 局部 state 与 setTimeout。

## 剧本格式八条铁律（全文见 script/ch3.yaml / ch5.yaml 文件头）

1. ①用户消息=角色原话（口述原文不许改）；②AI思考=DeepSeek式自言自语、客观平静的机器感，两三句30~40字；③选项=短语、AI自言自语态度（去掉「我要」）；④AI回复=像人但带AI味、可偶尔好玩，一两句。
2. 编号：子拍分段 x.y.z；分叉补 A/B/C，单线递增。
3. 记忆候选 `{缩略标签, 短句, 类型, 线}`：**短句必须一字不差出现在本拍台词或回复里**——validate 启动时机器校验，写错游戏直接拒载。
4. 置灰门：选项写 `需记忆: 标签`；跨线严格先后写 `等待: 对侧编号`；旗标用 set。
5. **AI思考窗口隔离**：AI只基于本窗可见信息推理，不得断言另一窗事实、不得对玩家喊话、不得用设计层词汇。
6. **真分叉**：两个选项不得直连同一个下一节点；必须分出到各自独立分支拍（各有完整①②③④），1-2拍后收回主线；汇合拍①须兼容所有前情。
7. **时序先行**：写任何一章前先过 `script/设计流程.md` 五个 Phase。yaml 必须含顶层 `时间轴`＋每拍 `时间`（与轴条目一字不差）；跨窗约束三类（严格等待／范围包含／同段自由）先在时间轴上设计死；共享事件登记在文件头，两窗引用一字不差；等待门指向共享拍。
8. **引用溯源**：①里角色引用/复述的任何话必须能在本窗此前①或④找到原文；③选项文字角色看不到，版本名等设计层词出现在①里即为穿帮。

> 铁律是**剧本侧**约束。实现层如何表达「范围包含／逐句快慢／章节切换」见 `docs/引擎实现说明.md`，不受旧引擎写法限制。

## 工作流

- **改剧本（剧本轮）**：过 `script/设计流程.md` 五个 Phase → 改 `script/ch*.yaml` → `node script/feishu/build.mjs` 出细图＋时间轴图 → 用户贴飞书审 → 认可的内容才同步进 `script/outline.md`。**飞书 mmd 是生成物，不要手改。**
- **迁可玩（实现轮）**：第五章走 `node tools/build-chapter.mjs`（读定稿源＋overlay，重出 `content/chapter-05.yaml`）→ `node tools/build-chapter.mjs --check` 确认无漂移 → `npx vitest run`（含 `scriptSync.test.ts` 逐拍比对）→ `npx tsc --noEmit` → `npm run build`。旧章仍手写 `content/chapter-0N.yaml` 并在 `loadScript.ts` 注册。
- **调节奏**：整体改 `src/presentation.ts` 的 `PACING`；单拍/单句改 `tools/ch5-timing.yaml` 的 `节拍` 三张表；改时序改 `拍序`／`区间`。改完必须重跑生成器与 `--check`。**界面上没有调速控件，也不再加回。**
- **协作纪律**：每次交付 bump `package.json` 的 version。经确认的项目实现改动，验证通过后默认提交并推送到 GitHub。普通讨论、试写和未确认提案不发布。发散想法先口头提，点头才落文件；机制不提前发明；记忆候选必须是角色说的话；未声明的 YAML 字段会被 `loadScript` 直接报错，不许靠静默丢弃糊过去。
- **纠错纪律**：结构性问题的根因与修法追加到 `.learnings/LEARNINGS.md` / `ERRORS.md`，并同步本文件、`README.md` 与 `docs/`，避免别人读旧文件误判状态。

## 命令速查

```bash
npm run dev                          # http://localhost:43123 试玩
node tools/build-chapter.mjs         # 重出第五章实现层 YAML
node tools/build-chapter.mjs --check # 校验定稿源与实现层是否漂移
node tools/build-later-chapters.mjs --check
node tools/build-chapter-08.mjs --check
npx vitest run                       # 全量测试（含全路径穷举仿真）
npx tsc --noEmit
npm run build
node script/feishu/build.mjs         # 重生成全部飞书图（剧本轮）
```

线上：`jesse20050324.github.io/Project_3`；游戏内「重新开始」清存档。

## 当前状态（正式版 v0.7.0；独立试玩 v0.6.7）

终端版 v0.7.1 按九段为双窗独立清屏和归档，段内保留聊天并用时间分割线提示跳时。源码推送到 Project_3，正式试玩成品发布到作品集仓库的 he-said-she-said/play/。

v0.7.0 以终端试玩版为界面基准，接入已确认的第 1、3、4 章修订、`3489b98` 的第 5 章上线稿、正式站已有的第 6、7、8 章（第 8 章基线 `c7d8934`）。顶栏显示游戏名，右栏归档用会话名，四幕叙事结构见 [讨论进度](docs/剧本审稿/讨论进度.md)。原正式入口 `/Project_3/` 和正式存档键继续使用，独立试玩站使用自己的存档。第 8 章按本窗证据解锁回顾选项，存档保留选定的后继，和好、分手及未交换微信都会显示结局并收录最后一段会话。发布与验收范围见 [终端界面正式实现任务](docs/终端界面正式实现任务.md)。

v0.6.7 给发送侧的 `OUT<` 标签多留 12px，防止逐字光标碰到标签。已在 Chromium 检查短句、多行和播完状态，来信间距与标签位置保持原样。

v0.6.6 已发布到 [独立终端 UI 试玩站](https://jesse20050324.github.io/he-said-she-said-ui-test/)。[测试仓库](https://github.com/jesse20050324/he-said-she-said-ui-test) 仅包含网页成品，由独立仓库的 `main` 根目录发布。构建时设 `VITE_SAVE_NAMESPACE=he-said-she-said-ui-test` 隔离存档。匿名访问、资源加载与存档隔离已验证，正式仓库及发布配置未改动。

v0.6.5 错开 IN / OUT 的正文边界：长来信在 OUT 标签前保留空白，长回复的左边比来信缩进两个字宽。标签靠两侧，正文离标签 4px。

v0.6.4 AI 回复恢复已发布版布局（origin/main：9376d80）：首字靠右，随可见文本变宽，达到 400px 上限后自然换行。思考标签为 [THINKING]，最后一字播完立即出选项。

v0.6.3窗头 MEM 只展开数量，替换和舍弃并入右栏 CONTEXT STORE；会话使用 USER 01 / 男生、USER 02 / 女生，姓名仍是临时占位。

v0.6.2 放慢启动日志，完成后停留 1.5 秒供阅读；分隔线先从上到下画完，再从左到右展开男窗、女窗、摘要与记忆。三栏完整显示后停留 1.5 秒才启动第一条消息。减少动态效果时直接进入。

v0.6.1 完成标题页细化、双用户临时档案和从上往下逐行开屏。接收/发送等待在消息原位出现，思考逐字并在发出时清除，回车可补完当前输出。两窗可并行选择和播出，保留剧本的严格等待、区间门和跨时间档顺序。第一幕思考缺口与女窗心动店顺序疑点已记录于 [第一幕剧本复核记录](docs/剧本审稿/第一幕剧本复核记录.md)，待剧本审查。本轮剧本和实现层台词均未修改。

终端界面已在独立工作树接入正式第 1、3、4、5、6、7 幕。固定 1440×920 画布；标题及开机演出、双窗键鼠共用选择光标、右侧摘要与记忆、逐条清空与单窗归档已实现。操作焦点与播出调度分离。采用中性灰及清晰中文正文，摘要文案为待审的界面稿。范围、后续验收见 [终端界面正式实现任务](docs/终端界面正式实现任务.md)。

### v0.5.0 发布基线

v0.5.0 接入第六、七幕。按已审查的 Mermaid 单向生成引擎内容，保留两窗独立记忆、跨窗时序和分支反馈。检查 `node tools/build-later-chapters.mjs --check`。来源与验证见 [六七幕接入记录](docs/剧本审稿/六七幕接入记录.md)。

**已落地**：

1. **第五章同步定稿**：确认旧 `content/chapter-05.yaml` 是 v3（24 拍单线），与用户审过的飞书 v5.1 差得很远；建立单向生成器＋overlay，`script/` 与飞书 MMD 全程只读，正文逐字搬运。新增 `scriptSync.test.ts` 用 `--check` 与逐拍断言防再次漂移。
2. **引擎适配网状结构**：`timeline.ts` 成为唯一排序真相（加载期预计算 `sortKey`/`timeRank`/`beatById`）；`requires` 表达严格等待，`window` 表达「区间内先后无所谓、越界即报错」；同档无门即同段自由。修掉 `commitLine`/`commitReply` 播完自动接下一拍的旁路——它曾让一条线一路播到底、女线 16 拍全部播不到。`simulate.ts` 穷举所有入场组合与选项组合，机器证明 40 拍可达、无区间越界、无死锁、终局可抵达。
3. **根治「章间必须刷新」**：`chapter`/`ritual`/`endings`/`error`/`runId` 进 `EngineState` 与 v2 存档；由 reducer 一步完成切章、清该窗消息、记录仪式起点；UI 只读持久化状态。刷新、StrictMode 双调用都能恢复或幂等。旧 v1 档给明确提示后重置，不静默清档。
4. **逐消息节拍**：三层「全局预设 → 章/拍默认 → 逐句/逐选项覆盖」解析成定值 `Timing`（`pauseBeforeMs`/`indicatorMs`/`typeIntervalMs`/`afterMs`）挂在消息上；`prefers-reduced-motion` 全部归零。整体调改一处预设，单句调改 overlay 一行。
5. **UI 按双线 UI 模板重做**：1440×920 固定画布＋窗口不足时整块等比缩放（不重排、无响应式）；用户消息左灰泡、AI 消息右纯文字（无头像/名字/气泡）；思考块在输入卡上方；胶囊想法选中即发送；输入卡 active/locked/empty 三态；三点打字态；确认重来弹层；去掉一切解释玩法文案、girl-banner、窄屏页签；头像 base64 内联、图标内联 SVG、零新增依赖。
6. **严格校验**：`loadScript` 遇未知字段直接报错并列文件名/拍 id/字段名；`validate` 校验时间轴一致性、区间端点、终局声明、节拍数值范围、孤立拍与成环；reducer 异常写入 `state.error` 并在控制台输出，不再静默吞错。
7. **文档与记忆同步**：本文件、`README.md`、`docs/引擎实现说明.md`、`docs/记忆系统实现方案.md`、`docs/界面设计背景.md`、`content/GAPS.md`、`.learnings/*`、工作区 `项目入口_新窗口必读.md` 全部更新。
8. **v0.4.1 移除调试设计（废案）**：删除 `src/ScriptMap.tsx`、`src/ScriptMap.test.tsx`、`src/components/DebugStrip.tsx`；`App.tsx` 移除 `#map` hash 路由；`Game.tsx` 顶栏只留「重新开始」；`ChatPane.tsx` 去掉倍率参数；`index.css` 把 `.debug-strip` 改为中性的 `.script-error` 并删 `.debug-error`；清理只服务调试条的孤儿导出与全部注释；`Game.test.tsx` 改为断言界面无调试 UI；`useEngine.ts` 用 `console.error` 保留运行时错误可观测性。剧本加载失败的错误页保留（不是调试 UI）。
9. 验证：`--check` 通过、测试全绿、`tsc --noEmit` 通过、`npm run build` 通过；v0.4.1 已按用户要求推送 `origin/main`（`4fdbf9e`），GitHub Pages 部署需一两分钟。后续按上方协作纪律发布。
10. **v0.4.2 游戏名与单窗蒙版**：正式游戏名 `He said, she said`（宏观定稿 `script/outline.md`）同步到顶栏、`index.html` 的 `<title>`、README 与全部约束文档；修掉「上下文重置」蒙版全局铺满的问题——`.pane` 加 `position: relative`，让 `.ritual-mask` 与 `.memory-dialog` 只盖住本窗（`.game-canvas` 带 `transform`，缺定位上下文时 `absolute; inset:0` 会以整块画布为基准）。`Game.test.tsx` 新增 DOM 分侧断言与 CSS 定位契约断言。

**设计定稿（剧本侧，未变）**：记忆矩阵体系＋5-8 章新结构在 `script/outline.md`；`script/act5-8-structure.mmd` 是 5-8 章手写骨架图。ch5 v5.1 已审定，v4/v5/v5.1 的迭代脉络留在 `script/设计流程.md` 与 `.learnings/`。

**待办（按顺序）**：

1. 第八幕采用已认可的上线底稿。后续逐拍润色继续走剧本审稿流程。私人参考不进仓库。
2. 清理纯考古文件（`script/synopsis.md`、早期手工 mmd、`content/GAPS.md` 可在确认后删除）。
3. 若改动生成章的已审来源，重跑对应生成器、`--check` 和全套验证。

> 已解决、不要再当成待办：调试/结构可视化设计（已判定废案并全删）、章节标题永远显示「第一幕」、章间必须刷新、第五章仍是旧 v3、女线播不到、播放顺序靠消息历史猜、逐句匀速、旧 UI 的解释性文案。

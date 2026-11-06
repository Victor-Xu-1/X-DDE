# 全页面与交互的长期覆盖清单

## Mol-1 采样与种子设置

预测设置把采样参数和逐行种子集中显示，设备、内存及底层性能选项保留在折叠的专业计算设置。
新增种子使用下一个不重复的原生整数，支持最多 8 个种子；删除首个种子会把下一有效种子提升为主种子。
界面保留 `options.seed` 与 `payload.additional_seeds` 的原生分工，计算协议、默认值和服务器校验不变。
历史 `seed_text` 草稿逐项恢复，不归一化未编辑内容；单个刻意留空的附加种子以空白文本保留，
与无附加种子的空字符串区分。空白、重复、超界或未完成的种子会阻止进入确认步骤，并保留可编辑的草稿。
对应证据为原生表单/请求/草稿回归、`Mol1SeedEditor.test.tsx` 与
`server_tests/test_mol1_settings_browser.py`；完成状态以精确候选和部署验收为准，不表示已执行模型。

## 研究材料输入

共享蛋白/分子材料选择采用紧凑标题栏，上传新文件仍为默认入口；历史文件只在明确切换后读取。
上传控件离开活动来源时卸载，迟到的回复不能把文件重新选中或启用下一步；原来源的确切版本与 SDF 条目仍由父级选择状态保留。
活动材料页的操作栏按页面流排列，避免覆盖历史文件、条目选择或上传错误。
`ReferencePickerUpload.test.tsx` 和 `server_tests/test_material_sources_browser.py` 检查来源切换、原文件摘要、条目恢复与双语布局；不启动科研计算。

## 进化信息设置

Mol-1 和 OpenDDE 共用 MSA 策略设置界面，保留各自的原生参数、文件规则和联网许可。
设置窗口采用待确认的局部编辑；取消不改变已选文件，保存才交给原表单应用。
研究对象、源参数或当前步骤变化时，未提交的编辑失效；Enter 不应递交外层任务。
对应回归位于 `PredictionFeatureSettings.test.tsx`、原生表单/草稿回归和
`server_tests/test_prediction_feature_settings_browser.py`，实际验收状态以相应提交的 CI 与页面证据为准。

Boltz-2 提交前预览复用 Mol-1 的确认窗口。核对已选文件和配体条目后，界面按链显示比对来源、亲和力目标和资源配置。配体链接指向原文件中的精确条目；Boltz-2 从该条目读取分子身份，原始姿势不作为预测约束。预览不重写已选材料的版本，不发起计算；提交使用同一份已审查请求。专项浏览器用真实隔离文件服务验证 STAT6 链级 MSA、无效条目阻断、修正条目和双语布局。

Mol-1 提交前预览：最终步骤可检查组分、计算设置和引用文件。预览核对原文件身份，确认后使用同一份平台请求；技术视图不表示服务器编译后的引擎输入。取消或返回编辑不会创建任务，未就绪的计算环境只允许审查。专项验证覆盖中英界面、旧快照失效、文件核对失败、关闭时焦点返回，以及确认所发送的请求与预览一致。

## 未提交的预测草稿

Mol-1 的「保存草稿 / 打开草稿」保存当前表单，不创建任务或运行环境。
草稿采用独立的版本化 UI 快照，允许空材料、无效的计算参数及未完成的额外种子文本；
提交时仍由原生表单和既有任务 API 校验。其余预测表单尚未接入持久草稿，不能把输入预览当作草稿保存。

快照保存在既有 `WB_STATE_DIR/jobs.sqlite3` 的 `prediction_drafts` 表；不向浏览器存储写入研究输入。
新建任务仍从空白开始，只能显式打开、确认替换后恢复。最多 30 个活动草稿，按最近保存排序；
归档可在「已归档」中恢复。保存采用修订号检查，同一内容的丢失响应重试不会创建副本；
发生冲突时保留当前输入，重新打开或另存新草稿。引用文件使用原资产 ID，活动和归档草稿都阻止原文件被删除。

专项证据为 `tests/test_prediction_drafts.py`、`PredictionDraftControls.test.tsx`、现有 Mol-1 提交回归，
以及 `server_tests/test_prediction_drafts_browser.py` 的真实 SQLite 与编译后中英文页面流程；
相关 CI 同时保留共享输入预览的浏览器回归。没有执行科学模型。
数据库升级只增加新表和索引；旧程序忽略这些表。回退保留草稿表与原文件，恢复新版前不要通过旧版删除草稿引用材料。

[前端质量规范](frontend.md) · [证据记录](evidence.md)

这是持续审查地图，初始为本轮规范尚未逐项验收，不否定仓库已有历史证据。每次审查登记实际候选及证据，不预填通过。它不是每个 PR 都要执行的全局门禁；单个修复仅选择受影响项和直接消费者。

## 唯一清单来源

- 页面/导航：[App](../../frontend/src/App.tsx) 与[导航模型](../../frontend/src/studio/navigation-model.ts)。
- 研究模块：[research-modules](../../frontend/src/studio/research-modules.ts)；能力/表单：[生成目录](../../frontend/src/operations/catalog.ts)与[后端定义](../../src/opendde_workbench/capabilities/definitions.py)。
- 表单/结果实际路由：[ToolCenter](../../frontend/src/operations/ToolCenter.tsx) 与 [OperationResults](../../frontend/src/operations/OperationResults.tsx)，以及[预测结果](../../frontend/src/studio/PredictionResults.tsx)。
- 既有浏览器覆盖核对：[layout_coverage.py](../../server_tests/layout_coverage.py)；其特定状态覆盖不等于本清单全部交互通过。

审查一轮全站覆盖时，按本轮 SHA 从以上来源展开每个 capability ID/路由，核对新增、删除、系统项及未分类项；不能只抽查模块默认入口，也不手工维护第二份固定入口数量。新入口默认未测。相关功能 PR 更新其覆盖记录；不为更新清单而启动全套测试。

## 页面与模块审查地图

所有行的初始状态为「待逐项审查」；在关联 Issue/CI 工件中记录通过、失败、阻塞或有理由的不适用。

| 页面/模块 | 重点状态与交互 |
| --- | --- |
| 全局导航、首页/全部能力、方法切换 | 真实项目继续、筛选、默认/更多方法、当前入口、深链接、返回/前进、焦点 |
| 任务与结果、历史、任务详情 | 空/读取/运行/终态/未知、分页筛选、取消/重试、断联、过期回复、正确任务恢复 |
| 研究空间、项目、文件、关系图 | 创建、分页、选择、确切记录/版本、关系、保存派生版本、文件恢复 |
| 编辑器、2D/3D、序列、图表、导出 | 载入/换源/错误、编辑保存、选择联动、相机/轨迹、下载身份、关闭慢导出 |
| 安装与运行、组件与可选资源 | 目录选择、分组、readiness 分层、活动/暂停/失败、保护已安装状态 |
| 设置与帮助 | 主题/语言持久化与失败、键盘、帮助返回当前流程 |
| 靶点研究 | 来源与关联/活动/材料、检索失败、序列命中、真实材料交接 |
| 结构预测 | 输入/链/残基/方法、候选和置信视图、精确构象比较、不具备环境 |
| 口袋与对接 | 口袋/姿势/残基、约束和失败、表/画布、分数与几何分别解释 |
| 小分子设计 | 生成/固定区域、零/部分候选、状态/构象、输出记录和下一步 |
| 诱导邻近 | 伙伴/连接方向/原子映射、计划、装配候选与质量、真实假设范围 |
| 高通量筛选 | 上传/索引/分页、过滤、预览换源、库成员身份和有界候选交接 |
| DEL | 读段/计数/样本/对照、区间与重复、系列、富集与派生结构身份 |
| 生物药 | CDR/编号/源位点、完整序列/建议、长序列、结构缺失、设计交接 |
| 性质与安全性 | 分子/终点/单位、缺失/拒绝记录、2D/3D、预测与实验分别解释 |
| 动力学与 FEP | 真轨迹播放/暂停/逐帧、网络与边选择、映射、误差/收敛、部分失败 |

各入口按实际能力取适用状态：首次/空、加载、有效/无效输入、环境不可用、提交/排队/运行/取消、成功/零/部分结果、失败/断联/超时、对象/导航切换、对话框/保存/下载。它们是验收维度，不给后端发明新状态。

## 最小覆盖记录

一行包含入口/页面、状态与操作、预期/实际结果、候选 SHA、视口和数据身份、证据/Issue、负责人/审查结论。主题/语言/键盘/减少动态效果及性能仅按涉及的风险补充；不要对所有页面执行全部组合的笛卡尔积。

先完成一次意图一次执行、状态恢复和确切材料交接的代表旅程，再逐步检查不同数据形态及剩余入口。可选公开材料包括 BRD4–JQ1、ABL 分子、曲妥珠单抗–HER2 和 UNCDEL006；须核对[案例身份](../design/research-examples.md)，无归档结果就明确缺项，不为补 UI 清单启动大型计算。

## Molence comparison after v0.7.55

Prediction input overview continuation (Issue #151): the shared setup now exposes
a read-only dialog using the form's current props. OpenDDE, Boltz-2 and Mol-1
retain their existing admission, validation and submission paths. Review covers
bounded sequence positions, exact selected molecular-file records through native
Ketcher depiction, current chain/modification metadata and return-to-edit focus.
It is an input overview, not the compiled native job or a calculation result.
Candidate component/browser checks are scoped to this presentation and direct
consumers; native owner visual review and release acceptance must be recorded
before claiming delivery. No scientific calculation or installation is authorized.

The comparison covers the complete input, interaction, preview and result journeys,
not only a prediction stylesheet. The live capability registry above remains the
module authority. Check every registered submodule against these applicable states:

| Surface | Required comparison | Current gap / evidence |
| --- | --- | --- |
| Shared shell | Navigation, dimensions, typography, spacing, light/dark, English/Chinese, responsive layout | Prediction-only baseline in #145; remaining module shells await comparison |
| New task | Entities, sequence/chemical editors, imports, copies, backend choice, constraints, advanced controls | Public reference states inspected; per-module feature and validation parity pending |
| Review and drafts | Input summary, visual preview, back-to-edit, saving/recovery, submission feedback | Per-module audit pending; no cloud job submission during reference inspection |
| History and status | Search, status/date filters, sorting, pagination, selection, cancellation, errors/recovery | Module ownership retained; detailed reference comparison pending |
| Native structure | Whole/focus/fullscreen, chain visibility, atoms/side chains, linked sequence, selections, missing data | Shared inspection delivered in #147 / v0.7.56; source, visual and native 390 px acceptance recorded in #146 |
| Confidence | Explicit pLDDT mapping, chain borders, sequence/PAE linked ranges, units and missing states | Fractional atom-score scale repair tracked in #148; authoritative native atom/token identity and linked selection remain pending |
| Results | Candidate selection, metrics, tables/plots/2D/3D, comparisons, context and scientific limitations | Prediction seed/sample baseline in #145; module-specific audit pending |
| Download | Exact selected native files, image/SVG export, current display state and failure recovery | v0.7.55 native CIF/PNG/SVG evidence retained; changed inspection states require new acceptance |

Single-structure inspection uses the existing renderer and task/asset authority.
Ranges contain observed residues only, retain insertion codes and stop at chain
boundaries. Sequence display selection cannot create scientific atom restraints.
All-atom detail remains subject to the platform donor-only hydrogen display rule.
Overlays retain their established model colors and separate selection contracts.
No row above constitutes full-product parity acceptance without recorded evidence.

Shared-shell continuation in PR #179 moves the bundled font, palette, floating
header and module task/result navigation into their shared owners. The module
tabs have one instance in the header on every research route. The focused
navigation gate checks the actual research destinations, language/theme controls,
mobile menu and input-preserving navigation; prediction and retained-stage gates
continue to check their own source identities and interactions. This increment
does not mark the remaining per-submodule forms, previews and results as accepted.


Source-bound confidence increment: targeted acceptance must include the retained native STAT6 943-atom/116-token result in English desktop and Chinese narrow compiled UI; exact input/download hashes; real confidence/chain coloring, sequence selection, PAE clicks and two-axis ranges; stale candidate/source rejection; unsupported mapping fallback; hidden-chain behavior; source geometry and hydrogen policy preservation. This is not whole-module pixel parity or a new scientific inference. Mol-1 and unsupported historical formats need their own source mapping and remain separate acceptance items.


Optional 3D instruction alignment: template guidance uses stable original question indices; a self-guided optional restraints page has no unrelated template note. Refinement plan/review and OpenMM/GROMACS final review retain their original guide indices. Permanent bilingual navigation cases check the actual note at each question and prohibit submission. The verified four-failure/two-unaffected-case baseline is retained from CI run41572911026; the one-off historical comparator is retired. A strict guidance-only predicate delegates this bounded form change to its exact questionnaire/help/scientific/simulation/Mol-1 consumers; unrelated files never receive that delegation. No global UI suite or scientific computation is authorized by this change.

Boltz chain-input acceptance: the unchanged baseline e4626912 failed exactly the missing MSA-settings interaction (one failure, eighteen related passes; PR run42114022504). The changed scope checks transactional Save/Cancel, source/chain invalidation, late uploads, native MSA identity and the exact final-review SDF record in isolated CI. Actual compiled screenshots cover English1440/light+dark and Chinese390. Owner Codex-IAB checks and official4322 deployment/data identity must be recorded before this increment is accepted. No model inference, job submission, owner scientific install or global suite is part of this interface gate.

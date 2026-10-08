# Task page layout

## Commercial workflow references and graphical results

The visual system uses a continuous cool-white canvas, indigo/violet actions, teal scientific accents, readable
typography and a single spacing palette. Section titles, whitespace and subtle
horizontal rules organize pages without nested framed cards or raised panels. Scientific
content determines layout: forms stay step-by-step; result tables sit beside the
selected molecular/sequence view; images are real native renderings.

## AI-biomedical visual identity

The owner's selected concept uses cool white, blue-violet and teal. Built-in image_gen
produced entry/results mockups and a separate quiet molecular-network/DNA atmosphere.
Mockup structures, scores, labels and status are conceptual; none are imported as
scientific data or presented as an actual experiment. The original X-DDE raster logo
remains unchanged. The new ambient WebP is a pixel-identical encoding of the generated
PNG, with prompt and SHA-256 in `frontend/public/images/modules/ambient-provenance.json`.
The image tool does not expose a selectable image-2.5 model.

The entry page follows the concept's compact title, five-stage research navigation,
six open research directions and real-project continuation. Stage shortcuts use the
existing registry defaults; small-molecule design has an explicit biologics alternative.
They are navigation, never task progress or scientific completion. Project continuation
uses actual API records, with an honest empty-workspace state. No mock project, asset
thumbnail, score or timestamp is fabricated. Result composition gives the linked
native table 40% and structure inspector 60% where width permits; smaller screens
stack the same source views. Task inputs retain one visible questionnaire step.

Shared tokens, sidebar/header, choices, buttons, tables, sequences, component status and
plots follow the same visual identity. Decorations are restricted to entry/header areas;
Ketcher drawings, structural coordinates, charge interpretation, contact identities,
native metrics and exports keep their existing authority. Scoped Chromium checks
walk every registered module and genuine archived case and verify focus, text/action contrast,
desktop/mobile geometry and original task state without scientific recomputation.

Each question page has one primary question heading. Step-specific mode controls
share that heading row, remain disabled while submitting, and retain the same
input state on back navigation. Environment readiness stays visible in method
selection and the final review; an unavailable runtime blocks submission without
an extra warning banner above the first question. Structure results remain
accessible even when a calculation environment is unavailable. Shared native file
selection includes accepted formats and size limits in its choice area.
Selecting a replacement clears the previous draft input before uploading. Failed
uploads can retry the same file, and leaving that input choice prevents a late
upload response from restoring it. Immutable server files and historical records
remain available; this only changes the current questionnaire's selection.
Choice grids fit their actual options rather than reserving empty columns. Flat
sequence and plot sections align with their parent table instead of adding a
second inset to each subsection. Extra-wide prediction pages fit their available
choices across the row; ordinary desktop and compact flows retain their existing
breakpoints.

Structure-based research objectives use one control-and-preview composition.
Ligand choice, target-chain checkboxes and selected residue identities sit before
the 3D preview in document order and beside it on desktop. Compact screens stack
the same controls above the structure. Chain, residue number and insertion code
are taken from the actual scene without renumbering; no calculation starts during
selection. Changing the source asset/digest remounts the scene selection, preventing
late messages from restoring another structure's choices.

Presentation changes under `frontend/src/integrations` run their focused component
and Chromium checks. Native adapter, molecular-state and receptor calculations
remain in the scientific workflow for backend changes or explicit dispatch;
moving a choice panel does not justify unrelated native scientific runs.

Sequence scoring places its table and comparison plot in one column, with the
selected exact sequence beside them. This avoids stacking two tall views beside
a short table. Selection, native score precision, position identity and original
FASTA/CSV/SVG downloads retain their existing contracts.
Shared scatter plots measure their actual column width and keep a 265-pixel
canvas height. Labels and markers keep their pixel size on extra-wide screens;
compact columns use fewer tick labels without changing their source values or
selection identities. Exported SVG uses the same current geometry and labels.

Public product references were reviewed for interaction patterns, not for a claim
that X-DDE implements their proprietary scientific methods:

| Research workflow | Primary design references | X-DDE presentation |
| --- | --- | --- |
| Targets and reference import | Open Targets source evidence, Benchling record organization | Source status, separately tabbed associations/materials/activities, sortable evidence tables and exact sequence positions |
| Structures and input preparation | Boltz Lab task screens supplied by the owner, Maestro structure hierarchy | One question page, source-coordinate 3D context, confidence views and native PNG capture |
| Pockets, docking and contacts | Maestro ligand interactions, OpenEye VIDA spreadsheet/display linking | Exact pose/pocket selection, linked receptor view, original method/unit score columns and native 2D molecule thumbnails |
| Small molecule generation/state preparation | OpenEye VIDA compound browsing | Real per-record 2D/3D views, original record identity, qualified-candidate handoff and original state/force-field distinctions |
| Antibodies and sequence methods | Benchling AA sequence/alignment and annotation tools | Explicit source-position/CDR tracks, IMGT-preserving original/proposal alignment, native score tables and plots |
| Properties, safety and library inspection | Simulations Plus ADMET Predictor data/graph workflow | Searchable tables, raw endpoint values/units, selected molecular previews and interactive finite-value scatter plots |

Reference URLs:

- https://docs.eyesopen.com/applications/vida/spreadsheet.html
- https://docs.eyesopen.com/applications/vida/display_3d.html
- https://help.benchling.com/hc/en-us/articles/39922093033869-How-to-create-alignments
- https://www.schrodinger.com/platform/products/ligand-designer/
- https://www.simulations-plus.com/resource/admet-predictor-tutorial-series-calculating-properties/

ResearchTable changes view state only. Search/sort/pagination preserve native row
identities; missing values stay missing. Side-by-side comparisons never normalize
mixed metrics, convert scores into affinity or merge measured assay endpoints.
CSV exports retain source values and units, quote Unicode fields and guard
spreadsheet formulas. Tab panels mount on demand and preserve visited view state.

Candidate pockets use the shared sortable table with separate native ranks,
probabilities, scores and residue counts. Selecting a row highlights that exact
site in the source structure and carries its identity into the next task.

The shared native Ketcher SVG renderer reads exact bounded SMILES or MOL/SDF
records. One bounded readiness handshake, a serial drawing queue and a bounded
Blob cache keep cold starts and hidden panels from generating repeated requests.
Images load near the visible range. Bounded SVG data URLs preserve drawing bytes
and work under the unchanged platform image policy; unmounts release view state.
The pinned native color protocol uses normalized RGB, rather than the incompatible
hex example in the upstream high-level documentation. Native layout uses a
separate invisible drawing canvas and a display copy, so 3D source coordinates
are not projected into misleading flat chemical diagrams. It never changes the
user's editor or research files, and never creates research jobs.
Missing editors/invalid records remain explicit; retry is a user action.

3D capture uses the existing 3Dmol renderer and a same-origin frame/nonce check.
Only bounded PNG payloads are accepted. Captures show current display/camera state;
they do not represent a new structural calculation or a new evidence version.

Every molecular viewer uses the same online appearance controls. Native PNG
exports support bounded 1x/2x/3x rendering and restore the camera and viewport
even on errors. 2D drawings expose a few native line-weight choices and SVG
downloads. Metric charts export their displayed axes, values, labels and styles;
sequence views export exact FASTA. Originals retain separate download links.

All 2D thumbnails, selected molecular previews and their SVG downloads share the
local Ketcher renderer. It lays out an isolated display copy, uses native
dearomatization to assign valid alternating single/double aromatic bonds, and
then exports that copy. Benzene rings do not use center circles; SVG paths are
never removed or redrawn to mimic chemistry. The integrated Ketcher editor also
defaults to native dearomatization on load. Source records, original coordinates,
stereochemistry, isotope/charge labels and retained salt fragments remain in the
original assets; only an explicit editor save creates a new scientific version.
The same Ketcher display policy uses heteroatom hydrogen labels: unmarked terminal
carbons are skeletal endpoints, without CH3 labels. Heteroatom hydrogens, charges,
isotopes and stereochemical marks remain available. Native SVG export uses the
editor's actual label policy; text/glyph elements are never stripped from an image.

Generated candidates are bound to the declared output digest, rather than an
asset's editable filename or the first page of global assets. State results
display every retained state and conformer independently of history indexing;
energy plots compare one state and force field only. Receptor ensembles open an
actual aligned pair by default. Sequence-design results use native score tables,
sequence comparisons and available declared structures; absent structures are
not fabricated. Historical RMSD results lacking an aligned export display
verified original inputs with an explicit distinction from aligned coordinates.

Every registered catalogue ID remains in its original scientific execution
path. Shared typography/forms/structured result tables cover all module pages;
domain-specific views preserve native molecular records, source sequence positions,
score definitions, and readiness/qualification boundaries. No synthesis workflow
or unsupported scientific endpoint is added by this presentation update.

Portable public cases include source snapshots used by the native archive verifier.
Legacy bundles may recover the omitted final response only from the retained
archive material with the same recorded SHA-256; all existing source identity,
scope and digest checks still run. Missing metadata is never reconstructed from
molecular files, and changed existing receipts are never overwritten.

X-DDE uses one guided task component and one source-selection contract. Scientific engines and result schemas are unchanged by presentation work.

- Show one questionnaire step at a time. Keep Next and Submit at the lower right; validate the current step before navigation.
- Use a consistent 1040 px input surface and up to 1440 px for scientific results. The template toolbar, form and footer share that surface.
- Start with fresh files or pasted inputs. Historical files are an explicit choice; one selector includes exact scientific versions and unregistered uploads.
- Keep scientific inputs, units, coordinate-frame confirmations and external-service consent visible where needed. Optional adjustments, annotations and detailed result groups use disclosure controls.
- Present native metrics and compact result tables without treating model scores, geometric distances or contact counts as experimental binding or force.
- Namespace installation card styles. Avoid global form-button rules overriding task progress, tooltips or viewer controls.
- Asset lists precede the optional relationship graph. Creating a project opens a focused dialog.

## Scoped verification

`Task layout and browser checks` runs only the affected frontend contracts and a real Chromium sweep of every registered research task (currently 71). Desktop and mobile run in independent bounded jobs. It restores the reviewed public case bundle into fresh runner state; it does not launch scientific calculations. The sweep checks one visible step, aligned input surfaces, desktop/mobile overflow, archived example views and absence of new compute tasks. Screenshot and geometry evidence are uploaded as workflow artifacts.

A production UI update also needs visual review of its installed preview. Compiling source or passing DOM checks alone is not a visual acceptance result.

All file selection surfaces use the shared `FileSelect` presentation. The real
native input retains its accessible purpose, accepted formats, disabled state,
original `File` objects and caller's upload/resume callbacks. Visible controls
use Chinese or English, a contained file icon and consistent focus treatment;
regular research inputs fill their assigned width while editor toolbars remain
compact. Callers that clear the native value for reopening the same file do not
retain a stale file label. File selection does not imply successful upload or
scientific validation, and does not create a second upload implementation.

## Card and spacing contracts

Component installation uses one main card grid, bounded by the shared 1440 px workspace.
Columns use auto-fill at a 240 px minimum so a one- or two-item filter retains the same
card width. Cards have an explicit track width, a near-square proportion, readable
wrapping and a contained footer. Installed status is a compact disabled button;
repair, upgrades and removal remain in the separate maintenance disclosure. Selecting
a research group exposes its reviewed bundle, and optional models/support packages stay
expandable. Active or unresolved optional operations remain visible.

The capability catalogue, readiness items and questionnaire choices share a consistent
flat hierarchy and spacing. Tables, editors and scientific results keep their functional
layout rather than being forced into squares. A fresh prediction omits its empty project/
history toolbar. Asset pagination remains reachable with a bounded scrolling list.

Scoped browser checks inspect 1440/1920/2560 px desktops and a 390 px mobile viewport,
short component groups, optional models, footer containment and absence of installation
mutations. The existing 44-module questionnaire/expert/archived-result walk remains the
task-page acceptance boundary. These are interface checks, not scientific execution.

## Researcher-facing information

Every task page was reviewed as a research decision: identify the input, choose a plan, review the submission, interpret the native result, choose a next action. Default forms never expose internal server paths, queue reasons, job IDs, stack traces or transport envelopes. Exact scientific inputs, numerical units, missing/failed results, external-service consent, native methods and limitations remain accessible. Expert adjustments use the existing questionnaire, not another execution path.

Inputs have visible purpose labels; fresh entry remains the default. Empty history controls are omitted. Sequence scores retain input correspondence. Sequence proposals preserve full chains and genuine scores stored in scientific metadata; engineering receipts are excluded. Prepared prediction JSON is an explicitly generated scientific input with a download link, rather than an arbitrary internal JSON attachment.

Pocket selection highlights exact model/chain/number/insertion/alternate identities in the loaded source and reports actual matching counts. Docking opens the first qualified native pose. A zero-candidate result explains the outcome without trying to render an empty SDF. Generated candidate selection includes only the declared output artifact, not raw sampling or input assets. One immutable SDF-record extractor is shared by editor and viewer; it preserves blank headers and coordinates and refuses missing records.

Assets default to research results, with originals and tasks available through explicit filters and pagination. Installation shows main research tools first; optional models and supporting packages are expandable, with active/paused or unresolved failures exposed. Runtime descriptions state configuration/readiness truthfully and never equate configuration with scientific validation.

Focused CI checks exercise these result, identity, navigation, failure and component contracts. The Chromium sweep uses the frozen public research bundle and submits no scientific jobs; scientific-model acceptance is a separate server activity.


## Research navigation consolidation

One capability/view selection authority lives in App. The presentation registry assigns
all 44 visible catalogue IDs exactly once to six workflows; defaults and recommended
choices are checked against the backend-generated catalogue. Sidebar has nine destinations;
settings menu has three. Native task IDs, methods, scientific assets and example identities
remain unchanged. Scientific estimates are not merged or renamed into a different method.

Projects/files/editor share Research workspace. Actual results/exports share Tasks and
results and PredictionResults. Component installation/readiness share Installation and
runtime. Removed account and overview placeholders are not hidden behind another menu.
Navigation/Header, typed module mapping, task selection, task results and workspace tabs
have separate maintainable modules; duplicate UtilityViews routes are retired.

Change-specific CI verifies module coverage/defaults, one active navigation parent,
keyboard/outside-click/Escape behavior, fresh task inputs, explicit history, project scoping,
result loading/errors/exports, language/theme persistence, and the existing all-module
Chromium walk without submitting scientific tasks. Coverage is split into two
deterministic task groups at each reviewed width (1440 and 390), retaining the
20-minute budget for each group. A final gate requires all groups from the same
source revision, every registered task, its new input and template/result states,
and all eight utility pages at each actual width. Splitting does not reduce task
coverage or turn a cancelled group into a passing result.

Owner machine performs static/build,
real UI inspection and app lifecycle checks only.

Source-bound research choices appear beside their 3D structure: actual chains for
binder design, exact residues for sequence redesign, and the ligand to analyze for
interaction profiling. Compact screens stack the choices above the preview. A
new structure remounts its source-specific selector, so late scene callbacks
cannot offer choices from an older file. Choosing an analysis ligand synchronizes
the existing viewer center and camera only after that ligand is found in the
current loaded scene. Ordinary rerenders preserve the user's camera. This uses
the shared viewer options/message path; scientific coordinates and payload
identities remain unchanged.

Empty DEL inputs link to the specific prerequisite (library definition, decoding,
counts, enrichment or training) through the existing task navigation. Property
prediction offers training when no trained model exists. Retrieval errors and
loading states remain distinct from missing prerequisites; retry is explicit.
Selected public template sources remain visible even when excluded from personal
history. Missing counts are not displayed as zero, and source checksums remain
attached to selections.

Exposure templates explicitly project deposited alternate A from the verified
BRD4 complex. Protein-only APBS/OpenMM inputs use the same projection before
selecting ATOM records. Coordinates, atom identifiers and retained connectivity
are preserved; no atoms or coordinates are generated. The immutable original is
retained and each projection is registered as `prepared_from`. These are declared
input projections, not newly computed scientific results. Module guides describe
the actual controls and material requirements rather than unrelated antibody or
agent workflows.

Runtime readiness is a compact environment table with one installation action.
It retains independent platform status, disconnected/stale state, Harness compute
configuration and model-file counts; file presence is not scientific acceptance.

Zero-qualified design results offer the exact original molecular record in 2D/3D
and the input receptor in separate views. Independently supplied coordinate frames
are not overlaid. Diagnostic outputs retain their restrictions, and an empty fixed-core
review says that no candidate was available instead of presenting a 0/0 comparison.

Scientific candidate-count choices use the same flat selectable controls as other
questionnaires, preserving numeric payload values. Surface and channel region
selection place exact selected components beside the 3D preview, above it on compact
screens. A single selected ligand uses the existing source-bound viewer focus.
Dataset form content aligns with the question title at wide widths instead of
centering a separate narrow block. Researcher diagnostic captures also wait for
native molecular drawings to finish before their screenshots are accepted.

DEL model validation uses one full-width composition: observed/predicted points
beside the native holdout metrics, stacked on compact screens. The displayed
baseline comparison uses only finite native RMSE values; application predictions
never acquire holdout labels. Lower holdout error does not imply affinity or
experimental acceptance. Expert tuning starts on a separate line from side-chain
selection so the two actions cannot be mistaken for one checkbox label.

Dataset results only offer a chart tab when a real primary view and supported
native chart artifacts both exist. Chart-only results open directly. Loading,
failed and changed-source chart states never reuse earlier plots or manufacture
metadata bar charts. Failed/invalid chart reads show one explicit retry action;
native downloads remain available. Typed document validation preserves actual
correlation masks and rejects missing, nonfinite or mismatched plot data.

Prepared and encoded library members use the existing verified dataset authority
and bounded readonly SQL queries. Indexed results show actual member identities,
structures and sources with search/pagination; descriptors and docking scores are
not synthesized. Storage shards and zero unresolved-structure counters are omitted
from the primary display. Noninteractive member names are plain text rather than
buttons with no action.

The shared native Ketcher drawing queue tracks active consumers. Queued drawings
from departed pages are skipped before editor mutation, while a deduplicated
drawing remains live when another consumer still needs it. Native timeout and
pending-work limits are retained; the scientific source is never changed.

Indexed libraries pair the member table with an exact native MOL inspector.
Preview/download reads are side-effect free. Selecting a member loads its actual
stored coordinates with a report-bound URL; no new embedding, optimization or
binding pose is implied. Explicit preservation copies the unchanged MOL through
the existing AssetStore/ScientificStore and links the original job. Retry is
idempotent; saved files enable the existing pose/edit/task pathways.

Member identifiers retain minimum column widths on compact screens; tables scroll
within their own region. Supplied names are used in molecule alt text, custom
sources read as research libraries, and the retrieval model label is localized.
The table header no longer creates an invalid whitespace node under a row.

Viewport resizing adjusts only the existing camera zoom when width becomes the
limiting axis. It retains the viewed region, translation and rotation; coordinates
and molecular properties are untouched. Returning to the earlier aspect ratio
reverses the scale without cumulative zoom drift.

Native candidate-set comparisons now pair numeric tables with selectable SVG bar charts. Recurring mutations retain both native denominators and missing improvement scores; no genealogy is drawn when the native result has no parent-child tree. Target MSA results show the original query sequence and native alignment depth, with FASTA and result JSON downloads; historical jobs without attached A3M files do not claim a portable alignment matrix.

Generated result previews are now derived from the declared original SDF records and byte digest, independently of optional research-version indexing. Native and qualified record counts must match the actual SDF before display. Reusable task handoffs still require a real immutable object matching the source job, output digest and record; missing historical index metadata never creates synthetic references.

Feature preparation previews read the actual typed task components; converted input previews decode only the declared native JSON entities. CCD identifiers stay distinct from SMILES. Original conversion input structures are selected one at a time, preserving their independent coordinate frames.

### 预览中的 pose 最小化

小分子三维预览提供紧凑的“能量最小化”操作、收起的专家设置、保存状态、上一/下一 pose 和当前 SDF 下载。各模块共用同一预览控制，不再重复跳转到另一张最小化问卷。默认从当前 SDF/MOL 记录的已有三维坐标执行 RDKit MMFF94s；UFF 必须明确选择，不静默回退。程序只补齐隐式氢，不枚举化学状态、不重新嵌入构象。表格显示同一氢补全模型的前后能量、实际方法和收敛状态；分子内能量不作为结合亲和力。

受体与配体同时显示且来源明确时，按钮为“受体内最小化”，沿用 GNINA 既有 typed adapter、坐标系确认和姿势合格检查；受体保持不动。点选说明解释坐标确认含义。比较视图、诊断姿势和缺少配体化学键的 PDB/CIF 不自动执行游离分子优化。分子准备中的单构象预览定位到原生验证后的构象集合确切记录；质控预览定位回原始输入，而非另造一份诊断资产。

新增 pose 走原有队列、任务数据库、文件资产和 ScientificStore。成功输出自动登记为 `edited_from` 子版本，校验源 SHA、确切记录、方法、有限能量、原子映射、化学身份和立体化学；失败不覆盖或切换当前 pose。撤回只切换显示版本，不删除已保存版本。切换分子/页面中止旧页面轮询，不取消已提交的后台计算；同一次不确定提交使用原 idempotency key，避免重复任务。

### 模块背景与版式

八组通过内置 image_gen 生成的真实栅格背景覆盖靶点、结构、口袋/对接、小分子、生物药、性质、研究空间和安装运行。所有公开任务沿用 `researchModules` 的唯一导航分类选择主题；持久化结果按实际任务类型选择相应主题。背景限于模块入口卡片与紧凑工具栏，不铺在科学表格、2D/3D 画布或研究输入后面。生成图仅为概念性装饰，不是实际科学结果；原始 PNG 留在 E 盘工作资产中，前端使用像素完全相同的无损 WebP。具体图像模型无法由该工具接口指定，来源记录不得虚称 image-2.5。

模块入口采用等高平铺区域，以留白和细横线分组，移除独立外框、圆角容器和阴影。任务工具栏52px，问卷上下16px、左右与页面内容对齐。主内容与任务使用可用宽度，结果按表格和科学视图分配空间；短构象表不预留固定高度，长表在上限内滚动。单页一步逻辑保留，进度轨道负责步骤编号，标题不重复大号编号；下一步和提交在问卷右下方，长页面中保持可见。返回入口、模板和说明合为一行，结果标题仅显示一次案例名称。

问卷、示例、结果表格、2D/3D 预览、序列、项目和安装区域融入连续页面，选项用浅色底和选中底线表达状态；输入框、键盘焦点、错误/告警及浮层仍保持功能性边界。评分与接触图的解释放在对应标题的鼠标/键盘提示中；方法说明收进详情，输入结构明确标为非预测结果。失败原因、研究方法、单位和缺失结果仍保留，内部诊断不提升为主内容。移动端收紧内距与图像占用，暗色及高对比模式优先保证可读性。装饰不额外增加大幅介绍区，也不改变原生输入、三维坐标和任务调用。共享主题由 `design/module-theme.ts` 决定，背景和间距由 `design/module-surfaces.css` 维护，组件外观在其现有样式源中修改，图像与来源在 `frontend/public/images/modules`；不要为每个能力另造竞争的导航或累积覆盖样式。

### 序列、抗体与姿势质控结果

蛋白序列评分、抗体编号、人源参考评估与姿势质控共用平铺的列表/预览布局：桌面并排，窄屏依次展示。序列评分保留输入与原生数值的顺序、完整精度导出和对应的 FASTA；缺失输入或分数明确显示为空，不造替代值。选择状态随来源或任务改变而重置。

抗体页将完整输入序列和已编号可变域分别标注，CDR 点击与原始序列位置联动。IMGT 插入码和域 FASTA 保留原样。人源参考页只在确有修改建议时显示对照列；自适应的残基列将原始与建议序列上下对齐，修改表可定位到同一位置。原生残基概率与 OAS 精确肽段匹配分别解释，不归一化为人源化百分比或临床评分。

姿势质控将全部检查直接放在原始三维预览旁，并可筛选通过、需复核和未能计算；缺少结构预览不会变成检查通过。结果交互和实际源文件由 `sequence-result-checks.yml` 的限定组件与公开原生案例检查验证，使用中文/英文和 1440、1331、390 px。此专项不运行全局测试或新的科学推理。

### 共用导航与任务页位置

窄屏研究导航使用原生模态抽屉，保留全部研究分类和完整名称。桌面继续显示侧栏；窄屏顶栏显示当前研究方向，搜索按需展开。抽屉使用原生焦点限制、Escape 和背景关闭，关闭时保留表单内容与当前步骤；页面跳转后按原有应用导航规则进入目的页面。

搜索与任务提醒分别维护显示状态：搜索支持名称/任务编号、空结果、方向键选择和 Escape；提醒使用对应语言的任务状态。旧的窄侧栏文字截断规则已移除。相关应用、方法选择和设置组件通过 `navigation-shell-checks.yml` 的限定检查；实际页面导航覆盖全部 12 个主要目的地、中英文、320/390/768/1440 px 以及深浅主题，不提交计算或安装任务。

### 任务内公开案例控制

任务填写和公开案例预览使用同一条紧凑控制栏。打开结果后，案例名称、公开结果或配置示例的类型、材料入口和返回操作集中在一处；不重复显示“示例结果”按钮。预测页的个人输入/结果页签在公开预览中隐藏，返回填写后恢复原步骤和材料。案例来源按需展开，支持 Escape、外部点击关闭和键盘焦点返回。

模板说明读取、模板材料准备和结果打开分别显示进度。读取或准备失败时保留填写入口，研究人员可明确重试同一操作；不自动重提科学任务。失败提示使用研究语言，服务器诊断不显示为主内容。通过 `template-controls-checks.yml` 限定检查共享控制及其直接消费者，并在实际 Chromium 中打开预测、性质、DEL 和仅配置案例，核对来源、键盘返回、输入保留、中英文和不同宽度。归档案例的使用不代表重新完成模型科学验收。

### 默认语言与语言切换

首次启动默认使用 English，HTML 初始语言也为 `en`。界面设置可切换简体中文和 English；刷新后恢复已保存的选择，已有中文偏好保留。保存值无效或浏览器存储不可读取时仍使用 English。界面语言随任务、结果预览和设置的公共语言状态传递；用户输入、研究文件名称、分子和序列原文不作翻译。语言回归使用限定的状态/设置组件检查和实际首次访问、切换、刷新场景，不运行全局测试。

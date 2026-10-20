# Public research examples

The current study profile is STAT6, defined in
`src/opendde_workbench/examples/stat6/manifest.json`. Every research module owns
its **New task / Task results** navigation; there is no global task-results menu.
Live structures lead on the left in the shared molecular workspace. Tables,
conditions and follow-up actions use the right pane; narrow screens retain the
same view-first order. Results, templates and structural selection steps share
the same roomy viewport without changing scientific coordinates or data.
The shared jobs database remains the sole task authority. Older direct job URLs
and `view=tasks&module=...` links resolve to their owning module without moving or
rewriting task records. Module filters, pagination and selected results remain
isolated when switching between modules.

A completed example requires submission through the deployed published frontend,
native outputs, an input/method/visual/download review, and an immutable result
pin. Loading an input preset alone does not meet that acceptance criterion. The
optional pin review retains the interpretation and limitations; it is computational
review, not experimental validation. MD/FEP examples are excluded from the current
owner case campaign while those calculations remain paused.

The STAT6 REINVENT template uses the source-verified fluoroindole scaffold from
the supplied study molecule, with one explicitly marked R-group attachment site,
a 20-candidate budget and the retained CPU/memory/seed settings. Loading the
template does not run a calculation. Generated molecules are unbound calculated
conformers; preserved scaffold connectivity and molecular properties do not prove
STAT6 binding, pocket compatibility or activity. Those require separate paired
docking and independent quality review. Native 3D image capture first presents a
preview; **Download view PNG** saves the displayed image.

Scientific questionnaires initialize execution settings from the explicitly
loaded template, including device, CPU, memory and random seed. These settings
are reviewed and submitted unchanged unless the researcher edits them; blank
tasks keep the ordinary defaults. Template loading never submits a calculation.

Generated-candidate 2D previews and thumbnails use the same native SMILES graph,
including explicitly declared stereochemistry. Their 3D previews and downloads
retain the native calculated SDF. This avoids assigning apparent stereocenters
from an arbitrary unbound conformation when drawing the 2D graph.

The reviewed STAT6 data package contains 42 primary module examples (41 native
computational examples and one reported-data example), plus one nested follow-up.
It includes the source-verified single-site R-group study and the original 9BIG
mmCIF contact map (7 hydrogen bonds and 4 hydrophobic contacts). Its immutable archive
retains original requests, native files and computational interpretations.
Cold restoration is idempotent and never executes historical calculations.

Module examples have independent authored revisions. A replacement computation
advances only its affected module through `scripts/revise-study-modules.py
--set capability=NEXT`; the product counter remains governed by
`scripts/release-version.py`. The authoring tool freezes complete prior module
definitions in the existing published catalogue profiles and registers the new
canonical digest. Existing pins, source files and native task requests are never
rewritten. Historical restoration validates the old bundle against its frozen
module definitions, including request replay and follow-up lineage. It cannot
downgrade or overwrite a newer installed pin. Unknown catalogues, changed source
manifests or altered frozen module definitions remain explicit failures.

When a new case consumes a file from an earlier reviewed case, export retains
that source pin as a dependency. It must belong to the same study, match its
stored identity and not exceed the module's current revision. The deterministic
native output identity, exact asset bytes and native artifact inventory are
verified before following typed source/parent references. Unconsumed old pins,
private annotations and same-name files are not exported. Original requests,
validation labels and immutable pins remain unchanged; lineage checks are not
relaxed to make an incomplete package pass.
Subset exports declare source pins separately from the selected module results.
Restore checks that inventory and reconstructs the typed dependency projection
in isolated state before merging. It rejects undeclared or unconsumed source pins
and never expands the requested module's visible result scope to its dependencies.

Updating computational examples does not promote their scientific claims.
Generation proposes chemical structures; state preparation produces unbound
conformers; docking proposes binding hypotheses. Native geometry checks and
similar scores do not establish measured affinity or a unique binding mode.
PNG snapshot previews retain the original native pixels, while their download
links use bounded Blob URLs for browser compatibility and release those URLs
when the preview closes or its source changes.

A fixed study can retain up to eight successful follow-up task results alongside
its original result, such as receptor-bound refinement and independent pose
quality. Each follow-up must consume a typed scientific output of the primary
or an earlier follow-up, and every other input must remain in the reviewed input
lineage. The ordered results and their evidence are immutable. The module's
example result selector displays one native stage at a time, without changing
the draft or URL. Bundle export includes this closure; import never launches
these tasks. Original generator metrics stay explicitly labeled as original
metrics when a later pose is displayed.

The STAT6 diversification and descriptor-optimization studies can also retain the
exact reviewed 9BIG protein-only preparation as an experimental-receptor control. This optional
material uses the existing native preparation and provenance checks; it never
replaces the paired predicted receptor in the original design request. A cold
installation without that reviewed preparation leaves the control unavailable.
Matched controls retain the same prepared ligand and search settings, while
keeping receptor conditions, pose rankings and missing environmental context
explicit. Their scores and quality checks do not establish experimental binding.

STAT6 分子多样化与描述符优化示例可将经过同一来源、原生准备和文件完整性核验的
9BIG 蛋白受体保存为可选对照。该对照不改变原任务的受体或配体坐标系；未安装已复核
准备结果时不创建替代材料。相同分子与搜索设置下的受体比较仍须保留不同姿势、评分
与缺失环境信息。QED 上升不代表骨架保留、亲和力或活性改善。

Portable result packages may retain terminal history for an exact-request retry
of a successful native case. Those ancestor rows preserve their original status,
request, identity and parent links, carry no scientific output files and never
count as computed examples. Active/paused tasks, failed pins, changed-request
ancestors and failed scientific input dependencies remain inadmissible. Restore
does not enqueue historical attempts or rewrite the owner's original records.

The STAT6 docking preset reuses the exact protein-only preparation consumed by
the reviewed docking example, through that example's receptor version and native
preparation provenance. It validates the original 9BIG source, chain A, alternate
A, removed waters/nonpolymers, PDB artifact and unchanged registered bytes. A cold
installation without that reviewed result retains the raw reference materials
and preparation instructions but does not prefill an unresolved receptor as a
ready docking request. Exposure and alignment keep their separate reviewed CIF
preparation; no existing pin or original input is overwritten.
GNINA review shows the actual receptor, selected SDF record, search reference or
box, scoring method, neural-scoring stage and effective resource/search settings.
Scoring preserves the input coordinates; local optimization retains its original
pose separately. Neither is described as a new global docking search.
Requested neural scoring requires both native CNN pose and affinity model
outputs alongside the empirical score. Missing, duplicate or nonfinite outputs
fail the calculation with its native diagnostics retained; they never become an
empirical-only success or a chemical no-hit result. Empirical-only tasks retain
their original contract. Model outputs are not measured affinity.
Candidate-batch docking uses that same frozen score contract. With neural
rescoring it retains the highest native CNN pose score for each molecule;
empirical-only tasks retain the lowest empirical score. Ties retain native
order. Original poses and both kinds of score remain available; no weighted
combination or measured-affinity conversion is invented.

New GNINA results compare geometry in the unchanged receptor frame without
fitting the ligand. Reference-guided docking compares against the search
reference only when full chemical state and stereochemistry match. Existing-pose
scoring and optimization compare against their own exact input pose. Report both
whole-heavy-atom RMSD and RMSD of reference heavy atoms within 4 Å of receptor
heavy atoms; this contact subset is fixed before reading the calculated poses.
Flexible exposed tails affect the whole-pose measure. Exact stereochemical
symmetry matching is bounded at 4096; different states or excessive symmetry
produce an explicit unavailable comparison, never a partial minimum or zero.
An empty contact subset has no contact RMSD. These are geometric distances, not
affinity, an acceptance verdict or an experimental validation claim. Original
files, scores and historical results remain unchanged. The method follows
[RDKit's in-place RMSD convention](https://www.rdkit.org/docs/source/rdkit.Chem.rdMolAlign.html)
and keeps [GNINA's distinct docking, scoring and minimization operations](https://github.com/gnina/gnina).

The docking table lists conformers of the same molecular graph as compact rows;
its shared left-hand inspector provides the selected pose's 2D and 3D views.
It does not repeat identical molecular thumbnails in every pose row. Scores and
reference distances fit the default pane, while atom mappings, additional neural
outputs and qualification details remain available through the column selector.
Rejected poses keep their exclusion status visible. CSV exports retain all
metrics independently of the visible columns.

The PDB-only DiffSBDD receptor-filtering preset uses the same qualified protein
version. It never pre-fills the original CIF into a PDB-only input or falls back
to the unresolved extracted PDB. The raw original stays available for inspection,
and explicit preparation is required when the reviewed PDB is unavailable.
The STAT6 channel preset starts from the actual deposited AK-1690 component
(`A:A1AQQ 701`) in the reviewed CIF, removes that starting ligand from geometric
obstacles and uses chain A. It does not substitute an arbitrary amino-acid start
or a protein-only export lacking the reference. A short geometric exit is not
presented as an enclosed tunnel, whole-ligand passage, kinetics or binding energy.

Public-data tasks and synchronous name searches use the same fixed HTTPS authorities, certificate validation,
redirect refusal and bounded retries with an optional credential-free proxy.
The managed process forwards only a validated `WB_PUBLIC_DATA_PROXY`, or a
validated credential-free `HTTPS_PROXY` supplied by the application launcher;
the synchronous API uses the same validated application proxy. Other parent
environment values are not forwarded. An explicit empty
`WB_PUBLIC_DATA_PROXY` selects direct access. Proxies with credentials, paths,
queries or fragments fail closed without echoing their supplied value. Archive
files and source receipts remain the original downloaded bytes.

Supporting inputs retain their distinct scientific scope: CHEMBL982109 contains
38 reported cellular STAT6-activation IC50 observations, not direct binding KD;
6WGL contains dupilumab variable domains and IL-4R alpha, a STAT6-pathway target,
not a directly STAT6-binding antibody. Native calculated poses retain their paired
receptor coordinate frame, while minimized unbound study conformers remain separate.
Observed construct sequence indices are distinct from canonical UniProt indices.

Historical examples have an explicit archive profile in
`src/opendde_workbench/examples/catalogue.json`. That collection uses public
BRD4–JQ1, trastuzumab–HER2, ABL inhibitor, MZ1 ternary, RNA–TPP and
HER2 domain IV–Rb-H2 references. The campaign input example combines unchanged
native trastuzumab variable domains with the complete deposited 97-aa HER2
construct from 6LBX. Folding uses both complete 6LBX protein sequences (275 and
97 residues), rather than silently truncating a full-length protein.
Private Boltz projects and customer research data are not used as distributable
examples. Public experimental references, runnable inputs and calculated results
retain distinct identities.

`Use this template` imports checksum-verified inputs into the existing immutable
AssetStore and ScientificStore. It preserves original files, creates traceable
FASTA or SDF collections where required, and pre-fills the module's questionnaire.
It does not submit a design calculation. Interactive atomic inspection uses the
existing native identity adapter. The user reviews the final page before
submitting a calculation.

Every task initially presents fresh uploads or pasted inputs. Historical files
are explicitly selected; loading a template is an opt-in action. The guide maps
each visible capability to bilingual step hints and a result interpretation.
`Example results` renders the retained native task or compound record in the
same module, preserving the user's draft and URL. Embedded questionnaires cannot
submit science while previewing an example. `New blank task` clears the template
and starts from the first page with empty materials.

The example library classifies current pin evidence and its explicitly referenced
source tasks in `example_library_tasks`. Personal task pagination excludes these
rows before LIMIT/OFFSET; native jobs, artifacts, environment records, worker
lifecycle and direct task URLs remain intact. Explicit operator validation IDs can
be classified as `setup_validation` without deleting anything. Names, timestamps
and similarity to a template never classify a user's task. A user's submission
from a template has no inherited example project and remains a personal task.
Example-only projects are omitted from the personal list; projects containing any
personal job remain visible. The current immutable result bundle is unchanged:
classification is derived from its restored pins.

DiffSBDD expert controls follow the pinned sampler's actual mode and model.
Conditional de novo generation does not expose resampling or jump length;
conditional inpainting exposes resampling but not jump length. Diversification
and optimization use their noising steps and starting molecule size. Optimization
shows population, rounds and retained parents instead of an unused candidate
count, with the same 100-attempt budget enforced before questionnaire submission.
The backend parameter groups generate the frontend contract; task and atom
identity remain questionnaire-owned. Historical complete option envelopes stay
readable and unmodified. Generated-result tables retain the native component
count, explicitly warn about disconnected products and keep unknown counts
unknown. Passing fixed-core checks does not establish successful fragment linking.
No components are silently removed to make a molecule appear connected.

REINVENT's native CLI uses the same explicit private Torch cache and non-secret
container username as the OpenFF-based integrations. Numerical task ownership,
read-only scientific inputs, network isolation and tmpfs limits remain in force;
an absent passwd entry for the host UID cannot prevent CLI initialization.
Its reviewed image includes the pinned RDKit drawing libraries. Installation runs
the complete offline, non-root `reinvent --help` entrypoint before publishing the
runtime receipt; successful package installation alone is insufficient. This
readiness check does not load a prior, sample molecules or claim scientific acceptance.

REINVENT's scope and submission steps show the actual selected starting record or
attachment-point scaffolds through the shared native Ketcher renderer. The review
uses the same mode, candidate budget, optimization targets (optimization only),
resources and seed as the submitted request. Editing an earlier step updates that
review. R-group, linker and de novo requests exclude unrelated starting-molecule
references, including fallback material from a template. Chemical scaffold design
does not promise fixed 3D coordinates or establish a binding pose; generated
candidates still need independent structural and property review.
The focused molecular-design workflow keeps real model execution opt-in. Its
`native-reinvent` mode installs the same managed runtime and official priors, then
submits one 20-candidate, CPU-bounded STAT6 scaffold study through the real frontend.
It retains the original request, environment, native files and database snapshot.
This is a computed case awaiting independent review, not an automatic fixed
example or evidence that the owner's local runtime is ready.

Fixed native outcomes reference successful tasks in the same jobs database.
`example_pins` stores the request digest, bound environment-metadata digest and
every retained artifact digest. A fixed example cannot be replaced in place;
changing inputs, settings or results requires a new reviewed revision.
Potential examples also retain every file declared by their sealed native
manifest, including DX grids, PQR charges and solver conditions. Existing pin
records remain byte-identical; verification checks their transitive native file
digests, and portable export includes the complete inventory. A service
response that declares itself unavailable is not a calculated example. Missing
calculations are not replaced with synthetic scores. Fresh installations can
load inputs; viewing calculated outcomes requires retained native results or a
reviewed result bundle. Portable bundles declare their existing study profile
(`archive` or `stat6`), exact catalogue/module revision digest and explicit set
of reviewed capabilities. Current STAT6 task pins require a complete input,
method, native-output, visual and download review before export. Only that
profile's current pin revisions and their typed scientific dependencies are
included; personal jobs, older pins and unfinished tasks are excluded.
Restore verifies the declared profile, scope, source lineage and every native
artifact in isolated state, then merges through the existing stores without
overwriting user data or launching calculations. Older archive bundles retain
their original reviewed compatibility rules.

The `public-stat6-examples` data component installs the reviewed sixteen-module
subset from its immutable checksummed release through the same deployment queue
and restore authority. It does not install scientific engines or run inference.
The subset includes the explicit P2Rank method-limit example, not a claim that
its default candidates reproduce the experimental binding site.
STAT6 exposure templates use the exact registered output of a reviewed receptor
preparation, preserving its input identity and explicit alternate-location choice.
Without that prerequisite the template asks for a prepared receptor instead of
prefilling an unresolved experimental structure as a ready calculation. The
exposure result highlights its measured regions; unrelated ligand contacts are
not its initial presentation.

ProLIF contact results use the same native residue identities and endpoints in
the table, schematic relationship view and 3D chemical annotations. Table exports
preserve full-precision distances and occurrence counts; the original contact
JSON remains downloadable. Legacy results without chemical endpoints retain
their tables and original structures with an explicit unavailable-geometry state;
they do not substitute a different geometric proximity calculation as chemical
analysis. A paired-pose confirmation replaces the empty interaction scope step.

Compound examples point to existing immutable regions, research plans and pose
explorations through `example_record_pins`. Their successful native source tasks
and outputs are sealed with the same evidence checks as task examples. Viewing
a region restores its actual atom map and selectable colored regions. Viewing a
workflow or pose example selects its retained native run and outcomes. Loading
inputs creates a reviewable new questionnaire; it never re-launches the fixed
record. Campaign examples retain native input validation and explicitly state
that agent inference awaits the user's language-model configuration. Validation
is not presented as a completed design campaign.

Preview analysis and aligned display coordinates live in the job's `analysis`
directory. Native `output` is mounted read-only during analysis, so opening a
result cannot change the sealed native artifact inventory. Display caches use
schema 4; legacy schema-3 display caches are preserved during the verified local
migration, outside native output.

PLIP inputs retain their original mmCIF identifiers and source coordinates in
the downloadable structure. For PDB-only native execution, the existing receptor
writer enforces fixed-column bounds; long heterocomponent names receive a
collision-free private alias with an immutable source-reference receipt. This
translation preserves atom names, author numbering, alternate locations and
coordinates at PDB decimal precision. Other PDB-only programs reject untranslated
long component names instead of silently corrupting fields. Native PLIP owns its
configured alternate-location interpretation; format conversion makes no implicit
conformer selection. Geometric distances and chemical contact types remain
distinct from interaction energy or measured binding affinity.
Contact translation reads PLIP's actual atom wrappers for halogen and metal
contacts. Ring centroids and charge centers are checked against their original
participating atoms and residue identities. Native atom-centered functional
groups retain that definition rather than being replaced with a centroid.
The PLIP environment explicitly includes the mmCIF parser. Its dependency repair
retains the existing package builds and SHA256 identities, and installation
probes both PLIP and the structural parser before accepting a runtime receipt.

The existing site-set authority also retains explicitly defined search regions.
Version 1 records remain native P2Rank association evidence. Version 2 records
retain an exact aligned receptor collection and either a reference-ligand search
with explicit frame confirmation or an explicit search box. They have no invented
native rank, probability, association or binding claim. Both record types use the
same immutable site store, mutation/idempotency boundary and existing exploration
workflow; no additional task queue, scientific file authority or database table
is introduced. Existing version-1 request and record bytes remain unchanged.
Reference ligands retain their exact saved SDF record, source checksum and native
coordinates. Defining a search region does not perform docking or establish the
binding site of a different study molecule.

In **Multi-receptor/state pose exploration**, a new task starts with **New search
regions**. Choose an existing aligned receptor collection by its actual source
task name, select qualified members, and define each reference-ligand or manual
region through the four guided pages. The large live structure stays on the
left. Unconfirmed ligand pairs are displayed as a comparison without cross-model
contacts. A manual box is a wireframe in the saved angstrom coordinates; editing
it updates display shapes without reloading or moving molecular atoms. Saving
conditions starts no calculation. Continue into the existing exploration plan
and launch it through the established workflow controls. Historical predicted
pockets and defined regions remain an explicit alternative. The read-only
receptor-choice projection never changes stored ensemble documents or hashes.

Opening an explicitly selected historical pose study restores its saved native
result without launching another run. Pose sets remain paired to their actual
run; changing run history cannot display a different run's structures. The large
structure and result table lead the page, with source choices and completed-run
controls folded away. Repeated searches name their real random seed. A selected
pose can continue directly into independent quality checking with the exact
molecular record and paired receptor. The new questionnaire still requires an
explicit coordinate-frame confirmation and never adds an experimental reference
for a different molecule. The view's native whole-pose docking score follows the
selected pose; it is not a per-residue energy or measured affinity.

Clustering reports **pose groups**, with separate finite-comparison counts for
geometry and mapped contacts. Unavailable contact comparisons remain missing,
not zero similarity. Missing residue correspondences can prevent a contact
comparison even when an unfitted geometric RMSD is available. Group counts alone
do not establish how many physical binding modes exist.

Portable pose studies also retain their existing molecular-state collections,
exact conformer versions and source jobs. The archive uses the platform's
existing state-set table, with no new database authority. Original archives
without that optional table remain unchanged and restore with no declared state
rows. Declared collections must reproduce their successful native preparation
outputs before the atomic import; metadata alone cannot replace missing evidence.
Defined searches add the alignment and actual state-preparation sources to the
example evidence, without inventing pocket-prediction jobs.

PLIP's submission review names the selected original PDB/mmCIF, author ligand
address and resource budget. The shared source review retains its caller's
accepted formats; allowing mmCIF here does not relax PDB-only docking inputs.

Preparation dependencies are explicit. The BRD4 receptor is selected from the
fixed Biopython preparation outcome; antibody variable domains come unchanged
from native ANARCII numbering. Whole-library property and ADMET examples retain
all three ABL inhibitors. Individual ChEMBL MOL responses receive SDF separators
only in the derived collection. Molecular records are not silently merged.

Proposal comparisons use native SolubleMPNN outputs. Their aggregate `loss` is
the mean per-chain negative log probability over designed residues, as declared
in the collection. It is not a binding measurement. The first-two subset and
complete four-proposal collection are identified as subsets of one actual batch.
Unmeasured parent fitness remains missing. Generated identifiers organize
retained native records; they do not invent additional design rounds.

MZ1 region labels identify atoms within 4.5 Å of BRD4 chain A or VHL chain D in
the original 5T35 coordinates. Membership may overlap. Atoms outside that
threshold remain a custom selection, rather than an invented linker or
pharmacophore assignment. The interaction example uses the complete apo 4LYI
receptor aligned to the JQ1-bound 3MXF frame and the original JQ1 pose. This is an
explicit pose hypothesis; it is not relabeled as an experimental apo binding
measurement or a repaired 3MXF crystal structure.

RCSB records retain CC0-1.0 attribution; ChEMBL records retain CC-BY-SA-3.0 terms.
The source manifest gives the exact public archive URL, byte size and SHA-256.
X-DDE's Apache-2.0 license covers its code. Upstream data and model terms are
preserved separately.

The `/api/examples` routes use the platform's existing mutation protection,
scientific storage and task authority. There is no separate scientific queue or
example file authority. Verification targets this feature, changed forms and
their direct consumers. Global regression/scientific suites are not required
or automatically triggered by this work.

### 可移植真实结果 / Portable native results

组件库中的「公开研发案例」下载 `examples-v1/x-dde-public-cases-v1.zip`，
按工作台内固定 SHA-256 验证，在临时状态中检查任务、环境和原始输出，最后事务合入
当前 X-DDE 数据库。当前数据版包含 45 个模块：44 个计算结果，以及 1 个原生校验通过、
尚未运行模型代理的配置示例；50 次原生任务和 44 份必要资产。它包含已有任务的原始
请求、来源、结果及可复用版本，不启动历史任务，也不下载模型。

首次自动安装在编辑器之后安装此小型案例包；组件库也可以手动安装或重新安装。
重复导入保持同一任务与资产身份；任何已有记录或文件不一致都会拒绝覆盖。
卸载组件记录会保留研究资产和历史。数据库整体、用户项目、凭据、日志和模型权重
不属于公开包。RCSB、ChEMBL、UniProt 来源条款分别保留；计算结果不等同实验活性。

`examples/bundle_projection.py` 只沿类型化 ID 和当前修订的固定案例关系选取记录，
不会把备注或名称中的 UUID 当作引用。`bundle_archive.py` 限制大小、数量和路径；
`bundle_restore.py` 负责校验、冲突处理和事务恢复。新案例数据必须创建新数据版本，
更新内容摘要；数据版与 X-DDE 软件版本独立。

### 记录型示例的复核与阶段 / Reviewed record stages

固定探索计划、区域或连续任务时，可以和单任务示例一样保存解读、适用限制及五项明确复核。
原始计划和运行的核心证据保持独立；追加质控或比较结果必须按依赖顺序使用这些真实产物的
确切科学版本，其他输入也必须属于同一来源链。相同文件字节不代表可以替换一个无关版本。
原始结果、复核文字和后续文件均不可就地覆盖；修改示例需要新的案例修订。

任务与记录共用一个研究阶段选择器。原始结果保留所选姿势，查看后续原生报告后可以返回；
默认任务草稿保持不变。解读与限制按需展开，不向研究者展示校验摘要或内部日志。

Job and record examples use the same retained-stage controller. Core run evidence stays separate
from optional follow-up evidence, and verification rechecks the exact computed output versions,
environment and artifact bytes in dependency order. Portable archives retain these native stages,
their review and their asset closure without copying unrelated personal tasks. Legacy pin rows
and archives remain unchanged and readable; a new computed study record requires an explicit
scientific and visual review before export. A plausibility review does not establish binding,
affinity, selectivity or experimental activity.

### 预测参考与原生派生链 / Predicted references and native provenance

多受体探索及其分群模块可使用固定的 AlphaFold DB v6 人 STAT6 参考模型，
以及该模型链 A 的 113–658 片段。完整模型、原始接口响应与截取来源记录均保留精确字节；
片段的 4,306 个原子身份、坐标、占有率和置信度与完整模型对应区域一致。
这是预测参考，不是实验结构，也不是重新计算的模型。其他模板不会默认导入这些可选材料。
公开结构仍遵循 AlphaFold DB 的 CC-BY-4.0 数据条款，与平台代码的 Apache-2.0 分开。

案例来源沿现有科学版本和原生任务关系验证，最多 32 层、64 个源任务。
一个未固定的中间产物必须指向成功任务及其保留的确切输出，并且该任务的所有文件输入
最终都属于案例来源。文件名、备注、成功状态或相同文件字节均不能单独替代派生关系。
已固定上游结果也要重新核对原始证据，循环、缺失环境、来源不明或被改动的文件会被拒绝。
这项验证不启动计算，不修改原始任务或科学版本。

The receptor-comparison study optionally includes the exact AlphaFold DB v6 STAT6 model,
its unchanged chain-A113–658 atom selection, the original API snapshot and source receipt.
These are predicted references, not experimental structures or new calculations. Optional source
files remain in the single study manifest and are not prefilled into unrelated templates.
User-facing source links omit engineering receipts; portable archives retain their exact bytes
and applicable data attribution.

Native provenance uses the existing version, asset and task authorities. Each unpinned derived
version must match an actual retained output of a successful native source job; every source
input must reach the reviewed case roots. Traversal rejects cycles, missing environments,
unqualified derived versions and changed output files, with explicit depth and job budgets.
An explicitly recognized historical STAT6 catalogue is accepted only if reconstructing its
original source and module projection reproduces the published digest exactly. Unknown or
modified catalogues remain invalid; original archives and native rows are never rewritten.

Portable export also retains a minimal, automatically indexed output version when
a follow-up uses the same file through another historical version. The witness
must belong to a selected successful source task and match the exact retained
artifact name and SHA-256. This witness path does not add manual copies or
unrelated or unconsumed versions as case roots. Authored input versions and validation labels,
including `file_integrity_only`, remain unchanged. This preserves the dependency
proof in a clean installation without claiming additional scientific validation.

若后续任务通过不同历史版本使用同一份输出文件，数据包同时保留证明该文件来源所需的
最小原生登记版本。它必须对应选定任务的确切产物名称与摘要；此补充路径不纳入无关文件、
手动副本或未消费的材料版本，也不会改写原任务输入或提升其科学验证等级。

### STAT6 Data 9

当前 STAT6 数据包固定 26 个主模板及 1 个姿势分群子模块，保留 40 个原生任务和
74 份必要资产。多受体探索包含 36 个确切姿势，以及两种分群和三份独立质控的后续阶段。
原生任务分别来自当时已发布的 v0.5.82 / v0.5.83；示例在 v0.5.85 中复核固定，
数据打包不重算原任务。数据包的校验摘要、版本和来源提交由
`examples/stat6_bundle_release.py` 统一指定，旧数据包保持不可变。

The current STAT6 package contains 26 reviewed primary templates and one nested clustering
example, with 40 native tasks and 74 necessary assets. The receptor study retains its exact
36 poses, two grouping analyses and three independent quality reports. It preserves the
original calculation versions, source constructs and missing-contact evidence. Installing or
replaying this package does not launch inference, MD or FEP. These are reviewed computational
examples; the package does not establish experimental binding or publication-ready acceptance.

Stage labels come directly from retained native request names, so researchers can choose an
analysis before loading its full result. Pair-table and heatmap selection identify the same
unfitted overlay without changing the numerical color scale. The final clustering review shows
only the thresholds used by the chosen grouping criterion; original native options remain intact.

### 生成候选的复核 / Reviewing generated candidates

生成结果同时展示实际输出重原子数与输出片段数。使用最大连接片段处理时，页面明确说明
采样目标大小位于片段处理之前；输出连通不证明原始采样完整连通。条件口袋的近接指标
只覆盖输入口袋原子，不能代表完整受体检查。从选中的原生候选可直接进入独立姿势质控，
保留确切的文件、记录、构象、版本及受体；坐标确认和提交仍由新问卷明确完成。

Generation results distinguish output heavy-atom and component counts from the sampling target
before largest-component processing. Pocket proximity covers only conditioning-pocket atoms.
The selected native candidate can open an independent quality questionnaire with its exact
file, record, conformer, version and receptor. This action does not launch computation or
establish binding; researchers must confirm the coordinate context and submit explicitly.
Failed geometry or stereochemical checks preserve the original pose and must not be bypassed
to make an example appear successful.

若恢复的历史任务只有原始文件而尚无共享材料，当前候选提供“准备后续研究材料”入口。
它复用现有、幂等的原生产物登记接口，复核文件摘要、记录与来源任务，并保留选中记录。
登记不是科学计算；失败可重试，切换任务后旧请求不得覆盖新任务的候选。

For restored results without registered inputs, Prepare for follow-up uses the existing
idempotent native-output registration API. It rechecks the original digest and record count,
keeps the selected record, and never launches scientific calculation. Preparation can be
retried after failure; an old response cannot replace another task's selected candidates.

### 完整数据的可移植交付 / Portable full-cohort data

案例传输保留完整的原生数据库和表格，不为适配界面或包大小裁剪成员。当前统一限制为：
每文件 512 MiB、解压后合计 2 GiB、最多 5,000 个文件（包含清单），清单最多 16 MiB。
导出和导入执行相同的限额及路径校验。导出时逐块核对实际写入的字节数和摘要，
源文件增长、缩小或内容改变均不会发布结果包；只在完整关闭 ZIP 后才以不可覆盖方式发布。
旧的清单协议、目录摘要、原生结果、固定版本和来源验证仍然有效。

Transfers retain complete native databases and tables rather than truncating members to fit a
preview or archive. Export and import share bounded limits: 512 MiB per file, 2 GiB total
uncompressed data, 5,000 members including the manifest, and a 16 MiB manifest. Export checks
the exact streamed size and digest, rejecting growing, shortened or altered sources before
publication. Only a fully closed ZIP is published without replacing another caller's target.
Historical manifest schemas, catalogue identities, native results and immutable pins remain
subject to their existing verification. A successful archive copy does not rerun scientific
work or improve its scientific acceptance level.

“DEL 完整研究示例”组件通过现有部署队列，将 Data 2 的库定义、成员结构、读段解码、
UMI 计数及全量富集分析载入当前工作区。组件保留原实验靶点 BRD4、完整的 518,285
个成员、计算方法及限制；安装不要求 DELi 计算环境，不启动推理或其他研究任务。
固定示例从各子模块的“示例结果”入口打开，历史与个人数据保持独立。

The DEL research examples component restores Data 2 through the existing deployment queue
into the active workspace: library definition, member structures, read decoding, UMI counts
and full-cohort enrichment. It preserves the original BRD4 target, all 518,285 observed members,
methods and limitations. Installation needs no DELi calculation environment and launches no
scientific tasks. Each submodule opens its own Example results; personal history is preserved.

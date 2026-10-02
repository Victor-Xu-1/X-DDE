# Public research examples

Each current task module has one explicit entry in the source manifest at
`src/opendde_workbench/examples/catalogue.json`. The collection uses public
BRD4–JQ1, trastuzumab–HER2, ABL inhibitor, MZ1 ternary, RNA–TPP and
HER2 domain IV–Rb-H2 references. The campaign input example combines unchanged
native trastuzumab variable domains with the complete deposited 97-aa HER2
construct from 6LBX. Folding uses both complete 6LBX protein sequences (275 and
97 residues), rather than silently truncating a full-length protein.
Private Boltz projects and customer research data are not used as distributable
examples. Public experimental references, runnable inputs and calculated results
retain distinct identities.

`Load example` imports checksum-verified inputs into the existing immutable
AssetStore and ScientificStore. It preserves original files, creates traceable
FASTA or SDF collections where required, and pre-fills the module's questionnaire.
It does not submit a design calculation. Interactive atomic inspection uses the
existing native identity adapter. The user reviews the final page before
submitting a calculation.

Fixed native outcomes reference successful tasks in the same jobs database.
`example_pins` stores the request digest, bound environment-metadata digest and
every retained artifact digest. A fixed example cannot be replaced in place;
changing inputs, settings or results requires a new reviewed revision. A service
response that declares itself unavailable is not a calculated example. Missing
calculations are not replaced with synthetic scores. Fresh installations can
load inputs; viewing calculated outcomes requires retained native results or a
reviewed result bundle.

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

# STAT6 study templates / STAT6 研究模板

Fold and epitope input preparation requires a reviewed native antibody-numbering
example for the exact deposited 6WGL VH/VL sequences. IMGT region labels are
mapped using their original sequence positions into the native tools' zero-based,
chain-local indices. Epitope preparation also verifies both deposited coordinate
prefixes. The derived annotation remains an immutable input with its numbering
source; editing chains, sequences or CDRs detaches that provenance. Ordinary
compute settings can be adjusted without losing an unchanged annotation.
Missing numbering stays an explicit prerequisite. Existing saved requests,
results and gate failures retain their original evidence; adding CDRs is not
proof of affinity, correct folding or acceptable interface geometry.

折叠与表位模板先读取经过复核、序列完全一致的 6WGL 可变域原生编号。
按原始序列位置将 IMGT 区域转换为后端需要的链内零起始位置；表位模板另核对
两条链的沉积坐标前缀。派生注释保留来源，修改序列、链或 CDR 后解除原注释关联。
缺少编号时明确提示前置条件。旧任务的原始请求、结果和门控判定保持不变；
CDR 注释不能替代亲和力、折叠或界面几何验证。

English · [中文](#中文)

X-DDE's default in-module study templates use human **STAT6 (UniProt P42226)**
and the two user-specified molecules. Choosing **Use this template** imports
the same immutable inputs across modules. It does not launch calculations or
fill the task list with demonstrations. New tasks still start blank by default.

## Real inputs and their purpose

| Input | Purpose | Evidence boundary |
|---|---|---|
| P42226 canonical sequence, 847 aa | Sequence analysis, structure prediction, target/binder setup | The full sequence is distinct from experimental constructs. |
| 9BIG experimental structure and observed receptor | Pocket finding, site selection, reference visualization | 409 observed residues; unresolved gaps remain. |
| AK-1690 from 9BIG, author chain A / residue 701 | Locate a reference site in the matching receptor coordinate frame | Different from both supplied study molecules. |
| 4Y5U experimental structure and observed chain A | Receptor comparisons and structural analysis | Original atom coordinates and residue numbering are retained. |
| 8RQA observed CRBN-midi receptor | CRBN reference for induced proximity research | Modified experimental construct; not a supplied-PROTAC complex. |
| Supplied small molecule | Small-molecule preparation, properties, design and binding studies | Eight ETKDGv3 conformers, followed by converged MMFF94s minimization. |
| Supplied PROTAC | Molecular-region selection and STAT6/CRBN ternary-system setup | Minimized unbound conformer; one unspecified stereocenter remains unresolved. |
| 38 ChEMBL CHEMBL982109 observations and structures | Experimental-data import and molecular-library examples | Reported cellular IC50; assay organism is unreported, not inferred from target identity. |
| 163 curated BindingDB entry 13376 / assay 1 structures | Chemprop pKd training input | One reported STAT6 SPR assay; full-precision Kd retained, with duplicate graphs and unspecified stereo excluded before modelling. |

The user confirmed that `POI` was a label, so the small-molecule SMILES begins
`O=C(CCN1C=CN=N1)…`. Original confirmed SMILES, canonical identity, software
versions, seed, force field, convergence, energies and exact file checksums are
retained with the inputs. These inputs are **not predicted binding poses**.

## How the modules use the study

| Module group | Prepared materials | Additional materials needed |
|---|---|---|
| Target evidence / reference import | STAT6 identity and 9BIG | Consent to query the selected public data source; choose a relevant disease for disease research. |
| Structure prediction / sequence analysis | Canonical STAT6 and supplied small molecule | Select the backend and research settings. |
| Pocket finding / docking / molecular generation | Observed STAT6 receptor, deposited reference site, supplied molecule | Confirm the selected pocket and calculation settings. |
| Molecular states / descriptors / safety / library preparation | Supplied minimized small molecule | Choose the endpoint, processing or screening criteria. |
| Protein/binder design | STAT6 target sequence and observed structure | Actual binder or antibody sequences/scaffolds where required. |
| PROTAC regions / ternary modelling | Supplied PROTAC, STAT6 and CRBN reference structures | Confirm stereochemistry and provide bound-arm poses or supported binding-region inputs. |
| Pose scoring / interactions / dynamics | STAT6 study context and source molecules | A calculated, aligned pose of the supplied molecule; a simulation-ready system for MD. |
| Relative binding free energy | STAT6 study context and supplied small molecule | A second congeneric molecule, comparable binding poses and parameterized systems. |
| High-throughput screening | STAT6 receptor and study-specific guidance | Actual compound library/index and completed upstream results. |
| Experimental evidence | 38 original STAT6 cellular IC50 observations with exact molecule links | Review assay conditions and import the actual table. |
| Learned property model | 163 distinct molecules from one STAT6 SPR assay, with pKd labels | Inspect the actual held-out model errors before reuse; prediction requires a trained model with its endpoint and checksum. |
| DEL | STAT6-specific workflow guidance | Actual library definitions, sequencing reads and selection/control counts are still required. |
| Workflows / pose clustering | STAT6-specific inputs and source-validation rules | Actual study-specific upstream results; archived jobs cannot become STAT6 outputs. |

**Preview study inputs** shows real interactive 3D references, Ketcher 2D
depictions and source downloads. A reference preview is labelled separately
from **Example results**, which requires verified computational evidence.

### Independent quality of the supplied small-molecule pose

The fourth pose-quality template revision uses the supplied study molecule's
first native docking pose against the observed 9BIG protein-only receptor.
It preserves the exact coordinates and the receptor's preparation/alignment
history; the predicted comparison construct remains a provenance input rather
than an experimental structure. PoseBusters 0.6.5 assessed 15 passing checks,
six unassessed water/cofactor checks and one inapplicable double-bond check.
The closest protein heavy-atom distance is 2.905 Å. The native internal-energy
ratio is 1.431, not a binding energy or an affinity measurement.

The interactive preview and downloadable SDF, PDB and report retain the native
files. Unresolved receptor loops, omitted waters and the deposited ARG562
rotamer/GLN590 orientation concerns remain limitations. A geometrically plausible
pose is not an experimentally verified binding mode. Earlier quality-template
revisions and their results remain available without alteration.

**中文：**第四版姿势质控模板使用用户指定小分子的第一个原生对接姿势，搭配
9BIG 实验观测蛋白的准备结构；保留坐标及完整准备、对齐来源。质控有 15 项通过、
6 项水或辅因子检查未评估、1 项不适用，最近蛋白重原子距离为 2.905 Å。
内部能量比 1.431 不是结合能或亲和力。缺失环区、移除的结构水以及 ARG562/GLN590
局部构象疑点仍需后续研究，不能据此声称已验证结合模式。旧版模板和原始结果不变。

The [reviewed result package Data 16](https://github.com/Victor-Xu-1/X-DDE/releases/download/v0.6.9/stat6-reviewed-results-v16.zip)
contains 35 independently reviewed examples: 34 primary task examples and one
nested result stage. It retains 87 scientific files and 62 source-task records,
including historical evidence required for their provenance. Restoring the
package does not enqueue calculations. These remain a subset of the 71 requested
primary non-MD/FEP examples. The SPR training input is prepared separately and
does not become a completed model example until an actual submitted run and
held-out results have been reviewed.
The additional reported-data example imports 38 original cellular IC50 observations;
it does not execute a prediction model or claim a newly validated binding experiment.

### Single-assay SPR modelling input

The source reports 192 STAT6 SPR Kd observations in
[BindingDB entry 13376](https://www.bindingdb.org/rwd/jsp/dbsearch/PrimarySearch_ki.jsp?tag=entry&submit=Search&entryid=13376),
from [US20250340551A1](https://patents.google.com/patent/US20250340551A1/en).
The training input excludes five records with unspecified stereochemistry and
all 24 records involved in 12 duplicate molecular-graph groups. It retains
163 distinct structures and computes `pKd = 9 - log10(Kd in nM)` from the
full-precision public observations. No measurements are averaged or filtered
by model performance; the provenance file retains all 192 source observations.
This is separate from the 38-compound cellular IC50 library.

The reported SPR method uses a human STAT6 aa122–658 His-tag construct and
measurements at 25 °C. The immobilization-buffer pH of 5.5 is not substituted
for the unreported running-buffer pH. A scaffold split is a test of this assay
series, not proof of predictive performance for a different assay or the supplied
warhead/PROTAC. Viewing or loading these inputs does not train a model.

Protein electrostatic calculations use the reviewed protein-only receptor,
explicit PDB2PQR/PROPKA pH-dependent state assignment, and APBS solvent/salt
conditions. Missing loops in the experimental construct are not rebuilt by this
protocol. The downloaded OpenDX grid retains all original bytes; rendering reads
the validated scalar data without treating OpenDX field metadata as potential.

Archived public cases and previous research remain intact. The API defaults to
the STAT6 profile; `?profile=archive` explicitly accesses the original catalogue
and its original immutable result revisions. No BRD4, HER2, TYK2 or synthetic DEL
results are renamed as STAT6 results.

### Sources and data licensing

- [UniProt P42226](https://www.uniprot.org/uniprotkb/P42226): CC BY 4.0.
- [RCSB 9BIG](https://www.rcsb.org/structure/9BIG),
  [4Y5U](https://www.rcsb.org/structure/4Y5U) and
  [8RQA](https://www.rcsb.org/structure/8RQA): CC0 structural data.
- User-provided molecular definitions: `LicenseRef-User-Provided`; no independent
  third-party rights or experimental activity are asserted. The project's
  Apache-2.0 software license does not relicense research inputs.
- BindingDB-curated SPR observations and molecular definitions: CC-BY-3.0-US,
  with BindingDB, patent and data DOI `10.7270/Q2ZC87P0` attribution retained.
- ChEMBL cellular-assay observations: CC-BY-SA-3.0, retaining the assay identity,
  original values, source activity IDs and molecule records.

## 中文

X-DDE 各模块默认使用 **人 STAT6（P42226）及用户指定的两份分子**作为研究模板。
点击“使用此模板”只导入真实材料，不自动递交计算任务。新任务仍默认从新材料开始。

- **小分子**：按用户确认去掉 `POI` 标记，保留其余原始 SMILES。三维文件来自
  ETKDGv3 构象生成与已收敛的 MMFF94s 最小化，不是二维平面或结合姿势。
- **PROTAC**：使用用户指定结构，提供已最小化的未结合态构象。原输入有一个未指定
  手性中心，保留该不确定性，不擅自确认唯一 R/S 构型。
- **口袋与结合模式**：STAT6 受体使用真实实验结构。口袋参考使用 9BIG 中同坐标系的
  AK-1690 姿势；AK-1690 与指定分子不同，不混用其结合结果。
- **三元体系**：提供 STAT6、CRBN 参考结构及指定 PROTAC；结合端姿势、区域和手性
  必须在实际计算前确认。
- **抗体、DEL、FEP、动力学等模块**：有真实材料就预填，缺少的抗体序列、实测数据、
  同系列第二个分子或计算姿势明确提示补齐，不借用其他靶点的数据。

“查看研究材料”提供真实 2D、3D 和文件下载。“示例结果”只在有可验证的真实结果时
显示。旧 BRD4 等案例保留在历史资料中，不会改名为 STAT6 结果。

[已核对结果包 Data 16](https://github.com/Victor-Xu-1/X-DDE/releases/download/v0.6.9/stat6-reviewed-results-v16.zip)
包含 35 项已独立复核示例：34 个主任务示例和 1 个嵌套结果阶段，保留 87 个科学文件和
62 条来源任务记录。恢复不会排队计算；这些示例仍是所需 71 个非动力学/FEP 主任务示例的
一部分，各模块保留各自的方法限制和结果解释。
新增的实测数据示例导入 38 条原始细胞 IC50 观测，不执行预测模型，也不宣称完成新的结合实验。

**性质模型训练输入**使用 BindingDB entry 13376 / assay 1 中单一 STAT6 SPR 实验的数据。
192 条原始 Kd 记录中，排除 5 条未指定手性记录，以及 12 组重复分子结构涉及的全部 24 条记录，
得到 163 个不同分子。使用完整精度的原始 Kd（nM）换算 `pKd = 9 - log10(Kd)`，
不平均冲突记录，不按模型表现选择样本；来源文件保留全部 192 条原始观测及排除原因。
此数据与原有 38 个分子的细胞 IC50 数据分别保存。

该 SPR 方法使用人 STAT6 aa122–658 His-tag 构建体，在 25 °C 测量；固定蛋白所用缓冲液的
pH 5.5 不能充当未报告的运行缓冲液 pH。载入模板不触发训练。只有实际递交、检查原生模型的
保留测试集误差并复核后，才能将其固定为完成的模型示例；不能据此宣称已知指定研究小分子或
PROTAC 的实测亲和力。BindingDB 数据保留 CC-BY-3.0-US 与来源署名；ChEMBL 数据保留
CC-BY-SA-3.0。

公开结构数据、UniProt 序列、用户提供的分子定义分别保留来源和许可；
软件 Apache-2.0 许可不替代研究数据本身的许可。

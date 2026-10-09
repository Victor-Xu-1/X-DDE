# STAT6 study templates / STAT6 研究模板

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
| DEL / experimental evidence / learned property model | STAT6-specific workflow guidance | Real definitions, reads, counts, assays or validated endpoint models. |
| Workflows / pose clustering | STAT6-specific inputs and source-validation rules | Actual study-specific upstream results; archived jobs cannot become STAT6 outputs. |

**Preview study inputs** shows real interactive 3D references, Ketcher 2D
depictions and source downloads. A reference preview is labelled separately
from **Example results**, which requires verified computational evidence.

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

公开结构数据、UniProt 序列、用户提供的分子定义分别保留来源和许可；
软件 Apache-2.0 许可不替代研究数据本身的许可。

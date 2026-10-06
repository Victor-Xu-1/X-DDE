# 公开供应商结构文件与接入覆盖

X-DDE v0.4.30，资源审查日期 2026-10-07。35 个供应商条目均可通过正式公开下载或用户合法持有的结构文件接入。已实际下载、逐文件核对归档和 SDF 摘要的资源来自 9 家供应商，共 16 份文件、3,841,777 条原始 SDF 记录。归档约 1.3 GiB，展开结构约 11.5 GiB。

这些数量是文件中的原始记录数，包含分卷、砌块与可能跨库重叠的结构，不是去重后的可筛选分子数，也不表示当前供应商库存。公开结构文件不包含本平台生成的六模型向量；分子库准备和索引需要另行执行。

## 已取得的真实文件

| 供应商 | 文件范围 | 文件数 | 原始记录数 | 实际货号字段 |
| --- | --- | ---: | ---: | --- |
| [ChemDiv](https://www.chemdiv.com/pub/) | 2026.09 筛选整库四分卷及砌块集合 | 5 | 1,755,554 | 筛选 `IDNUMBER`；砌块 `idnumber` |
| [ASINEX](https://www.asinex.com/screening-libraries) | 2025 全筛选结构文件 | 1 | 646,981 | `ID_NUMBER` |
| [BIONET / Key Organics](https://www.keyorganics.net/downloads-bionet-databases/) | 2026.08 完整集合 | 1 | 353,398 | `Cmpdid` |
| [Alinda](https://alindachemical.com/bases_en.html) | 2024.12 两类筛选目录（三文件）及 2025.03 砌块 | 4 | 752,864 | `IDNumber` |
| [OTAVA](https://www.otavachemicals.com/products/compound-libraries-for-hts/drug-like-green-collection) | Drug-Like Green 子库 | 1 | 169,658 | `Code` |
| [Eximed](https://eximedlab.com/libraries.html) | 公开筛选集合 | 1 | 61,554 | `ID` |
| [ARONIS](https://aronis.ru/databases.html) | 公开库存目录快照 | 1 | 26,848 | `ID` |
| [Princeton BioMolecular](https://www.princetonbio.com/products/organic_bbl) | 芳香族砌块子库 | 1 | 24,100 | `ID` |
| [ChemRar](https://mol.chemrar.ru/diversity-libraries) | MCE-18 多样性子库 | 1 | 50,820 | `IDNUMBER` |

ChemRar 文件包含 ChemDiv 货号和链接；它是单独发布的子库来源，不能与 ChemDiv 整库简单相加后声称新增独有分子。砌块集合也不是已经合成的 DEL 完整化学成员。

完整下载 URL、ZIP 成员、原始字节数、SHA-256、文件货号字段与审查日期只在唯一的 `src/opendde_workbench/datasets/public_resources.json` 中定义。wheel 发布元数据和下载适配器，不再分发这些供应商的原始结构数据。供应商自行更新同名文件时会触发摘要不一致；管理员应审查新修订后更新资源清单，不能绕过校验。

## 用户操作

1. 在“高通量筛选 → 分子库管理”选择“公开结构库”。上传新文件仍是默认选项。
2. 选择明确的供应商文件。未安装时使用“下载公开结构文件”，或在“安装与组件”部署“供应商公开结构文件”；统一组件目录继续管理下载。
3. 文件可用后自动填入供应商和对应 SDF 货号字段，按问卷确认并提交分子库准备。切换到未下载的文件会清空旧选择。
4. 准备结果保留原始编号、拒绝记录、化学身份、供应商来源及重复货号。通过结构检查后再建立快速筛选索引。
5. 在高通量筛选中明确选择已完成的索引，填写靶点和口袋，再检索并对重点候选进行对接。ChemDiv 整库的四个分卷分别准备和索引后可在同次查询中一起选用。

DEL 条码、连接规则、样本与对照仍由对应 DEL 问卷明确输入，不从供应商筛选目录推断。后续化学有效性、代表性和实验验证沿用 [高通量与 DEL 方法边界](screening-and-del.md)。

## 35 个目录条目的当前覆盖

“文件已取得”仅表示上表范围；“未取得”不表示供应商没有数据，也不表示已经测试所有账户授权方案。未确认的供应商身份不关联猜测的官方网站。所有条目保留已有 SDF、CSV、TSV、SMILES 及其受支持 GZIP 格式的合法文件导入。

| 条目 | 当前来源与取得状态 |
| --- | --- |
| MCE comp | [官方库目录](https://www.medchemexpress.com/screening-libraries.html)；公开页面提供下载入口，本轮未取得可直接验证的完整结构文件 |
| AA Blocks | [官方入口](https://www.aablocks.com/index)；未取得公开结构文件 |
| AlchemEco | 供应商身份/当前下载入口未确认；导入合法已有文件 |
| Alinda Chemical | 文件已取得，范围见上表 |
| AnalytiCon | [官方库下载说明](https://ac-discovery.com/screening-library-downloads/)；结构数据按其申请方式获取 |
| AnyMole | [官方入口](https://www.anymole.com/)；未取得公开结构文件 |
| Apollo | 原目录名称不能单独确认当前供应商身份；导入合法已有文件 |
| Aronis | 文件已取得，范围见上表 |
| Asinex | 文件已取得，范围见上表 |
| BIONET-Key Organics | 文件已取得，范围见上表 |
| ChemBridge | [官方入口](https://chembridge.com/)；完整结构目录需按供应商请求流程获取 |
| ChemDiv | 已取得官方公开目录全部四个筛选整库分卷和一份砌块文件 |
| Chemical Block | [官方入口](https://www.chemical-block.com/)；页面所列旧数据库/筛选下载链接当前返回 404 |
| ChemRar | 文件已取得，范围见上表 |
| Enamine | [官方筛选集合](https://enamine.net/compound-collections/screening-collection)；结构下载进入供应商登录流程 |
| EvoBlocks | 当前官方下载入口未确认；导入合法已有文件 |
| Eximed | 文件已取得，范围见上表 |
| FCH Group | 目录身份与当前官方直接下载入口未确认；导入合法已有文件 |
| HTS Biochemie Innovationen | [官方筛选页面](https://www.hts-biochemie.de/hts-en/produkte/screening-compounds.php?navid=349675349675)；未取得公开结构文件 |
| Innovapharm | [官方入口](https://innovapharm.com.ua/)；未取得公开结构文件 |
| InterBioScreen | [官方数据库](https://www.ibscreen.com/bases)；结构下载需要登录 |
| LabNetwork | 当前官方结构下载入口未确认；导入合法已有文件 |
| Leadgen Labs | [官方入口](https://www.leadgenlabs.com/)；未取得公开结构文件 |
| Life Chemicals | [官方公开下载目录](https://lifechemicals.com/downloads)；整库下载请求返回账户/供应商申请流程，未提交联系信息 |
| Maybridge | [Thermo Fisher 官方页面](https://www.thermofisher.com/sa/en/home/industrial/pharma-biopharma/drug-discovery-development/screening-compounds-libraries-hit-identification/maybridge-fragment-libraries.html)；本轮未取得可验证结构文件 |
| Menai Organics | [官方入口](https://menaiorganics.com/index.html)；本轮直接读取返回 403 |
| Otava | 文件已取得，范围见上表 |
| PharmaBlock | [官方下载页](https://usa.pharmablock.com/download.html)；页面未提供可取得的结构文件 |
| Pharmeks | [官方入口](https://www.pharmeks.com/prod.shtml)；本轮证书校验失败，未绕过 TLS 校验 |
| Princeton BioMolecular Research | 芳香族砌块文件已取得；筛选整库通过其 [目录申请](https://princetonbio.com/request_catalog) 获取 |
| Specs | [官方入口](https://www.specs.net/)；账户/目录下载流程，未取得公开整库 |
| TargetMol | [官方库页面](https://www.targetmol.com/compound-library/bioactive_compound_library)；本轮连接超时，未取得可验证结构文件 |
| TimTec | [官方下载说明](https://www.timtec.net/faqs/general/faqs.html)明确数据库下载需注册并通过认证 |
| UkrOrgSynthesis | 当前官方结构下载入口未确认；导入合法已有文件 |
| Vitas-M | [官方结构文件请求入口](https://vitasmlab.biz/create-sdf)；未提交申请，未取得可验证结构文件 |

下载权限不代替数据再分发许可，结构库不代替采购库存查询，模型检索分数不代替实验亲和力。需要账户或供应商批准的数据由用户取得合法文件后，通过同一入口接入。

## 安装与验证契约

公开文件沿用平台唯一部署队列、可续传下载和 AssetStore。安装核对 ZIP 摘要、确切成员大小、完整 SDF 摘要和分块上传证据；仅接受安全、未加密、无链接的 ZIP 成员。文件通过完整 UTF-8/原始字节检查后登记。科学解析和去重仍由独立 RDKit 准备任务执行。

暂停或失败只清除当前操作的临时解压副本，保留已核对下载、已登记原始资产与可续传的上传段。重新安装使用相同内容身份，不产生重复资产；卸载文件组件保留研究原始文件。`WB_DATASET_FILE_BYTES` 与 `WB_DATASET_QUOTA_BYTES` 继续限制数据登记。清单摘要不一致时不会在前端展示为可选已安装文件。

专项契约覆盖 ZIP 路径拒绝、部署/登记/卸载、暂停续传、文件预算、SDF 货号预览和显式文件选择。独立服务器检查另从真实供应商归档抽取每文件三个原始分子，执行原生库准备并核对非空货号；代表性样本通过不能表示 384 万条记录全部通过化学检查。本机只执行资源传输、完整性、安装和页面检查，未进行模型推理。

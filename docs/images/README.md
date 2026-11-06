# 项目介绍图片

[中文介绍](../../README.md) · [English overview](../../README.en.md)

## 实际软件页面

### 后续 CI 截图

以下图片保留各自的实际版本，未重新绘制。完整提交关系、归档校验和、输入来源和科学边界见[2026-11-06 截图核验](../readme-verification-2026-11-06.md)。

| 图片 | 版本 | 展示内容 |
| --- | --- | --- |
| [calculation-plan-v0.7.93.png](calculation-plan-v0.7.93.png) | 历史 v0.7.93 | Boltz-2 计算计划，未运行预测 |
| [material-inputs-v0.7.96.png](material-inputs-v0.7.96.png) | v0.7.96 | 真实材料选择，双记录夹具重复同一输入 |
| [sequence-input-v0.7.96.png](sequence-input-v0.7.96.png) | v0.7.96 | 6WGL 可变域输入，尚未确认 |
| [job-review-v0.7.98.png](job-review-v0.7.98.png) | 与 v0.7.98 源码树一致 | STAT6 序列与未提交的 Mol-1 计划 |
| [docking-review-v0.7.98.png](docking-review-v0.7.98.png) | 与 v0.7.98 源码树一致 | 9BIG 受体、已有姿势记录与搜索框，未运行新对接 |
| [ternary-review-v0.7.98.png](ternary-review-v0.7.98.png) | 与 v0.7.98 源码树一致 | 独立两端材料与条件性手性假设，未计算三元装配 |

### 历史 v0.4.53 页面

下表七张图片重新截取自实际运行的 X-DDE **v0.4.53 英文界面**，使用公开研究输入与保留的原生计算结果。截图未经重新绘制，没有替换图片文字，也没有加入虚构数字或生成的分子结构。中英文介绍引用的历史页面均使用英文界面截图。

软件来源：[提交 1231425](https://github.com/Victor-Xu-1/X-DDE/commit/1231425a333c0924d35c229084e9e2924cbe38fe)、[对应发行版](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.4.53)。本组截图通过软件语言设置切换到 English 后直接采集，并逐图检查。使用既有公开案例，没有再次启动模型或安装组件。图中的安装状态是真实实例的状态。原生案例的先前浏览器验证见 [v0.4.49 案例检查](https://github.com/Victor-Xu-1/X-DDE/actions/runs/37722758677)；三维接触和相机更新另经 [v0.4.53 专项检查](https://github.com/Victor-Xu-1/X-DDE/actions/runs/37738860843)，这些检查与本次截图采集分别记录。

| 图片 | 展示内容 | 身份 |
| --- | --- | --- |
| [guided-task.jpg](guided-task.jpg) | BRD4–JQ1 的分步目的选择 | 任务输入模板，未提交计算 |
| [structure-and-pocket.jpg](structure-and-pocket.jpg) | BRD4–JQ1 结构预测、表格与三维预览 | 归档的原生模型结果 |
| [molecule-properties.jpg](molecule-properties.jpg) | 三个 ABL 抑制剂的二维、三维与 ADMET 终点 | 归档的原生模型结果 |
| [screening-candidates.jpg](screening-candidates.jpg) | 177 个公开研究分子的口袋条件检索 | 归档检索结果；所示三维为游离构象 |
| [del-enrichment.jpg](del-enrichment.jpg) | UNCDEL006–BRD4 计数与富集 | 公开实验数据的原生分析结果 |
| [antibody-template.jpg](antibody-template.jpg) | 曲妥珠单抗可变域序列与 CDR | 经校验的输入模板，未运行新的抗体设计 |
| [component-management.jpg](component-management.jpg) | 统一安装目录和组件用途管理 | 实际环境管理界面，非所有组件均已安装 |

各案例的原始材料与结果关系见[公开研究案例](../design/research-examples.md)。截图保留原始显示；哈希、源截图名称与类型记录在 [provenance.json](provenance.json)。

## 架构与研究流程插图

`platform-architecture.png`、`connected-research.png` 与英文流程图 `connected-research-en.png` 使用内置 imagegen 制作，并按现有平台职责和输入输出关系人工检查。它们是架构说明，**不是运行页面或实验结果**。

架构图区分研究工作台、X-DDE 平台后端、执行/部署适配器和独立科学环境。研究流程图展示可衔接的研究材料；每一步仍需要实际输入、方案审阅和适用的原生工具，不表示所有流程自动执行或具有同样的科学有效性。

## English

The six later CI images are listed separately above, with version-specific provenance and input-only scientific limits in the [verification record](../readme-verification-2026-11-06.md). The v0.7.98-source images share the release's complete Git tree but were captured on its PR merge ref, not the release commit. None is a new scientific calculation.

The seven original interface images in the historical table are direct captures of the running v0.4.53 application after selecting **English** in its language settings. Historical interface images referenced by either README use these English-language captures. Screenshot text and scientific content were not repainted or replaced. Native results, unbound conformers, input-only design examples and actual installation states remain distinct. Existing public cases were inspected without running new inference or installing components. Capture revision and prior automated validation are recorded separately in the provenance file.

The three infographic assets explain architecture and research flow; they are not application screenshots or experimental results. File identities, capture language and roles are recorded in [provenance.json](provenance.json).

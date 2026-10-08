# 项目介绍图片

[中文介绍](../../README.md) · [English overview](../../README.en.md)

## 实际软件页面

这些图片重新截取自实际运行的 X-DDE **v0.4.53 英文界面**，使用公开研究输入与保留的原生计算结果。截图未经重新绘制，没有替换图片文字，也没有加入虚构数字或生成的分子结构。中英文介绍均引用同一组英文软件截图。

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

All seven interface images are direct captures of the running v0.4.53 application after selecting **English** in its language settings. Both complete README versions use these English interface captures. Screenshot text and scientific content were not repainted or replaced. Native results, unbound conformers, input-only design examples and actual installation states remain distinct. Existing public cases were inspected without running new inference or installing components. Capture revision and prior automated validation are recorded separately in the provenance file.

The three infographic assets explain architecture and research flow; they are not application screenshots or experimental results. File identities, capture language and roles are recorded in [provenance.json](provenance.json).

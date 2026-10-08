# 项目介绍图片

[返回项目介绍](../../README.md)

## 实际软件页面

这些图片直接来自 X-DDE **v0.4.49** 的真实 Chromium 页面检查，使用公开研究输入与保留的原生计算结果。截图未经重新绘制，没有加入虚构数字或生成的分子结构。

来源：[提交 0d8d29e](https://github.com/Victor-Xu-1/X-DDE/commit/0d8d29e00b03462adef31d90bf359ad85b7646f4)、[浏览器检查](https://github.com/Victor-Xu-1/X-DDE/actions/runs/37722758677)、[对应发行版](https://github.com/Victor-Xu-1/X-DDE/releases/tag/v0.4.49)。图中的环境状态是截图服务的状态；查看已归档计算结果不等于再次运行模型。

| 图片 | 展示内容 | 身份 |
| --- | --- | --- |
| [guided-task.jpg](guided-task.jpg) | BRD4–JQ1 的分步目的选择 | 任务输入模板，未提交计算 |
| [structure-and-pocket.jpg](structure-and-pocket.jpg) | BRD4–JQ1 结构预测、表格与三维预览 | 归档的原生模型结果 |
| [molecule-properties.jpg](molecule-properties.jpg) | 三个 ABL 抑制剂的二维、三维与 ADMET 终点 | 归档的原生模型结果 |
| [screening-candidates.jpg](screening-candidates.jpg) | 177 个公开研究分子的口袋条件检索 | 归档检索结果；所示三维为游离构象 |
| [del-enrichment.jpg](del-enrichment.jpg) | UNCDEL006–BRD4 计数与富集 | 公开实验数据的原生分析结果 |
| [antibody-template.png](antibody-template.png) | 曲妥珠单抗可变域序列与 CDR | 经校验的输入模板，未运行新的抗体设计 |
| [component-management.png](component-management.png) | 统一安装目录和组件用途管理 | 实际环境管理界面，非所有组件均已安装 |

各案例的原始材料与结果关系见[公开研究案例](../design/research-examples.md)。截图保留原始显示；哈希、源截图名称与类型记录在 [provenance.json](provenance.json)。

## 架构与研究流程插图

`platform-architecture.png` 和 `connected-research.png` 使用内置 imagegen 制作，并按现有平台职责和输入输出关系人工检查。它们是架构说明，**不是运行页面或实验结果**。

架构图区分研究工作台、X-DDE 平台后端、执行/部署适配器和独立科学环境。研究流程图展示可衔接的研究材料；每一步仍需要实际输入、方案审阅和适用的原生工具，不表示所有流程自动执行或具有同样的科学有效性。

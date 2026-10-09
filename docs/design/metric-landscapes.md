# Molecular and sequence landscapes / 分子与序列指标分布

The existing `MetricScatter` boundary now uses X-DDE's shared native Plotly renderer. Properties, ADMET, conformer energies, sequence scores, designed candidates and held-out model results share hover, zoom, pan, reset and physical figure export. No additional chart engine, scientific task queue or model execution is introduced.
原有 `MetricScatter` 接入共享原生 Plotly 图表。性质、ADMET、构象能量、序列评分、设计候选和留出集结果共用悬停、缩放、平移、重置和图件导出，不新增图表引擎或科学任务队列。

Coordinate pairs retain source ordering, zero and signed values. Incomplete pairs are omitted without filling missing values. Native point clicks resolve their original row; the keyboard-accessible record selector uses the original source index. View changes never rewrite molecular identities, chemical states, sequences or observations.
坐标保留原始顺序、零值和正负号；缺失数值不填零。点击数据点定位原记录，键盘选择使用原始编号，视图变化不修改分子、状态、序列或观测数据。

Observed/predicted comparisons use matching axis ranges and an identity line. Native values are not normalized or converted into confidence, affinity or risk percentages. Source labels remain literal text at native chart boundaries. A reference line never acts as a selectable scientific record.
观测与预测比较使用相同轴范围及等值线，不把原始数值转换为置信度、亲和力或风险百分比。标签按文字显示，参考线不作为研究记录被选中。

Acceptance uses frozen native ABL, conformer, ProteinMPNN and ESM outputs. The generic model-comparison display additionally uses an explicitly controlled API contract when no retained native training output is available. Controlled display checks are not native training or scientific accuracy acceptance. No new scientific computation is performed for visual layout.
检查复用冻结的 ABL、构象、ProteinMPNN 和 ESM 原生结果；缺少保留训练结果的通用模型比较页使用明确标注的受控接口检查，不表述为真实训练或科学准确性验收。

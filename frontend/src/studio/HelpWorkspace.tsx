import type { Language } from "../types";
export function HelpWorkspace({
  language,
  onStart,
}: {
  language: Language;
  onStart(): void;
}) {
  const zh = language === "zh";
  const steps = zh
    ? [
        ["选任务", "从左侧选择靶点、结构、口袋、生成或性质任务。"],
        ["准备材料", "上传新文件或粘贴序列。首次可点击“使用此模板”。"],
        ["选择方案", "优先使用推荐方案；需要时切换专家模式。"],
        ["确认提交", "核对输入和服务调用，在最后一步提交。"],
        ["查看结果", "比较表格与三维预览；“示例结果”可先看效果。"],
      ]
    : [
        [
          "Choose a task",
          "Choose target research, structures, pockets, generation or properties from the sidebar.",
        ],
        [
          "Provide inputs",
          "Upload a new file or paste a sequence. For a first visit, choose Use this template.",
        ],
        [
          "Choose settings",
          "Start with recommended settings; use Expert mode for adjustments.",
        ],
        [
          "Review & submit",
          "Check inputs and service calls before submitting at the last step.",
        ],
        [
          "Inspect results",
          "Compare tables and 3D views; Example results shows what to expect.",
        ],
      ];
  return (
    <section className="utility-page help-workspace">
      <h1 className="sr-only">{zh ? "帮助中心" : "Help"}</h1>
      <div className="guide-grid">
        {steps.map(([title, note], i) => (
          <div className="studio-panel" key={title}>
            <h3>
              {i + 1} · {title}
            </h3>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <details className="help-science-notes">
        <summary>
          {zh
            ? "输入和结果需要注意什么？"
            : "What should I check in inputs and results?"}
        </summary>
        <ul>
          <li>
            {zh
              ? "问号提供术语解释；每次只填写当前一步。历史文件需要主动选择。"
              : "Question marks explain terms. Fill one step at a time; historical files are opt-in."}
          </li>
          <li>
            {zh
              ? "三维显示调整不会改变分子坐标。对接和相互作用分析需要正确的坐标参照。"
              : "Display changes preserve coordinates. Docking and interaction analyses need a valid coordinate frame."}
          </li>
          <li>
            {zh
              ? "性质、置信度和模型分数是研究线索，不能替代活性或安全性实验。"
              : "Properties, confidence and model scores guide research; they do not replace activity or safety experiments."}
          </li>
        </ul>
      </details>
      <button className="primary-button" onClick={onStart}>
        {zh ? "选择研究任务" : "Choose a research task"}
      </button>
    </section>
  );
}

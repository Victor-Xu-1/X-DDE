import {
  DeploymentUnitOutlined,
  EyeOutlined,
  BarChartOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import type { Language } from "../types";
const actions = [
  {
    id: "input",
    icon: DeploymentUnitOutlined,
    label: ["开始结构预测", "Start a prediction"],
    note: [
      "选类型、填输入，参数已有推荐方案",
      "Choose inputs and a ready-to-use preset",
    ],
  },
  {
    id: "viewer",
    icon: EyeOutlined,
    label: ["查看三维结构", "Inspect 3D structures"],
    note: [
      "拖动旋转，点击原子或残基查看说明",
      "Rotate and select atoms or residues",
    ],
  },
  {
    id: "analysis",
    icon: BarChartOutlined,
    label: ["比较预测构象", "Compare conformers"],
    note: [
      "同一任务内查看分数和结构差异",
      "Compare confidence and geometry within a task",
    ],
  },
  {
    id: "reports",
    icon: DownloadOutlined,
    label: ["导出结果", "Export results"],
    note: [
      "下载结构、结果表格和说明报告",
      "Download structures, tables and reports",
    ],
  },
] as const;
export function Capabilities({
  language,
  onChoose,
}: {
  language: Language;
  onChoose(value: (typeof actions)[number]["id"]): void;
}) {
  const i = language === "zh" ? 0 : 1;
  return (
    <div className="capability-grid">
      {actions.map((item) => (
        <button
          className="capability-card"
          key={item.id}
          onClick={() => onChoose(item.id)}
        >
          <span className="capability-icon">
            <item.icon />
          </span>
          <span>
            <strong>{item.label[i]}</strong>
            <small>{item.note[i]}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

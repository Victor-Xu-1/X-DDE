export function DELCountUnit({
  value,
  onChange,
  imported,
  zh,
}: {
  value: string;
  onChange(value: string): void;
  imported: boolean;
  zh: boolean;
}) {
  return (
    <label className="field">
      {zh ? "计数来源" : "Count unit"}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="corrected_umi">
          {zh ? "纠错后的 UMI" : "Corrected UMIs"}
        </option>
        <option value="unique_umi">{zh ? "独立 UMI" : "Unique UMIs"}</option>
        <option value="reads">{zh ? "原始读段" : "Raw reads"}</option>
        <option value="reported_counts" disabled={!imported}>
          {zh ? "外部报告计数" : "Externally reported counts"}
        </option>
      </select>
      {value === "reported_counts" && (
        <span className="field-help" role="status">
          {!imported
            ? zh
              ? "请为此原生计数结果选择实际计算的计数类型。"
              : "Choose the count type actually computed for this native result."
            : zh
              ? "保留原报告值；处理方法和 UMI 准确性尚未独立核实。区间只反映假设的计数模型。"
              : "Reported values are retained; processing and UMI accuracy are not independently verified. Intervals reflect an assumed count model only."}
        </span>
      )}
    </label>
  );
}

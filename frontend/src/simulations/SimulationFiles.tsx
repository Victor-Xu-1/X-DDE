import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
export function SimulationFiles({
  job,
  files,
  language,
}: {
  job: Job;
  files: Record<string, string>;
  language: Language;
}) {
  const zh = language === "zh";
  const label = (name: string) => {
    const repeat = name.match(/^repeat-(\d+)/)?.[1];
    const prefix = repeat ? `${zh ? "重复" : "Repeat"} ${repeat} · ` : "";
    if (name.endsWith(".dcd"))
      return prefix + (zh ? "完整轨迹 · DCD" : "Full trajectory · DCD");
    if (name.endsWith("-stability.csv"))
      return prefix + (zh ? "稳定性数据 · CSV" : "Stability data · CSV");
    if (name.endsWith("-thermodynamics.csv"))
      return (
        prefix +
        (zh ? "温度、势能与体积 · CSV" : "Temperature, energy and volume · CSV")
      );
    if (name.endsWith(".chk"))
      return prefix + (zh ? "计算检查点" : "Simulation checkpoint");
    if (name.endsWith("-state.xml"))
      return (
        prefix +
        (zh ? "可移植模拟状态 · XML" : "Portable simulation state · XML")
      );
    if (name.endsWith("-simulation.zip"))
      return (
        (zh ? "原始 FEP 采样" : "Raw FEP sampling") +
        " · " +
        name.replace("-simulation.zip", "")
      );
    if (name === "binding-free-energies.csv")
      return zh
        ? "自由能与误差表 · CSV"
        : "Free energies and uncertainty · CSV";
    if (name.endsWith(".graphml"))
      return zh ? "分子变化网络 · GraphML" : "Perturbation network · GraphML";
    if (name === "solvated-system.pdb")
      return zh ? "含溶剂的完整体系 · PDB" : "Complete solvated system · PDB";
    if (name === "protein.pdb")
      return zh ? "研究蛋白 · PDB" : "Study protein · PDB";
    return name;
  };
  return (
    <details className="simulation-method">
      <summary>{zh ? "下载研究数据" : "Download research data"}</summary>
      <div className="download-actions">
        {Object.keys(files)
          .filter(
            (name) =>
              !/-frame-/.test(name) &&
              /\.(dcd|chk|pdb|xml|sdf|csv|graphml|zip|json)$/.test(name),
          )
          .map((name) => (
            <a
              className="secondary-button"
              key={name}
              href={artifactUrl(job.id, name)}
              download
            >
              {label(name)} ↓
            </a>
          ))}
      </div>
    </details>
  );
}

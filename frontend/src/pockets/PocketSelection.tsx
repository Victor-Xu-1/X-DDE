import type { Language } from "../types";
import type { Site } from "./types";

/** Keep the selected native residues and the next research actions together. */
export function PocketSelection({
  site,
  proteinArtifact,
  language,
  onGenerate,
  onDock,
}: {
  site: Site;
  proteinArtifact: string;
  language: Language;
  onGenerate(): void;
  onDock(): void;
}) {
  const zh = language === "zh";
  const pdb = proteinArtifact.endsWith(".pdb");
  const usable =
    pdb &&
    !!site.residues.length &&
    site.residues.every(
      (r) => r.chain.length === 1 && !r.insertion_code && !r.alternate_location,
    );
  return (
    <section
      className="pocket-selection"
      aria-label={zh ? "所选口袋" : "Selected pocket"}
    >
      <header>
        <h3>
          {zh ? "口袋" : "Pocket"} {site.rank}
        </h3>
        <span>
          {site.residues.length} {zh ? "个残基" : "residues"}
        </span>
      </header>
      <details className="pocket-residues">
        <summary>{zh ? "查看口袋残基" : "Inspect pocket residues"}</summary>
        <ul aria-label={zh ? "口袋残基" : "Pocket residues"}>
          {site.residues.map((r, index) => (
            <li
              key={`${r.model}:${r.chain}:${r.number}:${r.insertion_code}:${r.alternate_location}:${index}`}
              title={`${zh ? "模型" : "Model"} ${r.model}${r.alternate_location ? ` · ${zh ? "替代位置" : "Alternate location"} ${r.alternate_location}` : ""}`}
            >
              {r.chain}:{r.number}
              {r.insertion_code}
            </li>
          ))}
        </ul>
      </details>
      <div className="pocket-next-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={!usable}
          onClick={onGenerate}
        >
          {zh ? "用这个口袋生成分子" : "Generate molecules in this pocket"}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!pdb}
          onClick={onDock}
        >
          {zh ? "探索这个口袋的结合模式" : "Explore poses in this pocket"}
        </button>
      </div>
      {!usable && (
        <p className="field-help">
          {zh
            ? "分子生成需要 PDB、单字符链标识和无歧义残基编号。请先准备结构并保留残基对应关系。"
            : "Molecule generation needs PDB, single-character chains and unambiguous residue numbering. Prepare the structure while preserving residue mappings."}
        </p>
      )}
    </section>
  );
}

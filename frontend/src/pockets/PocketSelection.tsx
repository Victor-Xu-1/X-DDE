import { referenceKey } from "../diffsbdd/model";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { Site } from "./types";

/** Keep the selected native residues and the next research actions together. */
export function PocketSelection({
  site,
  proteinArtifact,
  protein,
  coordinatesMatch,
  hasValidBox,
  language,
  onGenerate,
  onDock,
}: {
  site: Site;
  proteinArtifact: string;
  protein: MoleculeRef;
  coordinatesMatch: boolean;
  hasValidBox: boolean;
  language: Language;
  onGenerate(): void;
  onDock(): void;
}) {
  const zh = language === "zh";
  const pdb = proteinArtifact.endsWith(".pdb");
  const residues = site.residues;
  const source = referenceKey(protein);
  const exactSource =
    coordinatesMatch &&
    residues.every((residue) => referenceKey(residue.structure) === source);
  const usable =
    pdb &&
    exactSource &&
    residues.length >= 1 &&
    residues.length <= 250 &&
    new Set(residues.map((r) => `${r.chain}:${r.number}`)).size ===
      residues.length &&
    residues.every(
      (r) =>
        r.model === 0 &&
        /^[A-Za-z0-9]$/.test(r.chain) &&
        Number.isSafeInteger(r.number) &&
        !r.insertion_code &&
        !r.alternate_location,
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
          disabled={!pdb || !coordinatesMatch || !hasValidBox}
          onClick={onDock}
        >
          {zh ? "探索这个口袋的结合模式" : "Explore poses in this pocket"}
        </button>
      </div>
      {!coordinatesMatch ? (
        <p className="field-help" role="status">
          {zh
            ? "口袋残基与此受体来源不一致。请回到原始口袋结果核对。"
            : "The pocket residues do not match this receptor source. Check the original pocket result."}
        </p>
      ) : !exactSource ? (
        <p className="field-help" role="status">
          {zh
            ? "分子生成需要残基与受体来自同一文件版本。"
            : "Molecule generation requires residues from the exact receptor file version."}
        </p>
      ) : (
        !usable && (
          <p className="field-help">
            {zh
              ? "分子生成需要 PDB 中 1–250 个互不重复、编号明确的残基，链标识须为单个字母或数字。"
              : "Molecule generation needs 1–250 unique, unambiguous PDB residues with single-letter or single-digit chain IDs."}
          </p>
        )
      )}
    </section>
  );
}

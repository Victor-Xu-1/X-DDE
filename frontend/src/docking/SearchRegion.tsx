import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { BoxFields } from "./BoxFields";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { SearchPreview } from "./SearchPreview";
import { Hint } from "../guided/Hint";
import { parseBox } from "./model";
import type { SearchBox } from "./types";
export function SearchRegion({
  language,
  receptor,
  kind,
  onKind,
  reference,
  onReference,
  center,
  onCenter,
  size,
  onSize,
}: {
  language: Language;
  receptor: MoleculeRef | null;
  kind: "reference" | "box";
  onKind(v: "reference" | "box"): void;
  reference: MoleculeRef | null;
  onReference(v: MoleculeRef | null): void;
  center: string[];
  onCenter(v: string[]): void;
  size: string[];
  onSize(v: string[]): void;
}) {
  const zh = language === "zh";
  let box: SearchBox | undefined;
  if (kind === "box") {
    try {
      box = parseBox(center, size, language);
    } catch {
      // During editing, clear any box whose fields are no longer complete.
    }
  }
  return (
    <section>
      <StructureWorkbench
        preview={
          kind === "box" && receptor ? (
            <SearchPreview
              key={[
                receptor.asset_id,
                receptor.sha256,
                receptor.version_id,
                receptor.record,
              ].join(":")}
              receptor={receptor}
              language={language}
              onCenter={onCenter}
              box={box}
            />
          ) : null
        }
      >
        <label className="field">
          {zh ? "在哪里搜索？" : "Where should the search run?"}
          <select
            value={kind}
            onChange={(event) =>
              onKind(event.target.value as "reference" | "box")
            }
          >
            <option value="reference">
              {zh ? "围绕一个已有口袋配体" : "Around a known pocket ligand"}
            </option>
            <option value="box">
              {zh
                ? "指定受体坐标中的搜索范围"
                : "Define a box in receptor coordinates"}
            </option>
          </select>
        </label>
        {kind === "reference" ? (
          <ReferencePicker
            kind="ligand"
            label={zh ? "参考口袋配体" : "Reference pocket ligand"}
            value={reference}
            onChange={onReference}
            language={language}
          />
        ) : (
          <>
            <BoxFields
              language={language}
              center={center}
              onCenter={onCenter}
              size={size}
              onSize={onSize}
            />
          </>
        )}
        <Hint label={zh ? "搜索范围说明" : "Search-region help"}>
          {zh
            ? "坐标以所选受体版本为参照，单位为 Å。搜索盒是 GNINA 的搜索区域，不等于暴露、出口或全分子的硬约束。修改受体后须重新确认。"
            : "Coordinates are in this receptor version's frame, in Å. A GNINA search box is not a hard exposure/pathway/full-molecule constraint. Reconfirm when changing receptors."}
        </Hint>
      </StructureWorkbench>
    </section>
  );
}

import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { Hint } from "../guided/Hint";
export function SearchRegion({
  language,
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
  return (
    <section>
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
        <div className="operation-grid">
          {["X", "Y", "Z"].map((axis, index) => (
            <div key={axis}>
              <label className="field">
                {zh ? "中心" : "Center"} {axis} (Å)
                <input
                  type="number"
                  value={center[index]}
                  step="0.1"
                  onChange={(event) =>
                    onCenter(
                      center.map((v, n) =>
                        n === index ? event.target.value : v,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                {zh ? "边长" : "Length"} {axis} (Å)
                <input
                  type="number"
                  min={4}
                  max={100}
                  value={size[index]}
                  onChange={(event) =>
                    onSize(
                      size.map((v, n) =>
                        n === index ? event.target.value : v,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
      )}
      <Hint label={zh ? "搜索范围说明" : "Search-region help"}>
        {zh
          ? "坐标以所选受体版本为参照，单位为 Å。搜索盒是 GNINA 的搜索区域，不等于暴露、出口或全分子的硬约束。修改受体后须重新确认。"
          : "Coordinates are in this receptor version's frame, in Å. A GNINA search box is not a hard exposure/pathway/full-molecule constraint. Reconfirm when changing receptors."}
      </Hint>
    </section>
  );
}

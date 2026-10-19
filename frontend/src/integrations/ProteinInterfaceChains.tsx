import { useState } from "react";
import { StructureViewer } from "../viewer/StructureViewer";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";

export interface InterfaceInput {
  id: string;
  source: MoleculeRef | null;
  label: string;
  fileName: string;
  chains: string[];
}

export function ProteinInterfaceChains({
  inputs,
  language,
  target,
  binder,
  onTarget,
  onBinder,
  onChains,
}: {
  inputs: InterfaceInput[];
  language: Language;
  target: string[];
  binder: string[];
  onTarget(value: string[]): void;
  onBinder(value: string[]): void;
  onChains(id: string, source: MoleculeRef, chains: string[]): void;
}) {
  const zh = language === "zh";
  const [selected, setSelected] = useState(inputs[0]?.id ?? "");
  const active = inputs.find((i) => i.id === selected) ?? inputs[0];
  const chains =
    inputs[0]?.chains.filter((chain) =>
      inputs.every((i) => i.chains.includes(chain)),
    ) ?? [];
  function toggle(
    values: string[],
    chain: string,
    update: (v: string[]) => void,
  ) {
    update(
      values.includes(chain)
        ? values.filter((v) => v !== chain)
        : [...values, chain],
    );
  }
  return (
    <>
      {inputs.length > 1 && (
        <label>
          {zh ? "预览复合物" : "Preview complex"}
          <select
            value={active?.id}
            onChange={(e) => setSelected(e.target.value)}
          >
            {inputs.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <StructureWorkbench
        preview={
          active?.source && (
            <StructureViewer
              key={active.id + active.source.sha256}
              sourceSnapshot
              urls={["/api/assets/" + active.source.asset_id]}
              language={language}
              onSceneLoaded={(scene) =>
                onChains(active.id, active.source!, [
                  ...new Set(scene.residues.map((residue) => residue.chain)),
                ])
              }
            />
          )
        }
      >
        <p className="field-help">
          {zh
            ? "选择两侧的蛋白链。多个复合物使用同一组链标识。"
            : "Choose the two protein partners. Compared complexes use the same chain identifiers."}
        </p>
        {inputs.map((i) =>
          i.chains.length === 0 && i.source ? (
            <button type="button" key={i.id} onClick={() => setSelected(i.id)}>
              {zh ? "读取结构中的链：" : "Read chains in: "}
              {i.label}
            </button>
          ) : null,
        )}
        {[
          {
            label: zh ? "靶蛋白" : "Target protein",
            values: target,
            other: binder,
            update: onTarget,
          },
          {
            label: zh ? "结合伙伴" : "Binding partner",
            values: binder,
            other: target,
            update: onBinder,
          },
        ].map(({ label, values, other, update }, index) => (
          <fieldset key={index}>
            <legend>{label}</legend>
            {chains.map((chain) => (
              <label key={chain} className="inline-fields">
                <input
                  type="checkbox"
                  checked={values.includes(chain)}
                  disabled={other.includes(chain)}
                  onChange={() => toggle(values, chain, update)}
                />
                {zh ? "链 " : "Chain "}
                {chain}
              </label>
            ))}
          </fieldset>
        ))}
        {!chains.length && (
          <p role="status">
            {zh
              ? "读取所有复合物后，显示可比较的蛋白链。"
              : "Read each complex to see its shared chain identifiers."}
          </p>
        )}
      </StructureWorkbench>
    </>
  );
}

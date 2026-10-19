import { useState } from "react";
import type { MoleculeRef } from "../research/types";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Language } from "../types";
import { ChainMappings } from "./ChainMappings";
import type { ComparisonOptions } from "./types";

type Side = "reference" | "moving";
const referenceKey = (value: MoleculeRef | null) =>
  value ? value.asset_id + ":" + value.sha256 : "";
export function ComparisonMappingStep({
  inputs,
  options,
  language,
  onChange,
}: {
  inputs: Record<Side, MoleculeRef | null>;
  options: ComparisonOptions;
  language: Language;
  onChange(value: ComparisonOptions): void;
}) {
  const zh = language === "zh",
    [preview, setPreview] = useState<Side>("reference");
  const [chainEvidence, setChainEvidence] = useState<
    Partial<Record<Side, { source: string; chains: string[] }>>
  >({});
  const chains = { reference: [] as string[], moving: [] as string[] };
  for (const side of ["reference", "moving"] as const)
    if (chainEvidence[side]?.source === referenceKey(inputs[side]))
      chains[side] = chainEvidence[side]!.chains;
  const chosen = inputs[preview];
  return (
    <StructureWorkbench
      preview={
        <>
          <div className="comparison-preview-actions">
            {(["reference", "moving"] as const).map((side) => (
              <button
                key={side}
                type="button"
                className="secondary-button"
                aria-pressed={preview === side}
                onClick={() => setPreview(side)}
              >
                {side === "reference"
                  ? zh
                    ? "参照原始文件"
                    : "Reference source"
                  : zh
                    ? "比较原始文件"
                    : "Comparison source"}
              </button>
            ))}
          </div>
          {chosen && (
            <StructureViewer
              key={preview + referenceKey(chosen)}
              sourceSnapshot
              language={language}
              urls={["/api/assets/" + encodeURIComponent(chosen.asset_id)]}
              onSceneLoaded={(scene) =>
                setChainEvidence((previous) => ({
                  ...previous,
                  [preview]: {
                    source: referenceKey(chosen),
                    chains: [...new Set(scene.residues.map((r) => r.chain))],
                  },
                }))
              }
            />
          )}
        </>
      }
    >
      <p className="field-help">
        {zh
          ? "选择蛋白链：靶蛋白用于对齐，伙伴用于比较；两种角色不能重复。"
          : "Map protein chains: fit the target and evaluate the partner. Their roles must not overlap."}
      </p>
      <ChainMappings
        title={zh ? "靶蛋白（用于对齐）" : "Target (alignment)"}
        language={language}
        value={options.target_mapping}
        chains={chains}
        onChange={(target_mapping) => onChange({ ...options, target_mapping })}
      />
      <ChainMappings
        title={zh ? "伙伴蛋白（用于比较）" : "Partner (comparison)"}
        language={language}
        value={options.partner_mapping}
        chains={chains}
        onChange={(partner_mapping) =>
          onChange({ ...options, partner_mapping })
        }
      />
    </StructureWorkbench>
  );
}

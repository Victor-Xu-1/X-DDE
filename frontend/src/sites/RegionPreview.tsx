import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import type { SearchBoxGeometry } from "../viewer/search-box";

export function RegionPreview({
  receptor,
  reference,
  confirmed,
  box,
  language,
  onCenter,
}: {
  receptor: MoleculeRef | null;
  reference?: MoleculeRef | null;
  confirmed: boolean;
  box?: SearchBoxGeometry;
  language: Language;
  onCenter?(v: string[]): void;
}) {
  if (!receptor) return null;
  const sources = [receptor, ...(reference ? [reference] : [])];
  return (
    <>
      <StructureViewer
        sourceSnapshot
        urls={sources.map((r) => `/api/assets/${r.asset_id}`)}
        records={sources.map((r) => r.record)}
        language={language}
        comparison={Boolean(reference) && !confirmed}
        ligandContext={Boolean(reference) && confirmed}
        initialMode={reference && confirmed ? "pocket" : "cartoon"}
        {...(reference && confirmed ? { focusModel: 1 } : {})}
        searchBox={box}
        selectionMode={onCenter ? "atom" : undefined}
        onAtomSelected={
          onCenter
            ? (selection) => {
                if (selection?.position?.every(Number.isFinite))
                  onCenter(selection.position.map(String));
              }
            : undefined
        }
      />
      {onCenter && (
        <p className="field-help">
          {language === "zh"
            ? "点击原子可设置搜索中心；这只定义范围，不代表发现了结合位点。"
            : "Click an atom to set the search center; this defines a region, not a discovered binding site."}
        </p>
      )}
    </>
  );
}

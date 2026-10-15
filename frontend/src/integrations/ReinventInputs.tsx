import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { ScientificPayload } from "./types";
import {
  reinventModes,
  usesStartingMolecule,
  usesScaffoldOrigin,
  usesMolecularInput,
} from "./reinvent-modes";

export function ReinventInputs({
  language,
  payload,
  onChange,
  ligand,
  onLigand,
}: {
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  ligand: MoleculeRef | null;
  onLigand(value: MoleculeRef | null): void;
}) {
  const zh = language === "zh";
  const starting = usesStartingMolecule(payload);
  return (
    <>
      <label className="field">
        {zh ? "想怎样设计分子？" : "How would you like to design molecules?"}
        <select
          value={String(payload.mode)}
          onChange={(event) => {
            const mode = event.target.value;
            const selectedSource =
              usesMolecularInput(payload) && Boolean(ligand);
            const carrySource = mode === "r_groups" && selectedSource;
            onChange({ mode, validate_scaffold_origin: carrySource });
            if (
              !carrySource &&
              !(usesStartingMolecule({ ...payload, mode }) && selectedSource)
            )
              onLigand(null);
          }}
        >
          {reinventModes.map(([value, cn, en]) => (
            <option key={value} value={value}>
              {zh ? cn : en}
            </option>
          ))}
        </select>
      </label>
      {starting ? (
        <ReferencePicker
          kind="ligand"
          value={ligand}
          onChange={onLigand}
          language={language}
          label={zh ? "选择起始分子" : "Choose starting molecule"}
          allowedSuffixes={[".sdf", ".mol"]}
        />
      ) : (
        payload.mode !== "de_novo" && (
          <label className="field">
            {zh ? "片段结构（每行一个）" : "Fragment structures (one per line)"}
            <Hint label={zh ? "连接位点说明" : "Attachment point help"}>
              {zh
                ? "使用 * 标记要连接或替换的位置；连接子设计需要两个片段。"
                : "Mark attachment positions with *. Linker design requires two fragments."}
            </Hint>
            <textarea
              aria-label={
                zh
                  ? "片段结构（每行一个）"
                  : "Fragment structures (one per line)"
              }
              rows={4}
              value={
                Array.isArray(payload.fragments)
                  ? payload.fragments.join("\n")
                  : ""
              }
              onChange={(event) =>
                onChange({
                  fragments: event.target.value.split(/\r?\n/).filter(Boolean),
                })
              }
            />
          </label>
        )
      )}
      {payload.mode === "r_groups" && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={usesScaffoldOrigin(payload)}
              onChange={(event) => {
                onChange({ validate_scaffold_origin: event.target.checked });
                if (!event.target.checked) onLigand(null);
              }}
            />
            {zh ? "核对骨架来源分子" : "Verify the scaffold's source molecule"}
          </label>
          {usesScaffoldOrigin(payload) && (
            <ReferencePicker
              kind="ligand"
              value={ligand}
              onChange={onLigand}
              language={language}
              label={zh ? "骨架来源分子" : "Scaffold source molecule"}
              allowedSuffixes={[".sdf", ".mol"]}
            />
          )}
        </>
      )}
    </>
  );
}

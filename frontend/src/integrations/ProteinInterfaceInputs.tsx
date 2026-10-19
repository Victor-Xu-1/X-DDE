import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { InterfaceInput } from "./ProteinInterfaceChains";

export function ProteinInterfaceInputs({
  inputs,
  language,
  onLabel,
  onSource,
  onAdd,
  onRemove,
}: {
  inputs: InterfaceInput[];
  language: Language;
  onLabel(id: string, value: string): void;
  onSource(id: string, value: MoleculeRef | null): void;
  onAdd(): void;
  onRemove(id: string): void;
}) {
  const zh = language === "zh";
  return (
    <>
      {inputs.map((input, index) => (
        <section key={input.id} className="scientific-component-input">
          <label>
            {zh ? "复合物名称" : "Complex name"}
            <input
              value={input.label}
              maxLength={80}
              required
              onChange={(e) => onLabel(input.id, e.target.value)}
            />
          </label>
          <ReferencePicker
            kind="structure"
            wholeFile
            allowedSuffixes={[".pdb", ".cif"]}
            value={input.source}
            label={zh ? `复合物 ${index + 1}` : `Complex ${index + 1}`}
            language={language}
            onChange={(value) => onSource(input.id, value)}
          />
          {inputs.length > 1 && (
            <button type="button" onClick={() => onRemove(input.id)}>
              {zh ? "移除此复合物" : "Remove this complex"}
            </button>
          )}
        </section>
      ))}
      {inputs.length < 3 && (
        <button type="button" onClick={onAdd}>
          {zh ? "添加比较结构" : "Add comparison complex"}
        </button>
      )}
    </>
  );
}

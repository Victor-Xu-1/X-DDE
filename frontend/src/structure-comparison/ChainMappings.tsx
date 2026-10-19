import { useId } from "react";
import type { Language } from "../types";
import type { ChainMapping } from "./types";

export function ChainMappings({
  title,
  value,
  onChange,
  chains,
  language,
}: {
  title: string;
  value: ChainMapping[];
  onChange(value: ChainMapping[]): void;
  chains: { reference: string[]; moving: string[] };
  language: Language;
}) {
  const zh = language === "zh",
    id = useId();
  return (
    <section className="comparison-chain-mappings" aria-label={title}>
      <h3>{title}</h3>
      {value.map((pair, index) => (
        <div className="comparison-chain-row" key={index}>
          {(["reference", "moving"] as const).map((side) => (
            <label className="field" key={side}>
              {(side === "reference"
                ? zh
                  ? "参照链"
                  : "Reference chain"
                : zh
                  ? "比较链"
                  : "Comparison chain") + ` ${index + 1}`}
              <input
                value={pair[side]}
                list={`${id}-${side}`}
                maxLength={8}
                required
                autoComplete="off"
                onChange={(event) =>
                  onChange(
                    value.map((row, i) =>
                      i === index
                        ? { ...row, [side]: event.target.value }
                        : row,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="text-button"
            disabled={value.length === 1}
            aria-label={(zh ? "移除对应 " : "Remove mapping ") + (index + 1)}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            {zh ? "移除" : "Remove"}
          </button>
        </div>
      ))}
      {(["reference", "moving"] as const).map((side) => (
        <datalist key={side} id={`${id}-${side}`}>
          {chains[side].map((chain) => (
            <option key={chain} value={chain} />
          ))}
        </datalist>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={value.length >= 4}
        onClick={() => onChange([...value, { reference: "", moving: "" }])}
      >
        {zh ? "添加一组链对应" : "Add a chain mapping"}
      </button>
    </section>
  );
}

import { useId } from "react";
import type { Language } from "../types";
import { AssetPicker } from "./AssetPicker";
import {
  ChainEditor,
  JsonEditor,
  MutablePositions,
  PositionInput,
} from "./ScientificInputs";
import { Hint } from "../guided/Hint";
import type { FieldSpec } from "./harness-fields";

export function HarnessField({
  field,
  payload,
  onChange,
  language,
  tool,
}: {
  field: FieldSpec;
  payload: Record<string, unknown>;
  onChange(v: unknown): void;
  language: Language;
  tool: string;
}) {
  const inputId = useId();
  const zh = language === "zh",
    value = payload[field.key],
    label = field.label[zh ? 0 : 1];
  if (field.kind === "choice")
    return (
      <label className="field">
        {label}
        <select
          value={String(value)}
          onChange={(e) =>
            onChange(
              field.choices?.find((c) => String(c.value) === e.target.value)
                ?.value,
            )
          }
        >
          {field.choices?.map((c) => (
            <option key={String(c.value)} value={String(c.value)}>
              {c.label[zh ? 0 : 1]}
            </option>
          ))}
        </select>
      </label>
    );
  if (field.kind === "asset")
    return (
      <AssetPicker
        kind={field.assetKind ?? "structure"}
        label={label}
        value={String(value ?? "").replace(/^asset:/, "")}
        onChange={(id) => onChange(id ? "asset:" + id : "")}
        language={language}
      />
    );
  if (field.kind === "assets") {
    const values = (value ?? []) as string[];
    return (
      <section>
        <h4>{label}</h4>
        {[...values, ...(values.length < 3 ? [""] : [])].map((id, i) => (
          <div key={i}>
            <AssetPicker
              kind="structure"
              label={`${zh ? "结构" : "Structure"} ${i + 1}`}
              value={id.replace(/^asset:/, "")}
              onChange={(v) =>
                onChange([
                  ...values.slice(0, i),
                  ...(v ? ["asset:" + v] : []),
                  ...values.slice(i + 1),
                ])
              }
              language={language}
            />
          </div>
        ))}
      </section>
    );
  }
  if (field.kind === "chains")
    return (
      <ChainEditor
        value={value as Record<string, string>}
        onChange={onChange}
        language={language}
        label={label}
      />
    );
  if (field.kind === "positions") {
    const positions = Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(payload.parent_chains as object).map((chain) => [
            chain,
            (value as string[])
              .filter((v) => v.startsWith(chain + ":"))
              .map((v) => Number(v.split(":").pop())),
          ]),
        )
      : ((value ?? {}) as Record<string, number[]>);
    return (
      <MutablePositions
        chains={payload.parent_chains as Record<string, string>}
        value={positions}
        onChange={(v) =>
          onChange(
            tool === "mpnn"
              ? Object.entries(v).flatMap(([chain, positions]) =>
                  positions.map((p) => `${chain}:${p}`),
                )
              : v,
          )
        }
        language={language}
      />
    );
  }
  if (field.kind === "cdr") {
    const groups = (value ?? {}) as Record<string, Record<string, number[]>>;
    return (
      <section>
        <h4>{label}</h4>
        <p className="small">
          {zh
            ? "这里输入从 1 开始的序列位置，提交时转换为零起始位置。"
            : "Enter sequence positions starting at 1; they are converted to zero-based indices."}
        </p>
        {((payload.antibody_chains ?? []) as string[]).map((chain) => (
          <div key={chain}>
            {["CDR1", "CDR2", "CDR3"].map((cdr) => (
              <PositionInput
                key={cdr}
                label={`${chain} · ${cdr}`}
                value={groups[chain]?.[cdr] ?? []}
                onChange={(v) =>
                  onChange({
                    ...groups,
                    [chain]: { ...groups[chain], [cdr]: v },
                  })
                }
              />
            ))}
          </div>
        ))}
      </section>
    );
  }
  if (field.kind === "json")
    return <JsonEditor label={label} value={value ?? {}} onChange={onChange} />;
  const text = Array.isArray(value)
    ? value.join(field.kind === "chain-list" ? ", " : "\n")
    : String(value ?? "");
  return (
    <div className="field">
      <span>
        <label htmlFor={inputId}>{label}</label>{" "}
        {field.help && (
          <Hint label={label + (zh ? "说明" : " help")}>
            {field.help[zh ? 0 : 1]}
          </Hint>
        )}
      </span>
      {field.kind === "sequence" || field.kind === "lines" ? (
        <textarea
          id={inputId}
          required={field.required}
          value={text}
          rows={5}
          spellCheck={false}
          maxLength={200000}
          onChange={(e) =>
            onChange(
              field.kind === "lines"
                ? e.target.value.split(/\r?\n/)
                : e.target.value.replace(/\s/g, "").toUpperCase(),
            )
          }
        />
      ) : (
        <input
          id={inputId}
          required={field.required}
          type={field.kind === "number" ? "number" : "text"}
          step={field.kind === "number" ? "any" : undefined}
          min={field.min}
          max={field.max}
          value={text}
          onChange={(e) =>
            onChange(
              field.kind === "number"
                ? Number(e.target.value)
                : field.kind === "chain-list"
                  ? e.target.value.split(/[,，\s]+/).filter(Boolean)
                  : e.target.value,
            )
          }
        />
      )}
    </div>
  );
}

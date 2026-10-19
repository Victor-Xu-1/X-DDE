import { useEffect, useRef } from "react";
import { useSelectedAsset } from "../operations/useSelectedAsset";
import { referenceKey } from "../research/input-catalog";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { InterfaceInput } from "./ProteinInterfaceChains";

function SourceFile({
  input,
  language,
  onVerified,
}: {
  input: InterfaceInput;
  language: Language;
  onVerified(source: MoleculeRef, valid: boolean): void;
}) {
  const source = input.source;
  const metadata = useSelectedAsset(
    source?.asset_id ?? "",
    "structure",
    [".pdb", ".cif"],
    25 * 1024 ** 2,
    null,
  );
  const valid = Boolean(source && metadata.asset?.sha256 === source.sha256);
  const key = source ? referenceKey(source) : "";
  const callback = useRef(onVerified);
  callback.current = onVerified;
  useEffect(() => {
    if (source) callback.current(source, valid);
  }, [key, valid]);
  const zh = language === "zh";
  return (
    <tr>
      <td>{input.label}</td>
      <td>
        {valid ? (
          metadata.asset!.name
        ) : metadata.loading ? (
          zh ? (
            "正在核对文件…"
          ) : (
            "Verifying file…"
          )
        ) : (
          <>
            <span role="alert">
              {zh ? "请重新核对所选文件。" : "Verify the selected source file."}
            </span>
            <button type="button" onClick={metadata.retry}>
              {zh ? "重新核对文件" : "Retry file verification"}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

export function ProteinInterfaceReview({
  inputs,
  language,
  name,
  onName,
  target,
  binder,
  onVerified,
}: {
  inputs: InterfaceInput[];
  language: Language;
  name: string;
  onName(value: string): void;
  target: string[];
  binder: string[];
  onVerified(source: MoleculeRef, valid: boolean): void;
}) {
  const zh = language === "zh";
  return (
    <>
      <label>
        {zh ? "任务名称" : "Task name"}
        <input
          value={name}
          maxLength={80}
          required
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      <table>
        <thead>
          <tr>
            <th>{zh ? "复合物" : "Complex"}</th>
            <th>{zh ? "研究文件" : "Research file"}</th>
          </tr>
        </thead>
        <tbody>
          {inputs.map((input) => (
            <SourceFile
              key={input.id}
              input={input}
              language={language}
              onVerified={onVerified}
            />
          ))}
        </tbody>
      </table>
      <p>
        {zh ? "靶蛋白链" : "Target chains"}: {target.join(", ")} ·{" "}
        {zh ? "伙伴链" : "Partner chains"}: {binder.join(", ")}
      </p>
      <p className="field-help">
        {zh
          ? "保留原始坐标和已记录的修饰残基，分析全部原生接触；距离与接触数量不是结合能或亲和力。"
          : "Analyze native contacts in the original coordinate frame, retaining deposited residue modifications. Contact distances and counts are not binding energies or affinity."}
      </p>
    </>
  );
}

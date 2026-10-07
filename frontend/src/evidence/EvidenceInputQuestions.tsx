import { AssetPicker } from "../operations/AssetPicker";
import { Hint } from "../guided/Hint";
import type { EvidenceDraft } from "./useEvidenceDraft";
import type { Endpoint, EvidenceInput } from "./types";
import {
  ColumnFields,
  ConditionFields,
  endpoints,
  endpointUnits,
} from "./EvidenceFields";
export function EvidenceSourceQuestion({ draft: d }: { draft: EvidenceDraft }) {
  return (
    <>
      <AssetPicker
        kind="measurements"
        maxBytes={16 * 1024 ** 2}
        value={d.file}
        onChange={d.changeFile}
        language={d.language}
        label={d.zh ? "实验 CSV 表格" : "Experimental CSV table"}
      />
      <label className="field">
        {d.zh ? "表格分隔符" : "Column separator"}
        <select
          value={d.delimiter}
          onChange={(e) =>
            d.setDelimiter(e.target.value as EvidenceInput["delimiter"])
          }
        >
          <option value=",">{d.zh ? "逗号（CSV）" : "Comma (CSV)"}</option>
          <option value="\t">{d.zh ? "制表符" : "Tab"}</option>
          <option value=";">{d.zh ? "分号" : "Semicolon"}</option>
        </select>
      </label>
      {d.loading && (
        <p role="status">{d.zh ? "正在读取列名…" : "Reading column names…"}</p>
      )}
      {d.names.length > 0 && (
        <ColumnFields
          columns={d.columns}
          names={d.names}
          language={d.language}
          onChange={d.setColumns}
        />
      )}
    </>
  );
}
export function EvidenceConditionsQuestion({
  draft: d,
}: {
  draft: EvidenceDraft;
}) {
  return (
    <>
      <div className="evidence-fields">
        <label className="field">
          {d.zh ? "实测终点" : "Reported endpoint"}
          <select
            required
            value={d.endpoint}
            onChange={(e) => {
              const value = e.target.value as Endpoint | "";
              d.setEndpoint(value);
              d.setUnit(endpointUnits(value)[0]);
            }}
          >
            <option value="">
              {d.zh ? "请选择终点" : "Choose an endpoint"}
            </option>
            {endpoints.map((e) => (
              <option key={e} value={e}>
                {e === "qualitative"
                  ? d.zh
                    ? "定性报告"
                    : "Qualitative report"
                  : e === "expression"
                    ? d.zh
                      ? "表达量"
                      : "Expression"
                    : e === "inhibition"
                      ? d.zh
                        ? "抑制率"
                        : "Inhibition"
                      : e}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {d.zh ? "原始单位" : "Reported unit"}
          <select value={d.unit} onChange={(e) => d.setUnit(e.target.value)}>
            {endpointUnits(d.endpoint).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <ConditionFields
        value={d.conditions}
        language={d.language}
        onChange={d.setConditions}
      />
      <label className="field">
        {d.zh
          ? "数据来源（报告、实验记录或文献）"
          : "Reported source (report, experiment record or reference)"}
        <textarea
          required
          value={d.citation}
          onChange={(e) => d.setCitation(e.target.value)}
          rows={2}
        />
      </label>
      <Hint label={d.zh ? "为什么需要条件？" : "Why are conditions required?"}>
        {d.zh
          ? "仅按同终点和已报告条件分组；未报告条件是否一致仍需核实。"
          : "Group by matched endpoints and reported conditions. Unreported conditions remain unverified."}
      </Hint>
    </>
  );
}

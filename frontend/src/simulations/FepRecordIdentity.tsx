import type { Language } from "../types";
import type { FepRecord } from "./fep-series";

export function fepRecordName(record: FepRecord, language: Language) {
  return (
    record.name || (language === "zh" ? "未命名分子" : "Untitled molecule")
  );
}

/** Keep the source title verbatim; the ordinal distinguishes repeated titles. */
export function FepRecordIdentity({
  record,
  language,
}: {
  record: FepRecord;
  language: Language;
}) {
  return (
    <span className="simulation-record-identity">
      <span>{fepRecordName(record, language)}</span>
      <small>
        {language === "zh" ? "原始序号" : "Record"} {record.record + 1}
      </small>
    </span>
  );
}

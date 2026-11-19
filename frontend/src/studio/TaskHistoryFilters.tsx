import { CalendarOutlined } from "@ant-design/icons";
import { useId, useState } from "react";
import { translator } from "../i18n";
import type { Language, Status } from "../types";
import { historyKindLabel, historyStatuses } from "./task-history-model";
import { TaskHistoryDatePicker } from "./TaskHistoryDatePicker";
export function TaskHistoryFilters({
  language,
  type,
  status,
  query,
  kinds,
  onType,
  onStatus,
  onQuery,
  startDate,
  endDate,
  onStartDate,
  onEndDate,
  onClear,
  filtered,
}: {
  language: Language;
  type: string;
  status: Status | "all";
  query: string;
  kinds: string[];
  onType(value: string): void;
  onStatus(value: Status | "all"): void;
  onQuery(value: string): void;
  startDate: string;
  endDate: string;
  onStartDate(value: string): void;
  onEndDate(value: string): void;
  onClear(): void;
  filtered: boolean;
}) {
  const zh = language === "zh",
    t = translator(language);
  const dateFiltersId = useId();
  const hasDates = Boolean(startDate || endDate);
  const [datesOpen, setDatesOpen] = useState(hasDates);
  return (
    <div className="task-history-controls">
      <label className="task-history-search">
        <span>{zh ? "搜索模块内任务" : "Search this module"}</span>
        <input
          type="search"
          maxLength={180}
          value={query}
          placeholder={zh ? "任务名称或编号" : "Task name or ID"}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <label>
        <span>{zh ? "任务类型" : "Task type"}</span>
        <select value={type} onChange={(event) => onType(event.target.value)}>
          <option value="all">{zh ? "全部类型" : "All types"}</option>
          {kinds.map((kind) => (
            <option value={kind} key={kind}>
              {historyKindLabel(kind, language)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{zh ? "状态" : "Status"}</span>
        <select
          value={status}
          onChange={(event) => onStatus(event.target.value as Status | "all")}
        >
          <option value="all">{zh ? "全部状态" : "All statuses"}</option>
          {historyStatuses.map((value) => (
            <option key={value} value={value}>
              {t(value)}
            </option>
          ))}
        </select>
      </label>
      <div className="task-history-filter-actions">
        <button
          type="button"
          className="history-date-trigger"
          aria-expanded={datesOpen}
          aria-controls={dateFiltersId}
          onClick={() => setDatesOpen((value) => !value)}
        >
          <CalendarOutlined aria-hidden="true" />
          {zh ? "日期范围" : "Date range"}
          {hasDates && (
            <span
              className="history-date-indicator"
              role="img"
              aria-label={zh ? "已筛选" : "Filtered"}
            />
          )}
        </button>
        {filtered && (
          <button
            type="button"
            className="task-history-clear"
            onClick={() => {
              setDatesOpen(false);
              onClear();
            }}
          >
            {zh ? "清除筛选" : "Clear filters"}
          </button>
        )}
      </div>
      <div
        id={dateFiltersId}
        className="task-history-date-controls"
        hidden={!datesOpen}
        role="group"
        aria-label={zh ? "提交日期 · 本地时间" : "Submitted dates · local time"}
      >
        {datesOpen && (
          <>
            <TaskHistoryDatePicker
              language={language}
              label={zh ? "开始日期" : "Start date"}
              value={startDate}
              maximum={endDate}
              onChange={onStartDate}
            />
            <TaskHistoryDatePicker
              language={language}
              label={zh ? "结束日期" : "End date"}
              value={endDate}
              minimum={startDate}
              onChange={onEndDate}
            />
          </>
        )}
      </div>
    </div>
  );
}

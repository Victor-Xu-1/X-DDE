import {
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { calendarDay, dayLabel } from "./task-history-dates";

/** A local-day calendar only; this control never submits or changes a task. */
export function TaskHistoryDatePicker({
  language,
  label,
  value,
  minimum = "",
  maximum = "",
  onChange,
}: {
  language: Language;
  label: string;
  value: string;
  minimum?: string;
  maximum?: string;
  onChange(value: string): void;
}) {
  const zh = language === "zh",
    locale = zh ? "zh-CN" : "en-US";
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
      element
        .querySelector<HTMLButtonElement>('[data-day][aria-pressed="true"]')
        ?.focus();
    } else if (!open && element?.open) element.close();
  }, [open]);
  const selected = calendarDay(value);
  function close() {
    setOpen(false);
  }
  function choose(day: string) {
    onChange(day);
    close();
  }
  function move(amount: number) {
    const next = new Date(month);
    next.setDate(1);
    next.setMonth(next.getMonth() + amount);
    if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) setMonth(next);
  }
  const first = new Date(month);
  first.setHours(12, 0, 0, 0);
  first.setDate(1);
  first.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
  const allowed = (day: string) =>
    Boolean(calendarDay(day)) &&
    (!minimum || day >= minimum) &&
    (!maximum || day <= maximum);
  const today = dayLabel(new Date());
  return (
    <div className="task-history-date">
      <button
        type="button"
        className="history-date-trigger"
        ref={trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          label +
          (selected
            ? ": " +
              selected.toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "")
        }
        onClick={() => {
          const bounds = trigger.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(12, Math.min(bounds.left, innerWidth - 316)),
            top: Math.max(12, Math.min(bounds.bottom + 8, innerHeight - 390)),
          });
          const initial = new Date(selected ?? new Date());
          initial.setDate(1);
          setMonth(initial);
          setOpen(true);
        }}
      >
        <CalendarOutlined aria-hidden="true" />
        {label}
        {selected &&
          ": " +
            selected.toLocaleDateString(locale, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
      </button>
      <dialog
        ref={dialog}
        className="history-date-dialog"
        style={position}
        aria-label={(zh ? "选择" : "Choose ") + label.toLowerCase()}
        onCancel={close}
        onClose={() => {
          close();
          trigger.current?.focus();
        }}
        onClick={(event) => {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.target === event.currentTarget &&
            (event.clientX < r.left ||
              event.clientX > r.right ||
              event.clientY < r.top ||
              event.clientY > r.bottom)
          )
            close();
        }}
      >
        <div className="history-calendar-month">
          <button
            type="button"
            aria-label={zh ? "上个月" : "Previous month"}
            disabled={month.getFullYear() === 1 && month.getMonth() === 0}
            onClick={() => move(-1)}
          >
            <LeftOutlined />
          </button>
          <select
            aria-label={zh ? "选择月份" : "Choose month"}
            value={month.getMonth()}
            onChange={(event) => {
              const next = new Date(month);
              next.setDate(1);
              next.setMonth(Number(event.target.value));
              setMonth(next);
            }}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index}>
                {new Date(2026, index, 1).toLocaleDateString(locale, {
                  month: "long",
                })}
              </option>
            ))}
          </select>
          <input
            key={month.getFullYear()}
            type="number"
            min={1}
            max={9999}
            defaultValue={month.getFullYear()}
            aria-label={zh ? "选择年份" : "Choose year"}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onBlur={(event) => {
              const year = Number(event.target.value);
              if (Number.isInteger(year) && year >= 1 && year <= 9999) {
                const next = new Date(month);
                next.setFullYear(year);
                setMonth(next);
              } else event.target.value = String(month.getFullYear());
            }}
          />
          <button
            type="button"
            aria-label={zh ? "下个月" : "Next month"}
            disabled={month.getFullYear() === 9999 && month.getMonth() === 11}
            onClick={() => move(1)}
          >
            <RightOutlined />
          </button>
        </div>
        <div className="history-calendar-week" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index}>
              {new Date(2026, 10, 1 + index).toLocaleDateString(locale, {
                weekday: "narrow",
              })}
            </span>
          ))}
        </div>
        <div className="history-calendar-days">
          {days.map((day) => {
            const key = dayLabel(day);
            return (
              <button
                type="button"
                key={key}
                data-day={key}
                data-outside={day.getMonth() !== month.getMonth()}
                aria-label={day.toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                aria-pressed={key === value}
                aria-current={key === today ? "date" : undefined}
                disabled={!allowed(key)}
                onClick={() => choose(key)}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
        <footer>
          <button type="button" onClick={() => choose("")}>
            {zh ? "清除日期" : "Clear date"}
          </button>
          <button
            type="button"
            disabled={!allowed(today)}
            onClick={() => choose(today)}
          >
            {zh ? "今天" : "Today"}
          </button>
        </footer>
      </dialog>
    </div>
  );
}

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useInputActionScope } from "../guided/InputActionScope";
import { validImage, type ImageMolecule } from "./image-molecule";

type Token = { id: number; availability: number; signal?: AbortSignal };
type Selection = { file: File; token: Token };
type Options = {
  enabled: boolean;
  disabled: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onMolecule(
    value: ImageMolecule,
    source: File,
    signal: AbortSignal,
  ): void | Promise<void>;
};

/** One cancellable image intent; changes task input only after explicit acceptance. */
export function useImageInputSession(options: Options) {
  const scope = useInputActionScope();
  const current = useRef({ ...options, scope });
  const availability = useRef(0);
  if (
    current.current.enabled !== options.enabled ||
    current.current.disabled !== options.disabled
  )
    availability.current++;
  current.current = { ...options, scope };
  const mounted = useRef(true),
    intent = useRef(0);
  const applying = useRef<AbortController | null>(null);
  const pickerToken = useRef<Token | undefined>(undefined);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<"format" | "empty" | "clipboard" | null>(
    null,
  );

  function blocked() {
    const { enabled, disabled, trigger, scope } = current.current;
    return (
      !mounted.current ||
      !enabled ||
      disabled ||
      scope?.isLocked() ||
      Boolean(
        trigger.current?.matches(":disabled") ||
        trigger.current?.closest("[hidden]"),
      )
    );
  }
  function valid(token: Token) {
    return (
      mounted.current && token.id === intent.current && !token.signal?.aborted
    );
  }
  function readable(token: Token) {
    return (
      valid(token) && token.availability === availability.current && !blocked()
    );
  }
  function close(focus = true) {
    intent.current++;
    applying.current?.abort();
    if (mounted.current) setSelection(null);
    if (focus) current.current.trigger.current?.focus();
  }
  function begin(): Token | undefined {
    if (blocked()) return;
    close(false);
    setError(null);
    return {
      id: intent.current,
      availability: availability.current,
      signal: current.current.scope?.currentSignal(),
    };
  }
  function select(file: File, token?: Token) {
    if (blocked() || (token && !readable(token))) return;
    if (!validImage(file)) {
      setError("format");
      return;
    }
    const next = begin();
    if (next) setSelection({ file, token: next });
  }
  async function paste() {
    const token = begin();
    if (!token) return;
    try {
      const items = await navigator.clipboard.read();
      if (!readable(token)) return;
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          if (readable(token))
            select(new File([blob], "clipboard.png", { type }), token);
          return;
        }
      }
      if (readable(token)) setError("empty");
    } catch {
      if (readable(token)) setError("clipboard");
    }
  }
  async function accept(
    selected: Selection,
    value: ImageMolecule,
    source: File,
  ) {
    if (!valid(selected.token) || blocked()) return;
    const controller = new AbortController();
    applying.current?.abort();
    applying.current = controller;
    const cancel = () => controller.abort();
    selected.token.signal?.addEventListener("abort", cancel, { once: true });
    try {
      await current.current.onMolecule(value, source, controller.signal);
      // Uploading this accepted image may itself disable the source controls.
      if (valid(selected.token) && !controller.signal.aborted) close();
    } finally {
      selected.token.signal?.removeEventListener("abort", cancel);
    }
  }
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      intent.current++;
      applying.current?.abort();
    };
  }, []);
  useLayoutEffect(() => {
    if (!options.enabled) close(false);
  }, [options.enabled]);
  useLayoutEffect(() => {
    const signal = selection?.token.signal;
    if (!signal) return;
    const cancel = () => close(false);
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    return () => signal.removeEventListener("abort", cancel);
  }, [selection]);

  return {
    selection,
    error,
    select,
    paste,
    accept,
    close,
    disabled: options.disabled || Boolean(scope?.action),
    choose() {
      pickerToken.current = begin();
      return Boolean(pickerToken.current);
    },
    picked(file: File) {
      const token = pickerToken.current;
      pickerToken.current = undefined;
      select(file, token);
    },
  };
}

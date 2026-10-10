/** An invisible renderer must not make its clipboard textarea the user's input target. */
export function hiddenFrameFocus(frame: () => HTMLIFrameElement | null) {
  let latest: HTMLElement | null =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const remember = () => {
    const active = document.activeElement;
    if (active !== frame() && active instanceof HTMLElement) latest = active;
  };
  document.addEventListener("focusin", remember, true);
  document.addEventListener("pointerup", remember, true);
  return {
    protect() {
      const current = frame();
      // Host inertness alone does not prevent focus inside another document.
      // Only this private document is inert; the user's visible editor stays interactive.
      if (current?.contentDocument?.body)
        current.contentDocument.body.inert = true;
      if (!current || document.activeElement !== current) return;
      if (
        latest?.isConnected &&
        latest !== document.body &&
        latest !== document.documentElement &&
        !latest.closest("[inert]")
      )
        latest.focus({ preventScroll: true });
      else current.blur();
    },
    close() {
      document.removeEventListener("focusin", remember, true);
      document.removeEventListener("pointerup", remember, true);
    },
  };
}

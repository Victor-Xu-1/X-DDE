import { useLayoutEffect } from "react";
/** Purposeful state entry; source values, DOM identity and keyboard focus stay intact. */
export function useReveal(
  element: React.RefObject<HTMLElement | null>,
  key: string | number,
) {
  useLayoutEffect(() => {
    const node = element.current;
    if (
      !node ||
      typeof node.animate !== "function" ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animation = node.animate(
      [
        { opacity: 0.45, transform: "translateY(7px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    return () => animation.cancel();
  }, [key, element]);
}

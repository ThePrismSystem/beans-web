import { useEffect, useState } from "react";

/**
 * Tracks whether `query` currently matches, updating live as the viewport
 * changes. Used to switch components into a different rendering mode (e.g.
 * a shallower grouped hierarchy on small screens) instead of relying on CSS
 * alone, which cannot restructure the DOM.
 *
 * Starts as `false` on mount and syncs to the real value in an effect
 * (rather than reading `matchMedia` during render) so a single
 * `MediaQueryList` instance is created per query.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };
    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener("change", listener);
    return () => {
      mediaQueryList.removeEventListener("change", listener);
    };
  }, [query]);

  return matches;
}

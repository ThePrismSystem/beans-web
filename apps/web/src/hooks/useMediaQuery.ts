import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query from JS.
 *
 * The mobile drawer needs this because its "closed" state is purely visual —
 * a `transform` that moves it off-screen — so the layout breakpoint has to be
 * observable in React to take the drawer out of the tab order at the same
 * width the stylesheet turns it into a drawer.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

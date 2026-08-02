import { useState } from "react";

/**
 * Loads a project-scoped value from storage on mount and whenever `project`
 * changes, under the key `beans:<name>:<project>`. The returned setter
 * accepts a plain value or an updater function (mirroring `useState`) and
 * persists the result via `write` at the moment it's called, before the
 * component re-renders with the new value.
 *
 * `read` must be a stable reference (e.g. a module-level function, not an
 * inline closure) since it's part of the effect's dependency array — a
 * fresh identity on every render would re-trigger the reload effect on
 * every render, not just when `project` changes.
 */
export function usePersistedProjectState<T>(
  project: string,
  name: string,
  read: (key: string) => T,
  write: (key: string, value: T) => void,
): [T, (updater: T | ((current: T) => T)) => void] {
  const storageKey = `beans:${name}:${project}`;
  const [loadedKey, setLoadedKey] = useState(storageKey);
  const [value, setValue] = useState<T>(() => read(storageKey));

  // Reload from storage when `storageKey` changes, without a `useEffect`
  // round-trip: https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  if (storageKey !== loadedKey) {
    setLoadedKey(storageKey);
    setValue(read(storageKey));
  }

  function setPersisted(updater: T | ((current: T) => T)) {
    setValue((current) => {
      const next = typeof updater === "function" ? (updater as (c: T) => T)(current) : updater;
      write(storageKey, next);
      return next;
    });
  }

  return [value, setPersisted];
}

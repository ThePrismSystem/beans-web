import { useEffect, useState } from "react";

/**
 * Loads a project-scoped value from storage on mount and whenever `project`
 * changes, under the key `beans:<name>:<project>`. The returned setter
 * accepts a plain value or an updater function (mirroring `useState`) and
 * persists the result via `write` at the moment it's called, before the
 * component re-renders with the new value.
 */
export function usePersistedProjectState<T>(
  project: string,
  name: string,
  read: (key: string) => T,
  write: (key: string, value: T) => void,
): [T, (updater: T | ((current: T) => T)) => void] {
  const storageKey = `beans:${name}:${project}`;
  const [value, setValue] = useState<T>(() => read(storageKey));

  useEffect(() => {
    setValue(read(storageKey));
  }, [project, storageKey, read]);

  function setPersisted(updater: T | ((current: T) => T)) {
    setValue((current) => {
      const next = typeof updater === "function" ? (updater as (c: T) => T)(current) : updater;
      write(storageKey, next);
      return next;
    });
  }

  return [value, setPersisted];
}

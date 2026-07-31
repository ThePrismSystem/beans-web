// Falls back to this map when localStorage is unavailable (private browsing,
// storage disabled, quota exceeded). State then lives for the page session
// only, which is strictly better than throwing out of a render.
const memory = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

export function readString(key: string): string | null {
  return safeGet(key);
}

export function writeString(key: string, value: string): void {
  safeSet(key, value);
}

/** Reads a JSON string array. Any unparsable or unexpected payload reads as empty. */
export function readStringSet(key: string): Set<string> {
  const raw = safeGet(key);
  if (raw === null) {
    return new Set();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) {
    return new Set();
  }
  return new Set(parsed.filter((value): value is string => typeof value === "string"));
}

export function writeStringSet(key: string, value: Iterable<string>): void {
  safeSet(key, JSON.stringify([...value]));
}

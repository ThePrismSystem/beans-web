export function beanPrefix(id: string): string {
  const idx = id.lastIndexOf("-");
  return idx <= 0 ? id : id.slice(0, idx);
}

export function distinctPrefixes(beans: { id: string }[]): string[] {
  return [...new Set(beans.map((b) => beanPrefix(b.id)))].sort((a, b) => a.localeCompare(b));
}

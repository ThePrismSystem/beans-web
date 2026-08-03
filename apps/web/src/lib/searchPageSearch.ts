export function validateSearchPageSearch(search: Record<string, unknown>): { q: string } {
  return { q: typeof search.q === "string" ? search.q : "" };
}

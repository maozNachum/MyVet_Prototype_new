import { normalizeSearchString } from "../utils/string";

/**
 * Generic client-side search filter.
 *
 * @param items        – the full list to filter
 * @param query        – the raw query string typed by the user
 * @param searchFields – a function that, given an item, returns the list of
 *                       string fields that should be matched against the query
 *
 * Returns the full list unchanged when the query is empty.
 */
export function useSearchFilter<T>(
  items: T[],
  query: string,
  searchFields: (item: T) => string[]
): T[] {
  const q = normalizeSearchString(query).toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    searchFields(item).some((field) =>
      normalizeSearchString(field).toLowerCase().includes(q)
    )
  );
}

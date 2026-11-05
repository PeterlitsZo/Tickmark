import type { QueryClient } from "@tanstack/react-query";
import {
  API_ORIGIN,
  entriesApi,
  type Entry,
  type EntryInput,
} from "../../api/entries";

export const entriesKey = ["entries", API_ORIGIN] as const;
export const rangeKey = (from: number, to: number) => [...entriesKey, from, to];

export function sameInput(a: EntryInput, b: EntryInput) {
  return (
    a.title === b.title &&
    a.category_id === b.category_id &&
    a.start_time === b.start_time &&
    a.end_time === b.end_time
  );
}

export async function commitEntry(
  client: QueryClient,
  entry: Entry | null,
  removedId?: string,
) {
  await client.cancelQueries({ queryKey: entriesKey });
  const cached = client.getQueriesData<{ items: Entry[] }>({
    queryKey: entriesKey,
  });
  for (const [key, data] of cached) {
    if (!data) continue;
    const from = Number(key[2]);
    const to = Number(key[3]);
    const items = data.items.filter(
      (item) => item.id !== (entry?.id ?? removedId),
    );
    const intersects =
      entry &&
      (entry.start_time === entry.end_time
        ? entry.start_time >= from && entry.start_time < to
        : entry.start_time < to && entry.end_time > from);
    if (entry && intersects) items.push(entry);
    items.sort(
      (a, b) =>
        a.start_time - b.start_time ||
        a.id.length - b.id.length ||
        a.id.localeCompare(b.id),
    );
    client.setQueryData(key, { items });
  }
  void client.invalidateQueries({ queryKey: entriesKey });
}

// Read both locations: a completed move may no longer intersect its old range.
export async function readReplacement(original: Entry, target: EntryInput) {
  const ranges = [original, target].map((entry) => ({
    from: entry.start_time,
    to: Math.max(entry.start_time + 1, entry.end_time),
  }));
  const results = await Promise.all(
    ranges.map((range) => entriesApi.list(range)),
  );
  const candidates = results
    .flatMap((result) => result.items)
    .filter((entry) => entry.id === original.id);
  // Conflicting reads may straddle a concurrent write. Do not claim success.
  return candidates.length > 0 &&
    candidates.every((entry) => sameInput(entry, target))
    ? candidates[0]
    : null;
}

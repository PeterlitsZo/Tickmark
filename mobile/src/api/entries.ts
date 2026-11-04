export type EntryInput = {
  title: string;
  start_time: number;
  end_time: number;
};
export type Entry = EntryInput & { id: string };
export type TimeRange = { from: number; to: number };
export const API_ORIGIN = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://tickmark.peterlits.me"
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public reason: string,
    public fields: Record<string, string> = {},
    public uncertain = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  method = "GET",
  body?: EntryInput,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      method,
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return undefined as T;
    const json = await response.json();
    if (!response.ok) {
      const details = json.error?.details ?? [];
      const reason =
        details.find((d: { reason?: string }) => d.reason)?.reason ?? "UNKNOWN";
      const violations = details.flatMap(
        (d: { fieldViolations?: { field: string; description: string }[] }) =>
          d.fieldViolations ?? [],
      );
      const messages: Record<string, string> = {
        ENTRY_NOT_FOUND:
          "This entry no longer exists. Refresh to see the latest entries.",
        INVALID_TIME_RANGE: "The end must be on or after the start.",
        INVALID_FIELD: "Check the highlighted fields and try again.",
        INTERNAL_ERROR:
          "The service could not save your changes. Please try again.",
      };
      throw new ApiError(
        response.status >= 500 && (method === "POST" || method === "PUT")
          ? "The service could not confirm this change. It may have been saved; check its status before retrying."
          : messages[reason] ?? "The request failed. Please try again.",
        reason,
        Object.fromEntries(
          violations.map((v: { field: string; description: string }) => [
            v.field,
            v.description,
          ]),
        ),
        response.status >= 500 && (method === "POST" || method === "PUT"),
      );
    }
    return json as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      method === "POST" || method === "PUT"
        ? "The connection was interrupted. Your change may have been saved. Check its status before saving again."
        : "Could not reach Tickmark. Check your connection and try again.",
      "NETWORK",
      {},
      method === "POST" || method === "PUT",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export const entriesApi = {
  list: (range: TimeRange, signal?: AbortSignal) =>
    request<{ items: Entry[] }>(
      `/entries?from=${range.from}&to=${range.to}`,
      "GET",
      undefined,
      signal,
    ),
  create: (input: EntryInput) => request<Entry>("/entries", "POST", input),
  replace: (id: string, input: EntryInput) =>
    request<Entry>(`/entries/${encodeURIComponent(id)}`, "PUT", input),
  remove: (id: string) =>
    request<void>(`/entries/${encodeURIComponent(id)}`, "DELETE"),
};

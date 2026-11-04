import { useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  ApiError,
  entriesApi,
  type Entry,
  type EntryInput,
} from "../../api/entries";
import { commitEntry, readReplacement, sameInput } from "./entriesQueries";

export type PendingReplacement = {
  original: Entry;
  target: EntryInput;
  status: "saving" | "checking" | "uncertain";
  message: string;
};
export type ReplacementResult = "saved" | "unchanged" | "uncertain" | "locked";

export function useEntryMutations(
  client: QueryClient,
  notify: (message: string) => void,
) {
  const current = useRef<Record<string, PendingReplacement>>({});
  const [pending, setPending] = useState<Record<string, PendingReplacement>>(
    {},
  );
  function publish(id: string, operation?: PendingReplacement) {
    const next = { ...current.current };
    if (operation) next[id] = operation;
    else delete next[id];
    current.current = next;
    setPending(next);
  }
  async function reconcile(id: string): Promise<ReplacementResult> {
    const operation = current.current[id];
    if (!operation || operation.status !== "uncertain") return "locked";
    publish(id, { ...operation, status: "checking" });
    try {
      const saved = await readReplacement(operation.original, operation.target);
      if (saved) {
        await commitEntry(client, saved);
        publish(id);
        notify("Changes saved.");
        return "saved";
      }
      publish(id, {
        ...operation,
        status: "uncertain",
        message:
          "The new time is not confirmed. Check again or explicitly retry this change.",
      });
    } catch {
      publish(id, {
        ...operation,
        status: "uncertain",
        message: "Could not confirm this change. Reconnect and check again.",
      });
    }
    return "uncertain";
  }
  async function send(
    operation: PendingReplacement,
  ): Promise<ReplacementResult> {
    const id = operation.original.id;
    publish(id, { ...operation, status: "saving", message: "Saving changes…" });
    try {
      const saved = await entriesApi.replace(id, operation.target);
      await commitEntry(client, saved);
      publish(id);
      notify("Changes saved.");
      return "saved";
    } catch (failure) {
      if (failure instanceof ApiError && failure.uncertain) {
        publish(id, {
          ...operation,
          status: "uncertain",
          message: failure.message,
        });
        return reconcile(id);
      }
      publish(id);
      if (failure instanceof ApiError && failure.reason === "ENTRY_NOT_FOUND") {
        await commitEntry(client, null, id);
      }
      throw failure;
    }
  }
  async function replace(
    original: Entry,
    target: EntryInput,
  ): Promise<ReplacementResult> {
    if (current.current[original.id]) return "locked";
    if (sameInput(original, target)) return "unchanged";
    return send({
      original,
      target,
      status: "saving",
      message: "Saving changes…",
    });
  }
  async function retry(id: string) {
    const operation = current.current[id];
    if (!operation || operation.status !== "uncertain") return "locked";
    return send(operation);
  }
  return { pending, replace, reconcile, retry };
}

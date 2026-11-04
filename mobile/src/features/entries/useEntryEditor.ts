import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { ApiError, entriesApi } from "../../api/entries";
import { validateInput } from "../../lib/time";
import { type Draft, useEntries } from "./EntriesProvider";
import { readReplacement } from "./entriesQueries";

type EditorStatus = "editing" | "saving" | "checking" | "uncertain" | "missing";

export function useEntryEditor(draft: Draft) {
  const { setDraft, refreshAll, commitEntry, setNotice, online, mutations } =
    useEntries();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dismiss = () =>
    setDraft((current) => (current === draft ? null : current));
  const [input, setInput] = useState(draft.input);
  const [status, setStatus] = useState<EditorStatus>("editing");
  const busy = status === "saving" || status === "checking";
  const uncertain = status === "uncertain";
  const missing = status === "missing";
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const dirty =
    input.title !== draft.input.title ||
    input.start_time !== draft.input.start_time ||
    input.end_time !== draft.input.end_time;
  const close = () => {
    if (!mounted.current || busyRef.current) return;
    if (dirty && !missing)
      Alert.alert(
        "Close this draft?",
        uncertain
          ? "The server may already have saved this change. Closing the draft does not undo it."
          : "Your unsaved changes will be lost.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: uncertain ? "Close draft" : "Discard",
            style: "destructive",
            onPress: dismiss,
          },
        ],
      );
    else dismiss();
  };
  const report = (failure: unknown) => {
    if (failure instanceof ApiError) {
      setError(failure.message);
      setFields(failure.fields);
      setStatus(failure.uncertain ? "uncertain" : "editing");
      if (failure.reason === "ENTRY_NOT_FOUND") {
        setStatus("missing");
        void refreshAll();
      }
    } else setError("Something went wrong. Please try again.");
  };
  async function write(remove = false) {
    if (!mounted.current || busyRef.current || missing || uncertain) return;
    if (!online) {
      setError("You’re offline. Reconnect before saving changes.");
      return;
    }
    const validated = validateInput(
      input.title,
      input.start_time,
      input.end_time,
    );
    if (!remove && Object.keys(validated.errors).length) {
      setFields(validated.errors);
      return;
    }
    busyRef.current = true;
    setStatus("saving");
    setError("");
    setFields({});
    try {
      if (remove && draft.entry) {
        await entriesApi.remove(draft.entry.id);
        await commitEntry(null, draft.entry.id);
      } else {
        const payload = { ...input, title: validated.title };
        if (draft.entry) {
          const result = await mutations.replace(draft.entry, payload);
          if (!mounted.current) return;
          if (result === "uncertain" || result === "locked") {
            setStatus("uncertain");
            setError(
              "This change is awaiting confirmation. Check its status before editing again.",
            );
            return;
          }
        } else {
          const saved = await entriesApi.create(payload);
          await commitEntry(saved);
        }
      }
      setNotice(
        remove
          ? "Entry deleted."
          : draft.entry
            ? "Changes saved."
            : "Entry saved.",
      );
      dismiss();
    } catch (failure) {
      if (mounted.current) report(failure);
    } finally {
      busyRef.current = false;
      if (mounted.current)
        setStatus((current) => (current === "saving" ? "editing" : current));
    }
  }
  async function checkSave() {
    if (!mounted.current || busyRef.current) return;
    busyRef.current = true;
    setStatus("checking");
    try {
      if (draft.entry) {
        if (mutations.pending[draft.entry.id]) {
          const result = await mutations.reconcile(draft.entry.id);
          if (result === "saved") dismiss();
        } else {
          const saved = await readReplacement(draft.entry, {
            ...input,
            title: validateInput(input.title, input.start_time, input.end_time)
              .title,
          });
          if (saved) {
            await commitEntry(saved);
            dismiss();
          } else if (mounted.current)
            setError(
              "The requested change is not confirmed. Close this draft and review the calendar.",
            );
        }
        return;
      }
      const result = await entriesApi.list({
        from: input.start_time,
        to: Math.max(input.start_time + 1, input.end_time),
      });
      const title = validateInput(
        input.title,
        input.start_time,
        input.end_time,
      ).title;
      const matches = result.items.filter(
        (entry) =>
          entry.title === title &&
          entry.start_time === input.start_time &&
          entry.end_time === input.end_time,
      );
      void refreshAll();
      if (!mounted.current) return;
      if (matches.length)
        Alert.alert(
          "Matching entry found",
          "An entry with this title and time is already saved. Close this draft to avoid a duplicate.",
          [
            { text: "Keep draft", style: "cancel" },
            { text: "Close draft", onPress: dismiss },
          ],
        );
      else
        Alert.alert(
          "No matching entry found",
          "You can try saving again. A delayed request could still create a duplicate.",
          [
            { text: "Keep checking", style: "cancel" },
            {
              text: "Allow another save",
              onPress: () => {
                if (!mounted.current) return;
                setStatus("editing");
                setError("");
              },
            },
          ],
        );
    } catch {
      if (mounted.current)
        setError(
          "Could not check whether the entry was saved. Reconnect and check again.",
        );
    } finally {
      busyRef.current = false;
      if (mounted.current)
        setStatus((current) =>
          current === "checking" ? "uncertain" : current,
        );
    }
  }
  return {
    input,
    setInput,
    status,
    busy,
    uncertain,
    missing,
    error,
    fields,
    setFields,
    dirty,
    close,
    write,
    checkSave,
    online,
    refreshAll,
    setDraft,
  };
}

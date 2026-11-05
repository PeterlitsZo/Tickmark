import { preferredCategoryId, rememberCreatedCategory } from "../categories/categoryPreference";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import { Alert } from "react-native";
import { ApiError, entriesApi } from "../../api/entries";
import { validateInput } from "../../lib/time";
import { type Draft, useEntries } from "./EntriesProvider";
import { readReplacement } from "./entriesQueries";

type EditorStatus = "editing" | "saving" | "checking" | "uncertain" | "missing";

export function useEntryEditor(draft: Draft) {
  const { setDraft, refreshAll, commitEntry, setNotice, online, mutations, categories, preferenceReady, setDraftPreview } =
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
  const [input, setLocalInput] = useState(draft.input);
  const setInput = (action: SetStateAction<typeof input>) => {
    const next = typeof action === 'function' ? action(input) : action;
    setLocalInput(next);
    setDraftPreview(next);
  };
  const [status, setStatus] = useState<EditorStatus>("editing");
  const [categoryInitialized, setCategoryInitialized] = useState(!!draft.entry || !!draft.input.category_id);
  const [initialCategory, setInitialCategory] = useState(draft.input.category_id);
  if (!categoryInitialized && preferenceReady && categories.isSuccess && status === "editing") {
    const category_id = preferredCategoryId(categories.data);
    setCategoryInitialized(true);
    setInitialCategory(category_id);
    setLocalInput(current => ({ ...current, category_id: current.category_id ?? category_id }));
  }
  const busy = status === "saving" || status === "checking";
  const uncertain = status === "uncertain";
  const missing = status === "missing";
  const busyRef = useRef(false);
  const deleting = useRef(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const dirty =
    input.category_id !== initialCategory ||
    input.title !== draft.input.title ||
    input.start_time !== draft.input.start_time ||
    input.end_time !== draft.input.end_time;
  const close = () => {
    if (!mounted.current || busyRef.current) return;
    if ((dirty || uncertain) && !missing)
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
    if (!remove && (!categories.isSuccess || !preferenceReady || ((categories.data.length > 0 || input.category_id !== undefined || !!draft.entry) && !categories.data.some(category => category.id === input.category_id)) || (!!draft.entry && !input.category_id))) {
      setFields({ category_id: categories.isSuccess ? 'Choose an available category.' : 'Load categories before saving.' });
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
    deleting.current = remove;
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
          await rememberCreatedCategory(saved.category_id);
          void categories.refetch();
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
        if (deleting.current) {
          const result = await entriesApi.list({ from: draft.entry.start_time, to: Math.max(draft.entry.start_time + 1, draft.entry.end_time) });
          void refreshAll();
          // A missing range match may be a concurrent move; it does not prove deletion.
          Alert.alert(result.items.some(entry => entry.id === draft.entry!.id) ? "Entry still present" : "Entry not in its original range", "The delete result is not confirmed. A missing entry may have moved. Retrying deletes this ID even if another device edited it.", [
            { text: "Keep checking", style: "cancel" },
            { text: "Allow another delete", onPress: () => { setStatus("editing"); setError("Review the entry, then explicitly delete again if needed."); } },
          ]);
          return;
        }
        if (mutations.pending[draft.entry.id]) {
          const result = await mutations.reconcile(draft.entry.id);
          if (result === "saved") dismiss();
          else Alert.alert("Change not confirmed", "Retrying can overwrite changes made on another device.", [
            { text: "Keep checking", style: "cancel" },
            { text: "Retry change", onPress: () => { void mutations.retry(draft.entry!.id).then(result => { if (result === "saved") dismiss(); }).catch(report); } },
          ]);
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
          (input.category_id === undefined || entry.category_id === input.category_id) &&
          entry.title === title &&
          entry.start_time === input.start_time &&
          entry.end_time === input.end_time,
      );
      void refreshAll();
      if (!mounted.current) return;
      if (matches.length)
        Alert.alert(
          "Matching entry found",
          "A matching entry exists, but it may be from another request. Explicitly choose it to avoid creating another entry.",
          [
            { text: "Keep draft", style: "cancel" },
            { text: "Use existing entry", onPress: () => { void rememberCreatedCategory(matches[0].category_id); dismiss(); } },
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

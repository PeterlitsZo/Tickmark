import { categoriesOptions } from "../categories/categoriesQueries";
import { loadCategoryPreference, preferredCategoryId } from "../categories/categoryPreference";
import NetInfo from "@react-native-community/netinfo";
import { useCalendars } from "expo-localization";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  ApiError,
  entriesApi,
  type Entry,
  type EntryInput,
} from "../../api/entries";
import { dayKey, dayRange, seconds } from "../../lib/time";
import { commitEntry, entriesKey, rangeKey } from "./entriesQueries";
import { useEntryMutations } from "./useEntryMutations";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: (count, error) =>
        count < 1 &&
        (!(error instanceof ApiError) || error.reason === "NETWORK"),
    },
    mutations: { retry: false },
  },
});
export type Draft = { input: EntryInput; entry?: Entry };
function useEntriesState() {
  useCalendars();
  const client = useQueryClient();
  const categories = useQuery(categoriesOptions());
  const [preferenceReady, setPreferenceReady] = useState(false);
  useEffect(() => { void loadCategoryPreference().then(() => setPreferenceReady(true)); }, []);
  const calendarScroll = useRef<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const [, setRevision] = useState(0);
  const [draftPreview, setDraftPreview] = useState<EntryInput | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState("");
  const mutations = useEntryMutations(client, setNotice);
  const currentRange = dayRange(selectedDay);
  const range = useMemo(
    () => ({ from: currentRange.from, to: currentRange.to }),
    [currentRange.from, currentRange.to],
  );
  const query = useQuery({
    queryKey: rangeKey(range.from, range.to),
    queryFn: ({ signal }) => entriesApi.list(range, signal),
  });
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
      if (state === "active") {
        setRevision((value) => value + 1);
        void client.invalidateQueries();
      }
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected =
        state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(connected);
      onlineManager.setOnline(connected);
    });
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);
  const create = (start?: number, end?: number) => {
    const now = seconds(new Date());
    const defaultEnd =
      selectedDay === dayKey(new Date())
        ? Math.max(range.from + 900, Math.floor(now / 300) * 300)
        : range.from + 10 * 3600;
    setDraftPreview(null);
    setDraft({
      input: {
        title: "",
        category_id: preferenceReady && categories.data ? preferredCategoryId(categories.data) : undefined,
        start_time: start ?? defaultEnd - 900,
        end_time: end ?? defaultEnd,
      },
    });
  };
  return {
    categories,
    preferenceReady,
    selectedDay,
    setSelectedDay,
    saveCalendarScroll: (day: string, offset: number) => { calendarScroll.current[day] = offset; },
    readCalendarScroll: (day: string) => calendarScroll.current[day],
    range,
    query,
    online,
    notice,
    setNotice,
    draft,
    draftPreview,
    setDraftPreview,
    setDraft,
    create,
    edit: (entry: Entry) => {
      if (mutations.pending[entry.id]) {
        setNotice("This entry has a change awaiting confirmation.");
        return;
      }
      setDraftPreview(null);
      setDraft({
        input: {
          title: entry.title,
          category_id: entry.category_id,
          start_time: entry.start_time,
          end_time: entry.end_time,
        },
        entry,
      });
    },
    mutations,
    commitEntry: (entry: Entry | null, removedId?: string) =>
      commitEntry(client, entry, removedId),
    refreshAll: () => client.invalidateQueries({ queryKey: entriesKey }),
  };
}
type EntriesState = ReturnType<typeof useEntriesState>;
const Context = createContext<EntriesState | null>(null);
function StateProvider({ children }: { children: ReactNode }) {
  const value = useEntriesState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function EntriesProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <StateProvider>{children}</StateProvider>
    </QueryClientProvider>
  );
}
export function useEntries() {
  const context = useContext(Context);
  if (!context) throw new Error("EntriesProvider is required");
  return context;
}

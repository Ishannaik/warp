import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "../locales/en";
import {
  AVAILABLE_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  pickBestLocale,
  type LocaleMeta,
} from "./localeDetect";

/**
 * Warp's i18n layer. No framework (see #37) — just a typed dictionary,
 * a React context, and a hook. The whole contract:
 *
 * - `en` (`../locales/en.ts`) is the master dictionary and the source of
 *   truth for the `Strings` type. Add a key there first; every surface
 *   that wants it gets full autocomplete and a `tsc` error if it typos
 *   the key.
 * - Other locales are `Partial<Strings>` — translate what you have, and
 *   any key you haven't gotten to yet silently falls back to English at
 *   runtime instead of rendering blank or crashing.
 * - `<LocaleProvider strings={partialLocale}>` merges that partial over
 *   `en` and puts the result on context. Mount it once near the root
 *   (see `main.tsx`); omitting it just leaves you on the `en` default.
 * - `useT()` returns a typed `t(key)` function. `t("receive_heading")`
 *   is a compile error unless `"receive_heading"` exists on `Strings`,
 *   so a key removed from `en` breaks the build everywhere it was used
 *   instead of failing silently in production.
 *
 * Values are almost all plain strings. Anything parameterized (a count,
 * a name) is a template function instead — `t("files_count")(3)` — so
 * we never concatenate strings around a number and bake in English word
 * order.
 *
 * The switcher (#163) lives here too: `LocaleProvider` picks a starting
 * locale from `navigator.languages` (see `localeDetect.ts`), remembers a
 * manual pick in `localStorage`, and keeps `<html lang>` in sync. `useLocale()`
 * exposes that state to the footer control. The `strings` prop from #161 is
 * still there — a partial override merged on top of whatever locale is
 * active, handy for one-off testing without touching localStorage.
 */

export type Strings = typeof en;
export type StringKey = keyof Strings;

const localeDictionaries: Record<string, Partial<Strings>> = { en };

// AVAILABLE_LOCALES (switcher metadata) and localeDictionaries (actual
// translations) are two registries that #164 is expected to update
// together — catch it here if a future locale only makes it into one.
for (const { code } of AVAILABLE_LOCALES) {
  if (!localeDictionaries[code]) {
    console.error(`i18n: "${code}" is in AVAILABLE_LOCALES but has no entry in localeDictionaries`);
  }
}
for (const code of Object.keys(localeDictionaries)) {
  if (!AVAILABLE_LOCALES.some((l) => l.code === code)) {
    console.error(`i18n: "${code}" is in localeDictionaries but missing from AVAILABLE_LOCALES`);
  }
}

const StringsContext = createContext<Strings>(en);

interface LocaleState {
  locale: string;
  locales: readonly LocaleMeta[];
  setLocale: (code: string) => void;
}

const LocaleStateContext = createContext<LocaleState>({
  locale: DEFAULT_LOCALE,
  locales: AVAILABLE_LOCALES,
  setLocale: () => {},
});

function detectInitialLocale(): string {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && localeDictionaries[stored]) return stored;
  } catch {
    // Private browsing, disabled storage, etc. — fall through to detection.
  }

  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  return pickBestLocale(preferred, Object.keys(localeDictionaries), DEFAULT_LOCALE);
}

export function LocaleProvider({
  strings,
  children,
}: {
  /** A partial locale to merge over the active locale. Omit for the plain dictionary. */
  strings?: Partial<Strings>;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<string>(detectInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (code: string) => {
    if (!localeDictionaries[code]) return;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, code);
    } catch {
      // Quota exceeded, disabled storage, etc. — the pick still takes
      // effect for this session, it just won't persist across reloads.
    }
    setLocaleState(code);
  };

  const merged = useMemo<Strings>(
    () => ({ ...en, ...localeDictionaries[locale], ...strings }),
    [locale, strings],
  );

  const localeState = useMemo<LocaleState>(
    () => ({ locale, locales: AVAILABLE_LOCALES, setLocale }),
    [locale],
  );

  return createElement(
    LocaleStateContext.Provider,
    { value: localeState },
    createElement(StringsContext.Provider, { value: merged }, children),
  );
}

/** Returns a typed `t(key)` bound to the nearest `LocaleProvider` (or `en` if there isn't one). */
export function useT() {
  const strings = useContext(StringsContext);
  return useMemo(() => {
    return function t<K extends StringKey>(key: K): Strings[K] {
      return strings[key];
    };
  }, [strings]);
}

/** The active locale, the locales available to switch to, and a setter that persists the pick. */
export function useLocale() {
  return useContext(LocaleStateContext);
}

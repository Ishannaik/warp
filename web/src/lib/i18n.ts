import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import en from "../locales/en";

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
 */

export type Strings = typeof en;
export type StringKey = keyof Strings;

const LocaleContext = createContext<Strings>(en);

export function LocaleProvider({
  strings,
  children,
}: {
  /** A partial locale to merge over `en`. Omit for plain English. */
  strings?: Partial<Strings>;
  children: ReactNode;
}) {
  const merged = useMemo<Strings>(() => ({ ...en, ...strings }), [strings]);
  return createElement(LocaleContext.Provider, { value: merged }, children);
}

/** Returns a typed `t(key)` bound to the nearest `LocaleProvider` (or `en` if there isn't one). */
export function useT() {
  const strings = useContext(LocaleContext);
  return useMemo(() => {
    return function t<K extends StringKey>(key: K): Strings[K] {
      return strings[key];
    };
  }, [strings]);
}

import { useEffect, useMemo, useState } from "react";

export type FavoriteKind = "contributors" | "projects";

function storageKey(kind: FavoriteKind): string {
  return `leadboard:favorites:${kind}`;
}

function readFavorites(kind: FavoriteKind): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(storageKey(kind));
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function useLocalFavorites(kind: FavoriteKind) {
  const [items, setItems] = useState<string[]>(() => readFavorites(kind));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey(kind)) setItems(readFavorites(kind));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [kind]);

  const favoriteSet = useMemo(() => new Set(items), [items]);

  function toggle(value: string) {
    setItems((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      const values = [...next];
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey(kind), JSON.stringify(values));
        } catch {
          // Favorites are a progressive enhancement. Ignore unavailable storage.
        }
      }
      return values;
    });
  }

  return {
    items,
    isFavorite(value: string) {
      return favoriteSet.has(value);
    },
    toggle,
  };
}

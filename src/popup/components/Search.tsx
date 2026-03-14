import { useState, useCallback, useRef } from "preact/hooks";
import type { DecryptedFeuille } from "../../shared/types";

interface Props {
  onResults: (results: DecryptedFeuille[] | null) => void;
}

export function Search({ onResults }: Props) {
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        onResults(null);
        return;
      }
      const resp = await chrome.runtime.sendMessage({
        type: "SEARCH",
        payload: { query: q },
      });
      if (resp.ok) {
        onResults(resp.data as DecryptedFeuille[]);
      }
    },
    [onResults]
  );

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    setQuery(value);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value), 200);
  }

  return (
    <div class="search-bar">
      <input
        class="input search-input"
        type="text"
        placeholder="Rechercher..."
        value={query}
        onInput={handleInput}
      />
      {query && (
        <button
          class="btn-clear"
          onClick={() => {
            setQuery("");
            onResults(null);
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

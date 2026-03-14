import { useState } from "preact/hooks";
import type { DecryptedFeuille, DecryptedSaladier } from "../../shared/types";
import { Search } from "./Search";

interface Props {
  saladiers: DecryptedSaladier[];
}

export function VaultList({ saladiers }: Props) {
  const [searchResults, setSearchResults] = useState<DecryptedFeuille[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedSaladier, setExpandedSaladier] = useState<string | null>(null);

  function handleSearchResults(results: DecryptedFeuille[] | null) {
    setSearchResults(results);
  }

  async function copyToClipboard(text: string, feuilleId: string) {
    await chrome.runtime.sendMessage({
      type: "COPY_TO_CLIPBOARD",
      payload: { text },
    });
    setCopiedId(feuilleId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function autofill(feuille: DecryptedFeuille) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: "AUTOFILL",
        payload: { username: feuille.data.username, password: feuille.data.password },
      });
      window.close();
    }
  }

  function renderFeuille(feuille: DecryptedFeuille) {
    const isCopied = copiedId === feuille.uuid;
    return (
      <div class="feuille-card" key={feuille.uuid}>
        <div class="feuille-header">
          <span class="feuille-title">{feuille.data.title || "(sans titre)"}</span>
          {feuille.data.url && (() => {
            try { return <span class="feuille-url">{new URL(feuille.data.url).hostname}</span>; }
            catch { return null; }
          })()}
        </div>
        <div class="feuille-user">{feuille.data.username}</div>
        <div class="feuille-actions">
          <button
            class="btn-icon"
            title="Copier le nom d'utilisateur"
            onClick={() => copyToClipboard(feuille.data.username, `${feuille.uuid}-u`)}
          >
            👤
          </button>
          <button
            class="btn-icon"
            title="Copier le mot de passe"
            onClick={() => copyToClipboard(feuille.data.password, `${feuille.uuid}-p`)}
          >
            {copiedId === `${feuille.uuid}-p` ? "✓" : "🔑"}
          </button>
          <button
            class="btn-icon"
            title="Remplir automatiquement"
            onClick={() => autofill(feuille)}
          >
            ✏️
          </button>
        </div>
      </div>
    );
  }

  const visibleSaladiers = saladiers.filter((s) => !s.hidden);
  const displayItems = searchResults ?? undefined;

  return (
    <div class="vault-list">
      <Search onResults={handleSearchResults} />

      {displayItems ? (
        <div class="search-results">
          {displayItems.length === 0 ? (
            <p class="empty">Aucun résultat</p>
          ) : (
            displayItems.map(renderFeuille)
          )}
        </div>
      ) : (
        <div class="saladier-list">
          {visibleSaladiers.length === 0 ? (
            <p class="empty">Aucun saladier</p>
          ) : (
            visibleSaladiers.map((s) => (
              <div class="saladier-group" key={s.uuid}>
                <button
                  class="saladier-header"
                  onClick={() =>
                    setExpandedSaladier(expandedSaladier === s.uuid ? null : s.uuid)
                  }
                >
                  <span>{expandedSaladier === s.uuid ? "▼" : "▶"} {s.name}</span>
                  <span class="badge">{s.feuilles.length}</span>
                </button>
                {expandedSaladier === s.uuid && (
                  <div class="saladier-content">
                    {s.feuilles.length === 0 ? (
                      <p class="empty">Aucune feuille</p>
                    ) : (
                      s.feuilles.map(renderFeuille)
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

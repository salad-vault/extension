import { useEffect, useState } from "preact/hooks";
import type { StateResponse } from "../../shared/message-types";
import type { VaultState } from "../../shared/types";
import { Pairing } from "./Pairing";
import { Login } from "./Login";
import { MfaVerify } from "./MfaVerify";
import { VaultList } from "./VaultList";
import { Generator } from "./Generator";
import { Settings } from "./Settings";

type View = "loading" | "pairing" | "login" | "mfa" | "vault" | "bridge" | "generator" | "settings";

export function App() {
  const [view, setView] = useState<View>("loading");
  const [vault, setVault] = useState<VaultState>({ status: "locked" });
  const [mfaToken, setMfaToken] = useState("");
  const [loginCredentials, setLoginCredentials] = useState({ password: "", pin: "" });
  const [error, setError] = useState("");
  const [bridgeMode, setBridgeMode] = useState(false);

  useEffect(() => {
    // Check bridge first, then fallback to cloud/local mode
    chrome.runtime.sendMessage({ type: "BRIDGE_STATUS" }).then((bridgeResp: any) => {
      if (bridgeResp.ok && bridgeResp.data.authenticated) {
        // Bridge is connected and authenticated — use desktop app as source
        setBridgeMode(true);
        setView("bridge");
        return;
      }

      // Fallback to normal flow
      chrome.runtime.sendMessage({ type: "GET_STATE" }).then((resp: StateResponse) => {
        if (!resp.has_device_key) {
          setView("pairing");
        } else if (resp.vault.status === "unlocked") {
          setVault(resp.vault);
          setView("vault");
        } else {
          setView("login");
        }
      });
    }).catch(() => {
      // Bridge not available, use normal flow
      chrome.runtime.sendMessage({ type: "GET_STATE" }).then((resp: StateResponse) => {
        if (!resp.has_device_key) {
          setView("pairing");
        } else if (resp.vault.status === "unlocked") {
          setVault(resp.vault);
          setView("vault");
        } else {
          setView("login");
        }
      });
    });
  }, []);

  function handlePaired() {
    setView("login");
  }

  function handleMfaRequired(token: string, password: string, pin: string) {
    setMfaToken(token);
    setLoginCredentials({ password, pin });
    setView("mfa");
  }

  function handleUnlocked(state: VaultState) {
    setVault(state);
    setView("vault");
  }

  function handleLock() {
    chrome.runtime.sendMessage({ type: "LOCK" });
    setVault({ status: "locked" });
    setBridgeMode(false);
    setView("login");
  }

  if (view === "loading") {
    return (
      <div class="container center">
        <div class="spinner" />
        <p>Chargement...</p>
      </div>
    );
  }

  return (
    <div class="container">
      <header class="header">
        <h1 class="logo">
          🥗 SaladVault
          {bridgeMode && <span class="bridge-badge" title="Connecté à l'app desktop">🖥️</span>}
        </h1>
        {(view === "vault" || view === "bridge") && (
          <nav class="nav-icons">
            <button title="Générateur" onClick={() => setView("generator")}>🔑</button>
            <button title="Paramètres" onClick={() => setView("settings")}>⚙️</button>
            {!bridgeMode && <button title="Verrouiller" onClick={handleLock}>🔒</button>}
          </nav>
        )}
        {(view === "generator" || view === "settings") && (
          <nav class="nav-icons">
            <button title="Retour" onClick={() => setView(bridgeMode ? "bridge" : "vault")}>←</button>
          </nav>
        )}
      </header>

      {error && <div class="error-banner">{error}</div>}

      {view === "pairing" && (
        <Pairing onPaired={handlePaired} onError={setError} />
      )}

      {view === "login" && (
        <Login
          onUnlocked={handleUnlocked}
          onMfaRequired={handleMfaRequired}
          onError={setError}
        />
      )}

      {view === "mfa" && (
        <MfaVerify
          mfaToken={mfaToken}
          password={loginCredentials.password}
          pin={loginCredentials.pin}
          onUnlocked={handleUnlocked}
          onError={setError}
        />
      )}

      {view === "vault" && vault.status === "unlocked" && (
        <VaultList saladiers={vault.saladiers} />
      )}

      {view === "bridge" && <BridgeSearch />}

      {view === "generator" && <Generator />}

      {view === "settings" && <Settings />}
    </div>
  );
}

/** Bridge mode: search via desktop app */
function BridgeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleSearch() {
    if (!query.trim()) return;
    setStatus("loading");
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "BRIDGE_SEARCH",
        payload: { query: query.trim() },
      });
      if (resp.ok) {
        setResults(resp.data || []);
        setStatus("idle");
      } else {
        setResults([]);
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  async function handleCopy(feuilleId: string) {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "BRIDGE_GET_CREDENTIALS",
        payload: { feuille_id: feuilleId },
      });
      if (resp.ok) {
        await chrome.runtime.sendMessage({
          type: "COPY_TO_CLIPBOARD",
          payload: { text: resp.data.password },
        });
        setCopiedId(feuilleId);
        setTimeout(() => setCopiedId(""), 2000);
      }
    } catch {
      // ignore
    }
  }

  async function handleAutofill(feuilleId: string) {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "BRIDGE_GET_CREDENTIALS",
        payload: { feuille_id: feuilleId },
      });
      if (resp.ok) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "AUTOFILL",
            payload: { username: resp.data.username, password: resp.data.password },
          });
          window.close();
        }
      }
    } catch {
      // ignore
    }
  }

  // Auto-search with current page URL on mount
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) {
        try {
          const hostname = new URL(tab.url).hostname.replace("www.", "");
          setQuery(hostname);
          // Trigger search
          chrome.runtime.sendMessage({
            type: "BRIDGE_SEARCH",
            payload: { query: hostname },
          }).then((resp: any) => {
            if (resp.ok) setResults(resp.data || []);
          });
        } catch {
          // Invalid URL
        }
      }
    });
  }, []);

  return (
    <div class="panel">
      <div class="search-row">
        <input
          class="input"
          type="text"
          placeholder="Rechercher..."
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button class="btn primary" onClick={handleSearch} disabled={status === "loading"}>
          🔍
        </button>
      </div>

      {status === "error" && (
        <p class="hint error">L'app desktop est verrouillée ou inaccessible.</p>
      )}

      <div class="results-list">
        {results.map((r) => (
          <div class="result-item" key={r.feuille_id}>
            <div class="result-info">
              <strong>{r.title}</strong>
              <span class="result-username">{r.username}</span>
            </div>
            <div class="result-actions">
              <button
                class="btn-icon"
                title="Remplir automatiquement"
                onClick={() => handleAutofill(r.feuille_id)}
              >
                ✏️
              </button>
              <button
                class="btn-icon"
                title="Copier le mot de passe"
                onClick={() => handleCopy(r.feuille_id)}
              >
                {copiedId === r.feuille_id ? "✓" : "📋"}
              </button>
            </div>
          </div>
        ))}
        {results.length === 0 && query && status === "idle" && (
          <p class="hint">Aucun résultat</p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "preact/hooks";
import type { StateResponse } from "../../shared/message-types";
import type { VaultState } from "../../shared/types";
import { Pairing } from "./Pairing";
import { Login } from "./Login";
import { MfaVerify } from "./MfaVerify";
import { VaultList } from "./VaultList";
import { Generator } from "./Generator";
import { Settings } from "./Settings";

type View = "loading" | "pairing" | "login" | "mfa" | "vault" | "generator" | "settings";

export function App() {
  const [view, setView] = useState<View>("loading");
  const [vault, setVault] = useState<VaultState>({ status: "locked" });
  const [mfaToken, setMfaToken] = useState("");
  const [loginCredentials, setLoginCredentials] = useState({ password: "", pin: "" });
  const [error, setError] = useState("");

  useEffect(() => {
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
        <h1 class="logo">🥗 SaladVault</h1>
        {view === "vault" && (
          <nav class="nav-icons">
            <button title="Générateur" onClick={() => setView("generator")}>🔑</button>
            <button title="Paramètres" onClick={() => setView("settings")}>⚙️</button>
            <button title="Verrouiller" onClick={handleLock}>🔒</button>
          </nav>
        )}
        {(view === "generator" || view === "settings") && (
          <nav class="nav-icons">
            <button title="Retour" onClick={() => setView("vault")}>←</button>
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

      {view === "generator" && <Generator />}

      {view === "settings" && <Settings />}
    </div>
  );
}

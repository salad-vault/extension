import { useEffect, useState } from "preact/hooks";
import type { ExtensionSettings } from "../../shared/types";
import { DEFAULT_API_URL } from "../../shared/constants";

export function Settings() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [autoLock, setAutoLock] = useState(15);
  const [clipboardClear, setClipboardClear] = useState(30);
  const [saved, setSaved] = useState(false);

  // Bridge state
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeAuthenticated, setBridgeAuthenticated] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingMsg, setPairingMsg] = useState("");

  useEffect(() => {
    chrome.storage.local.get("settings").then((result) => {
      const s = result.settings as ExtensionSettings | undefined;
      if (s) {
        setApiUrl(s.api_url || DEFAULT_API_URL);
        setAutoLock(s.auto_lock_minutes);
        setClipboardClear(s.clipboard_clear_seconds);
      }
    });
    // Check bridge status
    chrome.runtime.sendMessage({ type: "BRIDGE_STATUS" }).then((resp: any) => {
      if (resp.ok) {
        setBridgeConnected(resp.data.connected);
        setBridgeAuthenticated(resp.data.authenticated);
      }
    });
  }, []);

  async function handleSave() {
    await chrome.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      payload: {
        api_url: apiUrl,
        auto_lock_minutes: autoLock,
        clipboard_clear_seconds: clipboardClear,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handlePairBridge() {
    if (!pairingCode || pairingCode.length !== 6) {
      setPairingMsg("Entrez le code à 6 chiffres affiché dans l'app desktop");
      return;
    }
    setPairingLoading(true);
    setPairingMsg("");
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "BRIDGE_PAIR",
        payload: { code: pairingCode },
      });
      if (resp.ok) {
        setBridgeAuthenticated(true);
        setPairingMsg("Appairage réussi !");
        setPairingCode("");
      } else {
        setPairingMsg(resp.error || "Code invalide");
      }
    } catch (err: any) {
      setPairingMsg(err.message || "Erreur");
    }
    setPairingLoading(false);
  }

  return (
    <div class="panel">
      <h2>Paramètres</h2>

      {/* Bridge section */}
      <div class="settings-section">
        <h3>Application Desktop</h3>
        <div class="bridge-status">
          <span class={`status-dot ${bridgeConnected ? (bridgeAuthenticated ? "green" : "orange") : "red"}`} />
          <span>
            {bridgeAuthenticated
              ? "Connecté à l'app desktop"
              : bridgeConnected
              ? "Connecté, appairage requis"
              : "App desktop non détectée"}
          </span>
        </div>

        {bridgeConnected && !bridgeAuthenticated && (
          <div class="pair-form">
            <p class="hint">
              Dans l'app desktop : Paramètres → Extension → Générer un code
            </p>
            <div class="pair-row">
              <input
                class="input"
                type="text"
                maxLength={6}
                placeholder="000000"
                value={pairingCode}
                onInput={(e) => setPairingCode((e.target as HTMLInputElement).value)}
              />
              <button class="btn primary" onClick={handlePairBridge} disabled={pairingLoading}>
                {pairingLoading ? "..." : "Appairer"}
              </button>
            </div>
            {pairingMsg && <p class="hint">{pairingMsg}</p>}
          </div>
        )}

        {bridgeAuthenticated && (
          <p class="hint success">Les identifiants sont fournis directement par l'app desktop.</p>
        )}
      </div>

      <hr class="divider" />

      {/* Existing settings */}
      <div class="form-row">
        <label>URL de l'API</label>
        <input
          class="input"
          type="url"
          value={apiUrl}
          onInput={(e) => setApiUrl((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="form-row">
        <label>Verrouillage auto (minutes)</label>
        <select
          class="input"
          value={autoLock}
          onChange={(e) => setAutoLock(Number((e.target as HTMLSelectElement).value))}
        >
          <option value={1}>1 minute</option>
          <option value={5}>5 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={0}>Jamais</option>
        </select>
      </div>

      <div class="form-row">
        <label>Effacer presse-papiers (secondes)</label>
        <input
          class="input"
          type="number"
          min={0}
          max={300}
          value={clipboardClear}
          onInput={(e) => setClipboardClear(Number((e.target as HTMLInputElement).value))}
        />
      </div>

      <button class="btn primary" onClick={handleSave}>
        {saved ? "Enregistré ✓" : "Enregistrer"}
      </button>
    </div>
  );
}

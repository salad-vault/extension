import { useEffect, useState } from "preact/hooks";
import type { ExtensionSettings } from "../../shared/types";
import { DEFAULT_API_URL } from "../../shared/constants";

export function Settings() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [autoLock, setAutoLock] = useState(15);
  const [clipboardClear, setClipboardClear] = useState(30);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get("settings").then((result) => {
      const s = result.settings as ExtensionSettings | undefined;
      if (s) {
        setApiUrl(s.api_url || DEFAULT_API_URL);
        setAutoLock(s.auto_lock_minutes);
        setClipboardClear(s.clipboard_clear_seconds);
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

  return (
    <div class="panel">
      <h2>Paramètres</h2>

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

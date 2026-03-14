import { useState } from "preact/hooks";

export function Generator() {
  const [length, setLength] = useState(20);
  const [type, setType] = useState<"random" | "passphrase">("random");
  const [generated, setGenerated] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    const resp = await chrome.runtime.sendMessage({
      type: "GENERATE_PASSWORD",
      payload: { length, type },
    });
    if (resp.ok) {
      setGenerated(resp.data as string);
      setCopied(false);
    }
  }

  async function copy() {
    if (!generated) return;
    await chrome.runtime.sendMessage({
      type: "COPY_TO_CLIPBOARD",
      payload: { text: generated },
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="panel">
      <h2>Générateur de mots de passe</h2>

      <div class="form-row">
        <label>Type</label>
        <div class="tab-bar">
          <button
            class={type === "random" ? "tab active" : "tab"}
            onClick={() => setType("random")}
          >
            Aléatoire
          </button>
          <button
            class={type === "passphrase" ? "tab active" : "tab"}
            onClick={() => setType("passphrase")}
          >
            Phrase
          </button>
        </div>
      </div>

      <div class="form-row">
        <label>Longueur : {length}</label>
        <input
          type="range"
          min={type === "random" ? 12 : 20}
          max={type === "random" ? 128 : 60}
          value={length}
          onInput={(e) => setLength(Number((e.target as HTMLInputElement).value))}
        />
      </div>

      <button class="btn primary" onClick={generate}>
        Générer
      </button>

      {generated && (
        <div class="generated-output">
          <code class="generated-text">{generated}</code>
          <button class="btn-icon" onClick={copy} title="Copier">
            {copied ? "✓" : "📋"}
          </button>
        </div>
      )}
    </div>
  );
}

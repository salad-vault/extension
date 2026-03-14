import { useState } from "preact/hooks";

interface Props {
  onPaired: () => void;
  onError: (msg: string) => void;
}

export function Pairing({ onPaired, onError }: Props) {
  const [mode, setMode] = useState<"phrase" | "code">("phrase");
  const [phrase, setPhrase] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!pin || pin.length < 4) {
      onError("Le PIN doit contenir au moins 4 caractères");
      return;
    }

    setLoading(true);
    onError("");

    try {
      const msg = mode === "phrase"
        ? { type: "PAIR_DEVICE" as const, payload: { phrase, pin } }
        : { type: "PAIR_DEVICE_CODE" as const, payload: { code, pin } };

      const resp = await chrome.runtime.sendMessage(msg);
      if (!resp.ok) {
        onError(resp.error || "Échec de l'appairage");
        return;
      }
      onPaired();
    } catch (err: any) {
      onError(err.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="panel">
      <h2>Appairer l'appareil</h2>
      <p class="hint">
        Entrez la phrase de récupération ou le code d'appairage depuis votre application de bureau.
      </p>

      <div class="tab-bar">
        <button
          class={mode === "phrase" ? "tab active" : "tab"}
          onClick={() => setMode("phrase")}
        >
          Phrase BIP39
        </button>
        <button
          class={mode === "code" ? "tab active" : "tab"}
          onClick={() => setMode("code")}
        >
          Code d'appairage
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === "phrase" ? (
          <textarea
            class="input"
            rows={3}
            placeholder="mot1 mot2 mot3 ..."
            value={phrase}
            onInput={(e) => setPhrase((e.target as HTMLTextAreaElement).value)}
            required
          />
        ) : (
          <input
            class="input"
            type="text"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={code}
            onInput={(e) => setCode((e.target as HTMLInputElement).value)}
            required
          />
        )}

        <input
          class="input"
          type="password"
          placeholder="PIN (min. 4 caractères)"
          value={pin}
          onInput={(e) => setPin((e.target as HTMLInputElement).value)}
          minLength={4}
          required
        />

        <button class="btn primary" type="submit" disabled={loading}>
          {loading ? "Appairage..." : "Appairer"}
        </button>
      </form>
    </div>
  );
}

import { useState } from "preact/hooks";
import type { VaultState } from "../../shared/types";

interface Props {
  mfaToken: string;
  password: string;
  pin: string;
  onUnlocked: (state: VaultState) => void;
  onError: (msg: string) => void;
}

export function MfaVerify({ mfaToken, password, pin, onUnlocked, onError }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setLoading(true);
    onError("");

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "MFA_VERIFY",
        payload: { mfa_token: mfaToken, totp_code: code },
      });

      if (!resp.ok) {
        onError(resp.error || "Code MFA invalide");
        return;
      }

      onUnlocked(resp.data as VaultState);
    } catch (err: any) {
      onError(err.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="panel">
      <h2>Vérification MFA</h2>
      <p class="hint">Entrez le code à 6 chiffres de votre application d'authentification.</p>
      <form onSubmit={handleSubmit}>
        <input
          class="input code-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          value={code}
          onInput={(e) => setCode((e.target as HTMLInputElement).value)}
          autoFocus
          required
        />
        <button class="btn primary" type="submit" disabled={loading || code.length !== 6}>
          {loading ? "Vérification..." : "Vérifier"}
        </button>
      </form>
    </div>
  );
}

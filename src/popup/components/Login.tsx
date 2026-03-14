import { useState } from "preact/hooks";
import type { VaultState } from "../../shared/types";

interface Props {
  onUnlocked: (state: VaultState) => void;
  onMfaRequired: (token: string, password: string, pin: string) => void;
  onError: (msg: string) => void;
}

export function Login({ onUnlocked, onMfaRequired, onError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setLoading(true);
    onError("");

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "UNLOCK",
        payload: { email, password, pin },
      });

      if (!resp.ok) {
        if (resp.mfa_token) {
          onMfaRequired(resp.mfa_token, password, pin);
          return;
        }
        onError(resp.error || "Identifiants invalides");
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
      <h2>Déverrouiller</h2>
      <form onSubmit={handleSubmit}>
        <input
          class="input"
          type="email"
          placeholder="Email"
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          required
        />
        <input
          class="input"
          type="password"
          placeholder="Mot de passe maître"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          required
        />
        <input
          class="input"
          type="password"
          placeholder="PIN"
          value={pin}
          onInput={(e) => setPin((e.target as HTMLInputElement).value)}
          minLength={4}
          required
        />
        <button class="btn primary" type="submit" disabled={loading}>
          {loading ? (
            <span>
              <span class="spinner-small" /> Déverrouillage...
            </span>
          ) : (
            "Déverrouiller"
          )}
        </button>
      </form>
    </div>
  );
}

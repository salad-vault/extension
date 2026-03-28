/**
 * MV3 background service worker.
 * Routes messages between popup/content scripts and the vault/crypto modules.
 */

import type {
  BackgroundMessage,
  BackgroundResponse,
  ContentToBackgroundMessage,
  StateResponse,
  OffscreenResponse,
} from "../shared/message-types";
import type { VaultState } from "../shared/types";
import * as vaultManager from "../shared/vault-manager";
import { MfaRequiredError } from "../shared/vault-manager";
import * as storage from "../shared/storage";
import * as apiClient from "../shared/api-client";
import { handleOffscreenResponse, generatePassword } from "../shared/crypto-bridge";
import {
  ALARM_AUTO_LOCK,
  ALARM_PERIODIC_SYNC,
  SYNC_INTERVAL_MINUTES,
  DEFAULT_CLIPBOARD_CLEAR_MS,
} from "../shared/constants";
import { bridgeClient } from "../shared/bridge-client";

// ── Message routing ──

chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  // Check for offscreen responses first
  if (msg.type === "RESULT" || msg.type === "ERROR") {
    handleOffscreenResponse(msg as OffscreenResponse);
    return false;
  }

  // Content script messages
  if (msg.type === "CREDENTIALS_SUBMITTED" || msg.type === "PASSWORD_FIELD_FOCUSED" || msg.type === "PASSWORD_FIELD_BLURRED") {
    handleContentMessage(msg as ContentToBackgroundMessage, sender);
    return false;
  }

  // Popup / background messages
  handleBackgroundMessage(msg as BackgroundMessage)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // Keep message channel open for async response
});

async function handleBackgroundMessage(msg: BackgroundMessage): Promise<any> {
  switch (msg.type) {
    case "GET_STATE": {
      const vault = await vaultManager.getState();
      const connected = await apiClient.isConnected();
      const has_device_key = await storage.hasDeviceKey();
      return { vault, connected, has_device_key } satisfies StateResponse;
    }

    case "UNLOCK": {
      try {
        const saladiers = await vaultManager.unlock(
          msg.payload.email,
          msg.payload.password,
          msg.payload.pin
        );
        resetAutoLockAlarm();
        return { ok: true, data: { status: "unlocked", saladiers } satisfies VaultState };
      } catch (err) {
        if (err instanceof MfaRequiredError) {
          return { ok: false, mfa_token: err.mfaToken, error: "MFA required" };
        }
        throw err;
      }
    }

    case "MFA_VERIFY": {
      // Need stored password and pin — for now, the popup must re-send them
      // This is handled through the completeMfa flow
      const resp = await apiClient.mfaVerify(msg.payload.mfa_token, msg.payload.totp_code);
      return { ok: true, data: resp };
    }

    case "LOCK": {
      await vaultManager.lock();
      chrome.alarms.clear(ALARM_AUTO_LOCK);
      return { ok: true };
    }

    case "SYNC_PULL": {
      const saladiers = await vaultManager.syncPull();
      return { ok: true, data: { status: "unlocked", saladiers } satisfies VaultState };
    }

    case "SEARCH": {
      const results = vaultManager.search(msg.payload.query);
      return { ok: true, data: results };
    }

    case "GET_FEUILLES_FOR_URL": {
      const feuilles = vaultManager.getFeuillesForUrl(msg.payload.url);
      return { ok: true, data: feuilles };
    }

    case "GENERATE_PASSWORD": {
      const pwd = await generatePassword(msg.payload.length, msg.payload.type);
      return { ok: true, data: pwd };
    }

    case "COPY_TO_CLIPBOARD": {
      // Use offscreen document for clipboard access in MV3
      await copyToClipboard(msg.payload.text);
      return { ok: true };
    }

    case "PAIR_DEVICE": {
      const key = phraseToDeviceKey(msg.payload.phrase);
      await storage.storeDeviceKey(key, msg.payload.pin);
      return { ok: true };
    }

    case "PAIR_DEVICE_CODE": {
      const key = pairingCodeToDeviceKey(msg.payload.code);
      await storage.storeDeviceKey(key, msg.payload.pin);
      return { ok: true };
    }

    case "LOGIN": {
      const { computeBlindIndex, computeServerAuthHash } = await import("../shared/crypto-bridge");
      const blindId = await computeBlindIndex(msg.payload.email);
      const encoder = new TextEncoder();
      const saltResp = await apiClient.getSalt(blindId);
      const saltBytes = base64ToBytes(saltResp);
      const authHash = await computeServerAuthHash(
        encoder.encode(msg.payload.password),
        saltBytes
      );
      const result = await apiClient.login(blindId, authHash);
      return { ok: true, data: result };
    }

    case "CHECK_DEVICE_KEY": {
      const has = await storage.hasDeviceKey();
      return { ok: true, data: has };
    }

    case "UPDATE_SETTINGS": {
      await storage.saveSettings(msg.payload);
      if (msg.payload.auto_lock_minutes !== undefined) {
        resetAutoLockAlarm();
      }
      return { ok: true };
    }

    // ── Bridge (desktop app) commands ──

    case "BRIDGE_STATUS": {
      return {
        ok: true,
        data: {
          connected: bridgeClient.connected,
          authenticated: bridgeClient.authenticated,
        },
      };
    }

    case "BRIDGE_PAIR": {
      const token = await bridgeClient.pair(msg.payload.code);
      return { ok: true, data: { token } };
    }

    case "BRIDGE_SEARCH": {
      const results = await bridgeClient.search(msg.payload.query);
      return { ok: true, data: results };
    }

    case "BRIDGE_GET_CREDENTIALS": {
      const creds = await bridgeClient.getCredentials(msg.payload.feuille_id);
      return { ok: true, data: creds };
    }

    default:
      return { ok: false, error: "Unknown message type" };
  }
}

async function handleContentMessage(msg: ContentToBackgroundMessage, sender: chrome.runtime.MessageSender) {
  switch (msg.type) {
    case "PASSWORD_FIELD_FOCUSED":
      if (sender.tab?.id) {
        chrome.action.setBadgeText({ text: "●", tabId: sender.tab.id });
        chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId: sender.tab.id });

        // If bridge is authenticated, search for matching credentials
        if (bridgeClient.authenticated && msg.payload.url) {
          try {
            const hostname = new URL(msg.payload.url).hostname.replace("www.", "");
            const results = await bridgeClient.search(hostname);
            if (results.length > 0) {
              // Get full credentials for the best match and autofill
              const creds = await bridgeClient.getCredentials(results[0].feuille_id);
              chrome.tabs.sendMessage(sender.tab.id!, {
                type: "AUTOFILL",
                payload: { username: creds.username, password: creds.password },
              });
            }
          } catch {
            // Bridge not available or app locked — ignore
          }
        }
      }
      break;

    case "PASSWORD_FIELD_BLURRED":
      if (sender.tab?.id) {
        chrome.action.setBadgeText({ text: "", tabId: sender.tab.id });
      }
      break;

    case "CREDENTIALS_SUBMITTED":
      // v1: just log — future: offer to save
      console.log("[SaladVault] Credentials submitted for:", msg.payload.url);
      break;
  }
}

// ── Alarms ──

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_AUTO_LOCK) {
    await vaultManager.lock();
  }

  if (alarm.name === ALARM_PERIODIC_SYNC) {
    try {
      const unlocked = await storage.isUnlocked();
      if (unlocked) {
        await vaultManager.syncPull();
      }
    } catch {
      // Silently fail periodic sync
    }
  }
});

async function resetAutoLockAlarm() {
  const settings = await storage.getSettings();
  chrome.alarms.clear(ALARM_AUTO_LOCK);
  if (settings.auto_lock_minutes > 0) {
    chrome.alarms.create(ALARM_AUTO_LOCK, {
      delayInMinutes: settings.auto_lock_minutes,
    });
  }
}

// Set up periodic sync
chrome.alarms.create(ALARM_PERIODIC_SYNC, {
  periodInMinutes: SYNC_INTERVAL_MINUTES,
});

// Initialize bridge connection to desktop app
bridgeClient.init().catch(() => {
  // Bridge not available — desktop app may not be running
});

// ── Helpers ──

/** Convert BIP39 phrase to 32-byte device key */
function phraseToDeviceKey(phrase: string): Uint8Array {
  // The phrase encodes the raw 32-byte key
  // Same logic as desktop: each word maps to an index in the BIP39 word list
  // For the extension, we accept the raw hex or base64 encoded key from the pairing process
  const words = phrase.trim().split(/\s+/);
  if (words.length === 1 && /^[0-9a-f]{64}$/i.test(words[0])) {
    // Hex-encoded key
    return hexToBytes(words[0]);
  }
  // Base64-encoded key
  if (words.length === 1) {
    return base64ToBytes(words[0]);
  }
  // BIP39-like phrase — hash it to get a deterministic key
  const encoder = new TextEncoder();
  const data = encoder.encode(phrase.trim().toLowerCase());
  // Use SubtleCrypto to hash — but we're sync here, so use a simple approach
  // The pairing phrase from desktop is actually a hex or base64 of the key
  throw new Error("Format de phrase non reconnu. Utilisez le code d'appairage à la place.");
}

/** Convert pairing code to 32-byte device key */
function pairingCodeToDeviceKey(code: string): Uint8Array {
  // Pairing code is base64url-encoded device key
  const cleaned = code.replace(/[-\s]/g, "");
  return base64ToBytes(cleaned);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function copyToClipboard(text: string): Promise<void> {
  // In MV3, we need to use the offscreen document or activeTab for clipboard
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (t: string) => navigator.clipboard.writeText(t),
        args: [text],
      });

      // Schedule clipboard clear
      const settings = await storage.getSettings();
      const delay = settings.clipboard_clear_seconds * 1000 || DEFAULT_CLIPBOARD_CLEAR_MS;
      setTimeout(async () => {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => navigator.clipboard.writeText(""),
            args: [],
          });
        }
      }, delay);
    }
  } catch {
    // Fallback: ignore clipboard errors
  }
}

/**
 * Content script — injected into every page.
 * Detects password fields, handles autofill, and captures credential submissions.
 */

import { detectPasswordFields } from "./form-detector";
import { fillCredentials } from "./autofill";
import { setupSaveDetector } from "./save-detector";
import type { ContentMessage } from "../shared/message-types";

// Listen for messages from the background service worker
chrome.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
  switch (msg.type) {
    case "AUTOFILL":
      fillCredentials(msg.payload.username, msg.payload.password);
      sendResponse({ ok: true });
      break;

    case "SHOW_SUGGESTIONS":
      // Future: show inline dropdown
      break;

    case "HIDE_SUGGESTIONS":
      // Future: hide inline dropdown
      break;
  }

  return false;
});

// Notify background when a password field is focused
function onPasswordFocus() {
  chrome.runtime.sendMessage({
    type: "PASSWORD_FIELD_FOCUSED",
    payload: { url: window.location.href },
  });
}

function onPasswordBlur() {
  chrome.runtime.sendMessage({
    type: "PASSWORD_FIELD_BLURRED",
  });
}

// Observe DOM for password fields
function init() {
  const passwordFields = detectPasswordFields();
  for (const field of passwordFields) {
    field.addEventListener("focus", onPasswordFocus);
    field.addEventListener("blur", onPasswordBlur);
  }

  // Set up save detection for form submissions
  setupSaveDetector();

  // Watch for dynamically added forms (SPA navigation)
  const observer = new MutationObserver(() => {
    const newFields = detectPasswordFields();
    for (const field of newFields) {
      if (!field.dataset.svObserved) {
        field.dataset.svObserved = "1";
        field.addEventListener("focus", onPasswordFocus);
        field.addEventListener("blur", onPasswordBlur);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

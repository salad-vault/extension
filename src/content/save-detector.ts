/**
 * Detect credential submissions on forms and notify the background script.
 */

import { detectPasswordFields, findUsernameField } from "./form-detector";

/** Set up listeners to capture form submissions containing credentials */
export function setupSaveDetector(): void {
  // Intercept form submit events
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target as HTMLFormElement;
      captureFromForm(form);
    },
    true
  );

  // Also intercept clicks on submit-like buttons (for AJAX-driven forms)
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest<HTMLElement>(
        'button[type="submit"], input[type="submit"], button:not([type])'
      );
      if (!button) return;

      const form = button.closest("form");
      if (form) {
        // Delay to let the form process
        setTimeout(() => captureFromForm(form), 100);
      }
    },
    true
  );
}

function captureFromForm(form: HTMLFormElement): void {
  const passwordField = form.querySelector<HTMLInputElement>(
    'input[type="password"]'
  );
  if (!passwordField || !passwordField.value) return;

  const usernameField = findUsernameField(passwordField);
  const username = usernameField?.value || "";

  chrome.runtime.sendMessage({
    type: "CREDENTIALS_SUBMITTED",
    payload: {
      url: window.location.href,
      username,
      password: passwordField.value,
    },
  });
}

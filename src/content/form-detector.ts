/**
 * Detect password input fields and their associated username fields.
 */

/** Find all password input fields on the page */
export function detectPasswordFields(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  );
}

/** Find the username field associated with a password field */
export function findUsernameField(
  passwordField: HTMLInputElement
): HTMLInputElement | null {
  const form = passwordField.closest("form");
  const searchContext = form || document;

  // 1. Look for inputs with autocomplete="username" or "email"
  const byAutocomplete = searchContext.querySelector<HTMLInputElement>(
    'input[autocomplete="username"], input[autocomplete="email"]'
  );
  if (byAutocomplete) return byAutocomplete;

  // 2. Look for inputs with common name/id patterns
  const namePatterns = /user|email|login|account|identifier|identifiant/i;
  const candidates = Array.from(
    searchContext.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="email"], input:not([type])'
    )
  ).filter((el) => {
    const name = el.name || el.id || el.getAttribute("autocomplete") || "";
    return namePatterns.test(name);
  });

  if (candidates.length > 0) return candidates[0];

  // 3. Look for the closest text/email input before the password field in DOM order
  const allFormInputs = Array.from(
    searchContext.querySelectorAll<HTMLInputElement>("input")
  );
  const passwordIndex = allFormInputs.indexOf(passwordField);

  for (let i = passwordIndex - 1; i >= 0; i--) {
    const el = allFormInputs[i];
    const type = el.type?.toLowerCase();
    if (type === "text" || type === "email" || !el.type) {
      return el;
    }
  }

  return null;
}

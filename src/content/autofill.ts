/**
 * Autofill credentials into form fields.
 * Dispatches native events so that framework-driven forms (React, Vue, Angular) detect the change.
 */

import { detectPasswordFields, findUsernameField } from "./form-detector";

/** Fill username and password fields on the page */
export function fillCredentials(username: string, password: string): void {
  const passwordFields = detectPasswordFields();
  if (passwordFields.length === 0) return;

  // Use the first visible password field
  const passwordField =
    passwordFields.find((f) => isVisible(f)) || passwordFields[0];

  // Fill password
  setNativeValue(passwordField, password);
  dispatchInputEvents(passwordField);

  // Find and fill username
  const usernameField = findUsernameField(passwordField);
  if (usernameField) {
    setNativeValue(usernameField, username);
    dispatchInputEvents(usernameField);
  }
}

/** Set value using the native setter to bypass React's synthetic events */
function setNativeValue(element: HTMLInputElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }
}

/** Dispatch the full set of events that form frameworks listen to */
function dispatchInputEvents(element: HTMLInputElement): void {
  element.dispatchEvent(new Event("focus", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

/** Check if an element is visible */
function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0
  );
}

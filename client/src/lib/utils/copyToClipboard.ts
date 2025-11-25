/**
 * Copies the given text to the clipboard using the Clipboard API.
 */
export function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Failed to copy text to clipboard:", err);
    });
  } else {
    console.warn("Clipboard API not available.");
  }
}

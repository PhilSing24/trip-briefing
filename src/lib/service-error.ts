/**
 * Map a failed tool/LLM call to a clean, user-facing reason (PROJECT_SPEC §9.2).
 *
 * A briefing with a *silent* gap is bad, but dumping a raw provider error into a
 * card — e.g. Anthropic's "You have reached your specified API usage limits…"
 * JSON — is worse: it leaks internals and looks broken. This returns an honest,
 * neutral line for the card and logs the real error server-side for debugging.
 */
export function serviceUnavailableReason(error: unknown, service: string): string {
  // Keep the real error in the server logs; keep it out of the UI.
  console.error(`[briefing] ${service} unavailable:`, error);

  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: number }).status
      : undefined;
  const message = error instanceof Error ? error.message : "";

  // Transient overload — worth inviting a retry.
  if (status === 429 || /rate.?limit|overloaded/i.test(message)) {
    return `The ${service} service is busy right now — try again in a moment.`;
  }
  // Account-level quota/billing (e.g. the Anthropic usage-limit error) — not a
  // retry-now situation, but don't expose the provider's wording.
  if (/usage limit|quota|insufficient|credit|billing/i.test(message)) {
    return `The ${service} service is temporarily unavailable. Try again later.`;
  }
  return `Couldn't check ${service} right now.`;
}

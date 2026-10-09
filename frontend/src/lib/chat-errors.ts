/* Recognising the two store failures the chat page explains instead of
   reporting as a generic error. */

/* Collect the human-readable text of an error from any of the shapes the API
   client or the server can hand back. */
export function errorText(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const body = error as { message?: unknown; error?: unknown; detail?: unknown }
    return [body.message, body.error, body.detail].filter((v): v is string => typeof v === "string").join(" ")
  }
  return ""
}

/*
 * A session with the message store disabled rejects every store read with a
 * 400 that names the two settings to change.
 */
export function isStoreDisabledError(error: unknown): boolean {
  const text = errorText(error)
  return /enable noweb store/i.test(text) || /noweb\.store\.enabled/i.test(text)
}

/*
 * The message store lives in the configured database, so a refused or timed
 * out database connection arrives here as the reason every store read failed.
 */
const DATABASE_UNREACHABLE_PATTERN =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|getaddrinfo|ENOTFOUND|connection refused|connection terminated|could not connect to server|the database system is starting up|remaining connection slots/i

export function isDatabaseUnreachableError(error: unknown): boolean {
  return DATABASE_UNREACHABLE_PATTERN.test(errorText(error))
}

export type StoreFailure = "store-disabled" | "database-unreachable" | "other"

export function classifyStoreError(error: unknown): StoreFailure {
  if (isDatabaseUnreachableError(error)) return "database-unreachable"
  if (isStoreDisabledError(error)) return "store-disabled"
  return "other"
}

export const STORE_DISABLED_TITLE = "Chat history is unavailable"
export const STORE_DISABLED_DESCRIPTION =
  "This session is running without a message store, so BunWa cannot read chats, messages or contacts. Enable the store in the session settings and restart the session. History backfill also needs full sync enabled."

export const DATABASE_UNREACHABLE_TITLE = "The database is unreachable"
export const DATABASE_UNREACHABLE_DESCRIPTION =
  "BunWa cannot reach the database that stores chats and messages. Check that WAHA_DATABASE_URL points at the right server and that the database service is running, then retry."

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Largest single upload, in bytes. */
export function uploadMaxBytes(): number {
  return positiveInt(process.env.UPLOAD_MAX_BYTES, 100 * 1024 * 1024);
}

/** How long an upload is kept before the sweep deletes it. */
export function uploadTtlSeconds(): number {
  return positiveInt(process.env.UPLOAD_TTL_SECONDS, 24 * 60 * 60);
}

/** How long an upload ticket URL stays valid. */
export function uploadTicketTtlSeconds(): number {
  return positiveInt(process.env.UPLOAD_TICKET_TTL_SECONDS, 15 * 60);
}

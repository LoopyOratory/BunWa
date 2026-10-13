/**
 * Turns an upload reference into the `{ data, mimetype, filename }` object
 * both engines accept, before the send reaches the engine. Runs in the route
 * and MCP layers so neither engine needs to know uploads exist.
 */
import { UnprocessableEntityException } from '../exceptions';
import { UploadStore } from './upload-store';

const PREFIX = 'upload:';

export function parseUploadRef(file: unknown): { id: string; filename?: string; mimetype?: string } | null {
  if (typeof file === 'string') {
    return file.startsWith(PREFIX) ? { id: file.slice(PREFIX.length).trim() } : null;
  }
  if (file && typeof file === 'object' && typeof (file as any).upload === 'string') {
    const f = file as any;
    return { id: f.upload.trim(), filename: f.filename, mimetype: f.mimetype };
  }
  return null;
}

export async function resolveUploadFile(session: string, file: unknown, store = new UploadStore()): Promise<unknown> {
  const ref = parseUploadRef(file);
  if (!ref) return file;
  const record = ref.id ? await store.get(session, ref.id) : null;
  if (!record) {
    throw new UnprocessableEntityException(
      `No upload '${ref.id}' for session '${session}'. It may have expired; create a new one with an upload ticket.`,
    );
  }
  const data = Buffer.from(await Bun.file(store.dataPath(session, ref.id)).arrayBuffer());
  return {
    data,
    mimetype: ref.mimetype || record.mimetype,
    filename: ref.filename || record.filename,
  };
}

export async function resolveUploadRefs<T extends Record<string, any>>(
  session: string,
  body: T,
  store = new UploadStore(),
): Promise<T> {
  if (body && 'file' in body) {
    (body as any).file = await resolveUploadFile(session, body.file, store);
  }
  return body;
}

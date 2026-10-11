/**
 * Normalise the poll a caller sends into the shape the engine needs.
 *
 * The REST API documents a poll as { name, options, multipleAnswers }; the MCP
 * tool and Baileys itself call the same things { name, values, selectableCount }.
 * Callers (and agents) use whichever they find first, so both vocabularies are
 * accepted — before this, the engine read only `options`, and the MCP tool sent
 * only `values`, so every MCP poll failed with "requires name and at least one
 * option" however valid it was.
 */
import { UnprocessableEntityException } from '../exceptions';

/** WhatsApp's own limit on poll choices. */
export const MAX_POLL_OPTIONS = 12;

export interface NormalizedPoll {
  name: string;
  values: string[];
  selectableCount: number;
}

function optionText(option: unknown): string {
  if (typeof option === 'string') {
    return option.trim();
  }
  if (option && typeof option === 'object') {
    const named = (option as any).name ?? (option as any).text ?? (option as any).title;
    if (typeof named === 'string') {
      return named.trim();
    }
  }
  return '';
}

export function normalizePoll(poll: any): NormalizedPoll {
  if (!poll || typeof poll !== 'object') {
    throw new UnprocessableEntityException('Missing poll data');
  }
  const name = typeof poll.name === 'string' ? poll.name.trim() : '';
  const rawOptions = Array.isArray(poll.options)
    ? poll.options
    : Array.isArray(poll.values)
      ? poll.values
      : [];
  const values = rawOptions.map(optionText).filter((value: string) => value.length > 0);

  if (!name || values.length === 0) {
    throw new UnprocessableEntityException(
      'Poll requires a name (the question) and at least one option, sent as `options` (or `values`).',
    );
  }
  if (values.length > MAX_POLL_OPTIONS) {
    throw new UnprocessableEntityException(
      `A poll can have at most ${MAX_POLL_OPTIONS} options; got ${values.length}.`,
    );
  }
  if (new Set(values).size !== values.length) {
    throw new UnprocessableEntityException('Poll options must be unique.');
  }

  let selectableCount = 1;
  if (poll.selectableCount !== undefined && poll.selectableCount !== null) {
    const requested = Number(poll.selectableCount);
    if (!Number.isInteger(requested) || requested < 1) {
      throw new UnprocessableEntityException('selectableCount must be a whole number of at least 1.');
    }
    // WhatsApp rejects a poll that lets people pick more options than exist.
    selectableCount = Math.min(requested, values.length);
  } else if (poll.multipleAnswers === true) {
    selectableCount = values.length;
  }
  return { name, values, selectableCount };
}

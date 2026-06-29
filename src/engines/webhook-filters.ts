/**
 * Smart webhook filters — additive pre-filter layer for webhook triggers.
 * A webhook with no filters behaves exactly as before. When filters are present,
 * every condition must match (logical AND) for the webhook to fire.
 */

import { toNeutralJid, parseWaId } from '../engines/wa-id';

export type FilterOperator = 'is' | 'isNot' | 'contains' | 'equals';
export type FieldKind = 'id' | 'idArray' | 'text' | 'enum' | 'boolean';

export interface WebhookFilterCondition {
  field: string;
  operator: FilterOperator;
  value: string | string[] | boolean;
  caseSensitive?: boolean;
}

export interface WebhookFilters {
  conditions: WebhookFilterCondition[];
}

export interface FieldDefinition {
  field: string;
  kind: FieldKind;
  operators: FilterOperator[];
  resolve: (data: Record<string, unknown>) => unknown;
  enumValues?: readonly string[];
}

export const MESSAGE_TYPES = [
  'text', 'image', 'video', 'audio', 'voice', 'document',
  'sticker', 'location', 'contact', 'revoked', 'unknown',
] as const;

export const MAX_CONDITIONS = 20;
export const MAX_VALUES_PER_CONDITION = 100;
export const MAX_TEXT_VALUE_LENGTH = 1000;

const ID_OPERATORS: FilterOperator[] = ['is', 'isNot'];
const TEXT_OPERATORS: FilterOperator[] = ['contains', 'equals'];
const ENUM_OPERATORS: FilterOperator[] = ['is', 'isNot'];
const BOOLEAN_OPERATORS: FilterOperator[] = ['is'];

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Canonical actor key for filter comparison — normalizes JID to neutral dialect. */
const canonicalActor = (jid: string, resolve?: LidResolver): string =>
  toNeutralJid(jid, resolve).toLowerCase();

/** Canonical input — normalizes user-typed filter value. Bare digits become phone@c.us. */
const canonicalInput = (value: string): string => {
  const trimmed = value.trim();
  // Bare phone number (all digits) → normalize to @c.us
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}@c.us`;
  }
  return toNeutralJid(trimmed).toLowerCase();
};

const toStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
};

export type LidResolver = (jid: string) => string | null;

export const FILTER_FIELDS: Record<string, FieldDefinition[]> = {
  message: [
    {
      field: 'sender',
      kind: 'id',
      operators: ID_OPERATORS,
      resolve: data => str(data.author) ?? str(data.from),
    },
    {
      field: 'recipient',
      kind: 'id',
      operators: ID_OPERATORS,
      resolve: data => str(data.to),
    },
    {
      field: 'body',
      kind: 'text',
      operators: TEXT_OPERATORS,
      resolve: data => str(data.body) ?? '',
    },
    {
      field: 'type',
      kind: 'enum',
      operators: ENUM_OPERATORS,
      enumValues: MESSAGE_TYPES,
      resolve: data => str(data.type),
    },
    {
      field: 'isGroup',
      kind: 'boolean',
      operators: BOOLEAN_OPERATORS,
      resolve: data => data.isGroup === true,
    },
    {
      field: 'fromMe',
      kind: 'boolean',
      operators: BOOLEAN_OPERATORS,
      resolve: data => data.fromMe === true,
    },
    {
      field: 'hasMedia',
      kind: 'boolean',
      operators: BOOLEAN_OPERATORS,
      resolve: data => data.media != null,
    },
    {
      field: 'mentions',
      kind: 'idArray',
      operators: ID_OPERATORS,
      resolve: data => (Array.isArray(data.mentionedIds) ? data.mentionedIds : []),
    },
  ],
};

/** `message.received` -> `message`. */
export function eventFamily(event: string): string {
  const dot = event.indexOf('.');
  return dot === -1 ? event : event.slice(0, dot);
}

export function getFieldDefinition(family: string, field: string): FieldDefinition | undefined {
  return FILTER_FIELDS[family]?.find(f => f.field === field);
}

function evaluateCondition(
  def: FieldDefinition,
  condition: WebhookFilterCondition,
  data: Record<string, unknown>,
  resolve?: LidResolver,
): boolean {
  const { operator, value, caseSensitive = false } = condition;
  const resolved = def.resolve(data);

  switch (def.kind) {
    case 'id': {
      const candidates = new Set(toStringArray(value).map(canonicalInput));
      const actual = typeof resolved === 'string' ? resolved : undefined;
      const isMatch = actual != null && candidates.has(canonicalActor(actual, resolve));
      return operator === 'isNot' ? !isMatch : isMatch;
    }

    case 'enum': {
      const candidates = new Set(toStringArray(value));
      const actual = typeof resolved === 'string' ? resolved : undefined;
      const isMatch = actual != null && candidates.has(actual);
      return operator === 'isNot' ? !isMatch : isMatch;
    }

    case 'idArray': {
      const candidates = new Set(toStringArray(value).map(canonicalInput));
      const actual = toStringArray(resolved).map(jid => canonicalActor(jid, resolve));
      const intersects = actual.some(v => candidates.has(v));
      return operator === 'isNot' ? !intersects : intersects;
    }

    case 'boolean':
      return resolved === (value === true);

    case 'text': {
      if (typeof value !== 'string') return true;
      const haystackRaw = typeof resolved === 'string' ? resolved : '';
      const haystack = caseSensitive ? haystackRaw : haystackRaw.toLowerCase();
      const needle = caseSensitive ? value : value.toLowerCase();
      if (operator === 'equals') return haystack === needle;
      return haystack.includes(needle);
    }

    default:
      return true;
  }
}

/**
 * Returns true when the webhook should fire for this event.
 * Absent or empty filters always pass. All conditions must match (AND).
 */
export function evaluateFilters(
  filters: WebhookFilters | null | undefined,
  event: string,
  data: Record<string, unknown>,
  resolve?: LidResolver,
): boolean {
  if (!filters || !Array.isArray(filters.conditions) || filters.conditions.length === 0) {
    return true;
  }
  const family = eventFamily(event);
  for (const condition of filters.conditions) {
    const def = getFieldDefinition(family, condition.field);
    if (!def) continue;
    if (!evaluateCondition(def, condition, data, resolve)) return false;
  }
  return true;
}

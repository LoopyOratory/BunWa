import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type Knex from 'knex';
import { makePostgresKnex } from '../db/knex-postgres';
import type { AgentStore } from './agent.store';
import { externalToolQualifiedName } from './external-mcp.names';
import { BGE_DIMENSIONS } from '../knowledge/model';
import { sealSecret, tryOpenSecret, encryptionConfigured, isSealedSecret } from '../security/secret-box';
import type {
  Agent,
  AgentSkill,
  AddKnowledgeChunkInput,
  AnalyticsEvent,
  Conversation,
  ConversationListFilter,
  ConversationMessage,
  ConversationPage,
  ConversationSummary,
  CreateAgentInput,
  CreateConversationInput,
  CreateConversationMessageInput,
  CreateKnowledgeInput,
  CreateSkillInput,
  CreateExternalMcpServerInput,
  CreateUserProfileFactInput,
  ExternalMcpServer,
  ExternalMcpTool,
  KnowledgeChunk,
  KnowledgeSearchHit,
  KnowledgeSource,
  ModelSettings,
  ModelSettingsSecrets,
  ModelRole,
  ModelRoleSettings,
  ModelRoleSettingsSecrets,
  ProfileContext,
  UpdateExternalMcpServerInput,
  UpdateModelRoleSettingsInput,
  UpdateUserProfileFactInput,
  UpsertExternalMcpToolInput,
  UpsertUserProfileSummaryInput,
  UpsertUserSegmentInput,
  UserProfileFact,
  UserProfileSummary,
  UserSegment,
  RecordEventInput,
  UpdateAgentInput,
  UpdateModelSettingsInput,
  UpsertUserProfileInput,
  UserProfile,
} from './agent.types';

/* -------------------------------------------------------------------------- */
/* SQL client                                                                  */
/* -------------------------------------------------------------------------- */

export interface SqlClient {
  dialect: 'sqlite' | 'postgres';
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  /** SQLite only: load a native extension (sqlite-vec). */
  loadExtension?(path: string): void;
  close(): Promise<void>;
}

export class KnexSqlClient implements SqlClient {
  readonly dialect = 'postgres' as const;
  constructor(private readonly knex: Knex.Knex) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const result = await this.knex.raw(sql, params);
    return (result?.rows ?? []) as T[];
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    await this.knex.raw(sql, params);
  }

  async close(): Promise<void> {
    await this.knex.destroy();
  }
}

export class BunSqliteClient implements SqlClient {
  readonly dialect = 'sqlite' as const;
  constructor(private readonly db: Database) {
    // The agent store takes concurrent runtime writes (messages, events,
    // activity heartbeats) alongside dashboard reads. SQLite defaults make
    // contention an immediate SQLITE_BUSY error instead of a short wait, so
    // every store opens in WAL with a generous busy timeout. Foreign keys are
    // ON for declarative cascades on fresh installs; databases created before
    // the REFERENCES clauses existed keep their manual cascades, which the
    // service performs in the same transactions as the parent delete.
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA busy_timeout = 5000');
    this.db.run('PRAGMA foreign_keys = ON');
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.db.query(sql).all(...params) as T[];
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    this.db.run(sql, params);
  }

  loadExtension(path: string): void {
    this.db.loadExtension(path);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const now = () => new Date().toISOString();

function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function jsonValue(value: string | null | undefined): unknown {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatProfileValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => formatProfileValue(item)).filter(Boolean).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function rowToAgent(row: any): Agent {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    prompt: row.prompt ?? '',
    model: asNullableString(row.model),
    fallbackModel: asNullableString(row.fallback_model),
    voice: asNullableString(row.voice),
    settings: json(row.settings, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToModelSettings(row: any): ModelSettings {
  return {
    id: row.id,
    provider: row.provider ?? 'openai-compatible',
    baseUrl: row.base_url ?? '',
    hasApiKey: typeof row.api_key === 'string' && row.api_key.length > 0,
    model: row.model ?? '',
    fallbackProvider: row.fallback_provider ?? 'openai-compatible',
    fallbackBaseUrl: row.fallback_base_url ?? '',
    hasFallbackApiKey: typeof row.fallback_api_key === 'string' && row.fallback_api_key.length > 0,
    fallbackModel: row.fallback_model ?? '',
    updatedAt: row.updated_at,
  };
}

function rowToModelRoleSettings(row: any): ModelRoleSettings {
  return {
    role: row.role,
    provider: row.provider ?? 'openai-compatible',
    baseUrl: row.base_url ?? '',
    hasApiKey: typeof row.api_key === 'string' && row.api_key.length > 0,
    model: row.model ?? '',
    fallbackProvider: row.fallback_provider ?? 'openai-compatible',
    fallbackBaseUrl: row.fallback_base_url ?? '',
    hasFallbackApiKey: typeof row.fallback_api_key === 'string' && row.fallback_api_key.length > 0,
    fallbackModel: row.fallback_model ?? '',
    updatedAt: row.updated_at,
  };
}

function rowToExternalMcpServer(row: any): ExternalMcpServer {
  const storedHeaders = json<Record<string, string>>(row.headers, {});
  const headers = Object.fromEntries(
    Object.entries(storedHeaders).map(([key, value]) => [key, tryOpenSecret(value) ?? '']),
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    url: row.url,
    headers,
    enabled: bool(row.enabled),
    lastRefreshedAt: asNullableString(row.last_refreshed_at),
    lastError: asNullableString(row.last_error),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToExternalMcpTool(row: any): ExternalMcpTool {
  const serverId = row.server_id;
  const name = row.name;
  return {
    id: row.id,
    serverId,
    serverName: row.server_name ?? '',
    name,
    qualifiedName: externalToolQualifiedName(serverId, name),
    description: row.description ?? '',
    inputSchema: json(row.input_schema, {}),
    annotations: row.annotations ? json(row.annotations, null) : null,
    tier: row.tier === 'write' ? 'write' : 'read',
    destructive: bool(row.destructive),
    enabled: bool(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSkill(row: any): AgentSkill {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    description: row.description ?? '',
    instructions: row.instructions ?? '',
    enabled: bool(row.enabled),
    createdAt: row.created_at,
  };
}

function rowToKnowledge(row: any): KnowledgeSource {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    kind: row.kind,
    content: row.content ?? '',
    status: row.status,
    metadata: json(row.metadata, {}),
    embeddingModel: asNullableString(row.embedding_model),
    chunkCount: Number(row.chunk_count ?? 0),
    error: asNullableString(row.error),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToKnowledgeChunk(row: any): KnowledgeChunk {
  return {
    id: row.id,
    sourceId: row.source_id,
    agentId: row.agent_id,
    index: Number(row.chunk_index),
    text: row.text,
    charCount: Number(row.char_count ?? row.text?.length ?? 0),
    tokenCount: Number(row.token_count ?? 0),
    embeddingModel: asNullableString(row.embedding_model),
    createdAt: row.created_at,
  };
}

function rowToUserProfile(row: any): UserProfile {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: asNullableString(row.display_name),
    phone: asNullableString(row.phone),
    email: asNullableString(row.email),
    timezone: asNullableString(row.timezone),
    locale: asNullableString(row.locale),
    notes: asNullableString(row.notes),
    tags: json(row.tags, []),
    customFields: json(row.custom_fields, {}),
    preferences: json(row.preferences, {}),
    importantDetails: json(row.important_details, {}),
    lastSeenAt: asNullableString(row.last_seen_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUserProfileFact(row: any): UserProfileFact {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind ?? 'other',
    key: row.key,
    value: jsonValue(row.value),
    confidence: Number(row.confidence ?? 0.7),
    source: row.source ?? 'manual',
    sourceRef: asNullableString(row.source_ref),
    evidence: asNullableString(row.evidence),
    firstSeenAt: row.first_seen_at,
    lastConfirmedAt: row.last_confirmed_at,
    expiresAt: asNullableString(row.expires_at),
    sensitivity: row.sensitivity ?? 'normal',
    status: row.status ?? 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUserProfileSummary(row: any): UserProfileSummary {
  return {
    userId: row.user_id,
    summary: row.summary ?? '',
    version: Number(row.version ?? 1),
    tokenCount: Number(row.token_count ?? 0),
    model: row.model ?? '',
    sourceFactIds: json(row.source_fact_ids, []),
    generatedAt: row.generated_at,
  };
}

function rowToUserSegment(row: any): UserSegment {
  return {
    id: row.id,
    userId: row.user_id,
    segmentType: row.segment_type,
    segmentValue: row.segment_value,
    score: row.score == null ? null : Number(row.score),
    reason: row.reason ?? '',
    computedAt: row.computed_at,
    expiresAt: asNullableString(row.expires_at),
  };
}

function rowToConversation(row: any): Conversation {
  return {
    id: row.id,
    agentId: row.agent_id,
    userId: asNullableString(row.user_id),
    channel: row.channel ?? 'whatsapp',
    status: row.status,
    reviewEnabled: bool(row.review_enabled),
    reviewRequestedAt: asNullableString(row.review_requested_at),
    reviewRating: row.review_rating == null ? null : Number(row.review_rating),
    reviewText: asNullableString(row.review_text),
    metadata: json(row.metadata, {}),
    startedAt: row.started_at,
    endedAt: asNullableString(row.ended_at),
  };
}

function rowToConversationMessage(row: any): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    agentId: row.agent_id,
    userId: asNullableString(row.user_id),
    role: row.role,
    channel: row.channel ?? 'whatsapp',
    text: row.text ?? '',
    metadata: json(row.metadata, {}),
    createdAt: row.created_at,
  };
}

function contactFromMetadata(metadata: Record<string, unknown>, userId: string | null): {
  contactName: string | null;
  contactPhone: string | null;
} {
  const name = asNullableString(metadata.contactName)
    ?? asNullableString(metadata.pushName)
    ?? asNullableString(metadata.name);
  const phone = asNullableString(metadata.phone)
    ?? asNullableString(metadata.contactPhone)
    ?? asNullableString(metadata.msisdn)
    ?? userId;
  return { contactName: name, contactPhone: phone };
}

function rowToConversationSummary(row: any): ConversationSummary {
  const conversation = rowToConversation(row);
  const { contactName, contactPhone } = contactFromMetadata(conversation.metadata, conversation.userId);
  return {
    ...conversation,
    messageCount: Number(row.message_count ?? 0),
    lastMessage: asNullableString(row.last_message),
    lastMessageRole: asNullableString(row.last_message_role) as ConversationMessage['role'] | null,
    lastMessageAt: asNullableString(row.last_message_at),
    contactName,
    contactPhone,
  };
}

function rowToEvent(row: any): AnalyticsEvent {
  return {
    id: row.id,
    type: row.type,
    agentId: asNullableString(row.agent_id),
    conversationId: asNullableString(row.conversation_id),
    userId: asNullableString(row.user_id),
    data: json(row.data, {}),
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* SQL store                                                                   */
/* -------------------------------------------------------------------------- */

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS bunwa_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    prompt TEXT NOT NULL DEFAULT '',
    model TEXT,
    fallback_model TEXT,
    voice TEXT,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_agents_status_idx ON bunwa_agents (status)`,
  `CREATE TABLE IF NOT EXISTS bunwa_model_settings (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'openai-compatible',
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT,
    model TEXT NOT NULL DEFAULT '',
    fallback_provider TEXT NOT NULL DEFAULT 'openai-compatible',
    fallback_base_url TEXT NOT NULL DEFAULT '',
    fallback_api_key TEXT,
    fallback_model TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bunwa_model_role_settings (
    role TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'openai-compatible',
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT,
    model TEXT NOT NULL DEFAULT '',
    fallback_provider TEXT NOT NULL DEFAULT 'openai-compatible',
    fallback_base_url TEXT NOT NULL DEFAULT '',
    fallback_api_key TEXT,
    fallback_model TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bunwa_external_mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    headers TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_refreshed_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bunwa_external_mcp_tools (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    input_schema TEXT NOT NULL DEFAULT '{}',
    annotations TEXT,
    tier TEXT NOT NULL DEFAULT 'read',
    destructive INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(server_id, name)
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_external_mcp_tools_server_idx ON bunwa_external_mcp_tools (server_id)`,
  `CREATE TABLE IF NOT EXISTS bunwa_agent_skills (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_agent_skills_agent_idx ON bunwa_agent_skills (agent_id)`,
  `CREATE TABLE IF NOT EXISTS bunwa_knowledge_sources (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    metadata TEXT NOT NULL DEFAULT '{}',
    embedding_model TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_knowledge_sources_agent_idx ON bunwa_knowledge_sources (agent_id)`,
  `CREATE TABLE IF NOT EXISTS bunwa_user_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    display_name TEXT,
    phone TEXT,
    email TEXT,
    timezone TEXT,
    locale TEXT,
    notes TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    custom_fields TEXT NOT NULL DEFAULT '{}',
    preferences TEXT NOT NULL DEFAULT '{}',
    important_details TEXT NOT NULL DEFAULT '{}',
    last_seen_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_user_profiles_user_idx ON bunwa_user_profiles (user_id)`,
  `CREATE TABLE IF NOT EXISTS bunwa_user_profile_facts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'other',
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT 'null',
    confidence REAL NOT NULL DEFAULT 0.7,
    source TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT,
    evidence TEXT,
    first_seen_at TEXT NOT NULL,
    last_confirmed_at TEXT NOT NULL,
    expires_at TEXT,
    sensitivity TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_user_profile_facts_user_idx ON bunwa_user_profile_facts (user_id)`,
  `CREATE INDEX IF NOT EXISTS bunwa_user_profile_facts_status_idx ON bunwa_user_profile_facts (user_id, status)`,
  `CREATE TABLE IF NOT EXISTS bunwa_user_profile_summaries (
    user_id TEXT PRIMARY KEY,
    summary TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    token_count INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT '',
    source_fact_ids TEXT NOT NULL DEFAULT '[]',
    generated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bunwa_user_segments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    segment_type TEXT NOT NULL,
    segment_value TEXT NOT NULL,
    score REAL,
    reason TEXT NOT NULL DEFAULT '',
    computed_at TEXT NOT NULL,
    expires_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_user_segments_user_idx ON bunwa_user_segments (user_id)`,
  `CREATE INDEX IF NOT EXISTS bunwa_user_segments_type_idx ON bunwa_user_segments (user_id, segment_type)`,
  `CREATE TABLE IF NOT EXISTS bunwa_conversations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES bunwa_agents(id) ON DELETE CASCADE,
    user_id TEXT,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    status TEXT NOT NULL DEFAULT 'open',
    review_enabled INTEGER NOT NULL DEFAULT 0,
    review_requested_at TEXT,
    review_rating INTEGER,
    review_text TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    ended_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_conversations_agent_idx ON bunwa_conversations (agent_id)`,
  `CREATE INDEX IF NOT EXISTS bunwa_conversations_user_idx ON bunwa_conversations (user_id)`,
  `CREATE INDEX IF NOT EXISTS bunwa_conversations_started_idx ON bunwa_conversations (started_at)`,
  `CREATE TABLE IF NOT EXISTS bunwa_conversation_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES bunwa_conversations(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES bunwa_agents(id) ON DELETE CASCADE,
    user_id TEXT,
    role TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    text TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_conversation_messages_conversation_idx ON bunwa_conversation_messages (conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS bunwa_conversation_messages_agent_idx ON bunwa_conversation_messages (agent_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS bunwa_analytics_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    agent_id TEXT,
    conversation_id TEXT,
    user_id TEXT,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_analytics_events_type_idx ON bunwa_analytics_events (type)`,
  `CREATE INDEX IF NOT EXISTS bunwa_analytics_events_agent_idx ON bunwa_analytics_events (agent_id)`,
  `CREATE INDEX IF NOT EXISTS bunwa_analytics_events_conversation_idx ON bunwa_analytics_events (conversation_id)`,
  `CREATE INDEX IF NOT EXISTS bunwa_analytics_events_created_idx ON bunwa_analytics_events (created_at)`,
];

/**
 * Knowledge chunks are dialect-specific: SQLite stores the vector as a BLOB
 * and mirrors it into a sqlite-vec virtual table; Postgres uses pgvector's
 * native `vector(N)` column. Keep the scalar columns identical. N comes from
 * BGE_DIMENSIONS so the schemas can never drift from the embedding model.
 */
const KNOWLEDGE_CHUNK_SCHEMA_SQLITE = [
  `CREATE TABLE IF NOT EXISTS bunwa_knowledge_chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    char_count INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding BLOB,
    embedding_model TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_knowledge_chunks_source_idx ON bunwa_knowledge_chunks (source_id, chunk_index)`,
  `CREATE INDEX IF NOT EXISTS bunwa_knowledge_chunks_agent_idx ON bunwa_knowledge_chunks (agent_id)`,
];

const KNOWLEDGE_CHUNK_SCHEMA_POSTGRES = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS bunwa_knowledge_chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    char_count INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector(${BGE_DIMENSIONS}),
    embedding_model TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bunwa_knowledge_chunks_source_idx ON bunwa_knowledge_chunks (source_id, chunk_index)`,
  `CREATE INDEX IF NOT EXISTS bunwa_knowledge_chunks_agent_idx ON bunwa_knowledge_chunks (agent_id)`,
];

export class SqlAgentStore implements AgentStore {
  private vectorReady = false;
  private vectorError: string | null = null;

  constructor(private readonly client: SqlClient) {}

  async init(): Promise<void> {
    for (const sql of SCHEMA) {
      await this.client.execute(sql);
    }
    if (this.client.dialect === 'sqlite') {
      for (const sql of KNOWLEDGE_CHUNK_SCHEMA_SQLITE) {
        await this.client.execute(sql);
      }
      try {
        const { getLoadablePath } = await import('sqlite-vec');
        this.client.loadExtension?.(getLoadablePath());
        await this.client.execute(
          `CREATE VIRTUAL TABLE IF NOT EXISTS bunwa_knowledge_vec USING vec0(embedding float[${BGE_DIMENSIONS}] distance_metric=cosine)`,
        );
        this.vectorReady = true;
      } catch (error) {
        this.vectorError = String(error);
        throw new Error(
          `sqlite-vec is required for the SQLite knowledge base but failed to load: ${String(error)}`,
        );
      }
    } else {
      try {
        for (const sql of KNOWLEDGE_CHUNK_SCHEMA_POSTGRES) {
          await this.client.execute(sql);
        }
        this.vectorReady = true;
      } catch (error) {
        // PGlite (the conformance test server) and a Postgres install without
        // pgvector cannot create a vector column. Keep the scalar chunk table
        // usable for metadata/delete, and fail knowledge indexing/search with
        // a clear message instead of taking the whole server down.
        this.vectorError = String(error);
        await this.client.execute(`CREATE TABLE IF NOT EXISTS bunwa_knowledge_chunks (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          char_count INTEGER NOT NULL DEFAULT 0,
          token_count INTEGER NOT NULL DEFAULT 0,
          embedding TEXT,
          embedding_model TEXT,
          created_at TEXT NOT NULL
        )`);
        await this.client.execute(
          `CREATE INDEX IF NOT EXISTS bunwa_knowledge_chunks_source_idx ON bunwa_knowledge_chunks (source_id, chunk_index)`,
        );
        await this.client.execute(
          `CREATE INDEX IF NOT EXISTS bunwa_knowledge_chunks_agent_idx ON bunwa_knowledge_chunks (agent_id)`,
        );
      }
    }
    // Older databases were created before agents had a fallback model.
    if (!(await this.columnExists('bunwa_agents', 'fallback_model'))) {
      await this.client.execute('ALTER TABLE bunwa_agents ADD COLUMN fallback_model TEXT');
    }
    // Refresh metadata is additive; keep existing servers readable.
    if (!(await this.columnExists('bunwa_external_mcp_servers', 'last_refreshed_at'))) {
      await this.client.execute('ALTER TABLE bunwa_external_mcp_servers ADD COLUMN last_refreshed_at TEXT');
    }
    if (!(await this.columnExists('bunwa_external_mcp_servers', 'last_error'))) {
      await this.client.execute('ALTER TABLE bunwa_external_mcp_servers ADD COLUMN last_error TEXT');
    }
    if (!(await this.columnExists('bunwa_knowledge_sources', 'embedding_model'))) {
      await this.client.execute('ALTER TABLE bunwa_knowledge_sources ADD COLUMN embedding_model TEXT');
    }
    if (!(await this.columnExists('bunwa_knowledge_sources', 'chunk_count'))) {
      await this.client.execute('ALTER TABLE bunwa_knowledge_sources ADD COLUMN chunk_count INTEGER NOT NULL DEFAULT 0');
    }
    if (!(await this.columnExists('bunwa_knowledge_sources', 'error'))) {
      await this.client.execute('ALTER TABLE bunwa_knowledge_sources ADD COLUMN error TEXT');
    }
    if (encryptionConfigured()) {
      await this.sealLegacyExternalMcpHeaders();
    }
  }

  /** Encrypt header values written before recoverable-secret storage existed. */
  private async sealLegacyExternalMcpHeaders(): Promise<void> {
    const rows = await this.client.query(`SELECT id, headers FROM bunwa_external_mcp_servers`);
    for (const row of rows) {
      const headers = json<Record<string, string>>(row.headers, {});
      let changed = false;
      const sealed = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => {
          if (!value || isSealedSecret(value)) return [key, value];
          changed = true;
          return [key, sealSecret(value)];
        }),
      );
      if (changed) {
        await this.client.execute(`UPDATE bunwa_external_mcp_servers SET headers = ? WHERE id = ?`, [
          JSON.stringify(sealed),
          row.id,
        ]);
      }
    }
  }

  private async columnExists(table: string, column: string): Promise<boolean> {
    if (this.client.dialect === 'sqlite') {
      const rows = await this.client.query(`PRAGMA table_info(${table})`);
      return rows.some((row: any) => row.name === column);
    }
    const rows = await this.client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = ?`,
      [table],
    );
    return rows.some((row: any) => row.column_name === column);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  /* ---------------------------------------------------------------------- */
  /* Agents                                                                  */
  /* ---------------------------------------------------------------------- */

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const id = Bun.randomUUIDv7();
    const at = now();
    const agent: Agent = {
      id,
      name: input.name.trim(),
      status: 'draft',
      prompt: input.prompt ?? '',
      model: input.model ?? null,
      fallbackModel: input.fallbackModel ?? null,
      voice: input.voice ?? null,
      settings: input.settings ?? {},
      createdAt: at,
      updatedAt: at,
    };
    await this.client.execute(
      `INSERT INTO bunwa_agents (id, name, status, prompt, model, fallback_model, voice, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [agent.id, agent.name, agent.status, agent.prompt, agent.model, agent.fallbackModel, agent.voice, JSON.stringify(agent.settings), at, at],
    );
    return agent;
  }

  async listAgents(): Promise<Agent[]> {
    const rows = await this.client.query(`SELECT * FROM bunwa_agents ORDER BY updated_at DESC`);
    return rows.map(rowToAgent);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const rows = await this.client.query(`SELECT * FROM bunwa_agents WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ? rowToAgent(rows[0]) : null;
  }

  async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent | null> {
    const current = await this.getAgent(id);
    if (!current) return null;
    const next: Agent = {
      ...current,
      name: input.name?.trim() ?? current.name,
      status: input.status ?? current.status,
      prompt: input.prompt ?? current.prompt,
      model: input.model !== undefined ? input.model : current.model,
      fallbackModel: input.fallbackModel !== undefined ? input.fallbackModel : current.fallbackModel,
      voice: input.voice !== undefined ? input.voice : current.voice,
      settings: input.settings ?? current.settings,
      updatedAt: now(),
    };
    await this.client.execute(
      `UPDATE bunwa_agents SET name = ?, status = ?, prompt = ?, model = ?, fallback_model = ?, voice = ?, settings = ?, updated_at = ? WHERE id = ?`,
      [next.name, next.status, next.prompt, next.model, next.fallbackModel, next.voice, JSON.stringify(next.settings), next.updatedAt, id],
    );
    return next;
  }

  async deleteAgent(id: string): Promise<boolean> {
    const existing = await this.getAgent(id);
    if (!existing) return false;
    await this.client.execute(`DELETE FROM bunwa_agent_skills WHERE agent_id = ?`, [id]);
    if (this.client.dialect === 'sqlite' && this.vectorReady) {
      const chunkRows = await this.client.query(`SELECT rowid FROM bunwa_knowledge_chunks WHERE agent_id = ?`, [id]);
      if (chunkRows.length) {
        const placeholders = chunkRows.map(() => '?').join(',');
        await this.client.execute(
          `DELETE FROM bunwa_knowledge_vec WHERE rowid IN (${placeholders})`,
          chunkRows.map((row: any) => row.rowid),
        );
      }
    }
    await this.client.execute(`DELETE FROM bunwa_knowledge_chunks WHERE agent_id = ?`, [id]);
    await this.client.execute(`DELETE FROM bunwa_knowledge_sources WHERE agent_id = ?`, [id]);
    await this.client.execute(`DELETE FROM bunwa_conversation_messages WHERE agent_id = ?`, [id]);
    await this.client.execute(`DELETE FROM bunwa_conversations WHERE agent_id = ?`, [id]);
    await this.client.execute(`DELETE FROM bunwa_analytics_events WHERE agent_id = ?`, [id]);
    await this.client.execute(`DELETE FROM bunwa_agents WHERE id = ?`, [id]);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Model settings                                                          */
  /* ---------------------------------------------------------------------- */

  async getModelSettings(): Promise<ModelSettings> {
    const rows = await this.client.query(`SELECT * FROM bunwa_model_settings WHERE id = ? LIMIT 1`, ['default']);
    if (rows[0]) return rowToModelSettings(rows[0]);

    const at = now();
    const settings: ModelSettings = {
      id: 'default',
      provider: 'openai-compatible',
      baseUrl: '',
      hasApiKey: false,
      model: '',
      fallbackProvider: 'openai-compatible',
      fallbackBaseUrl: '',
      hasFallbackApiKey: false,
      fallbackModel: '',
      updatedAt: at,
    };
    await this.client.execute(
      `INSERT INTO bunwa_model_settings (id, provider, base_url, api_key, model, fallback_provider, fallback_base_url, fallback_api_key, fallback_model, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['default', settings.provider, settings.baseUrl, null, settings.model, settings.fallbackProvider, settings.fallbackBaseUrl, null, settings.fallbackModel, at],
    );
    return settings;
  }

  async getModelSettingsSecrets(): Promise<ModelSettingsSecrets> {
    const settings = await this.getModelSettings();
    const rows = await this.client.query(`SELECT * FROM bunwa_model_settings WHERE id = ? LIMIT 1`, [settings.id]);
    const raw = rows[0] ?? {};
    return {
      ...settings,
      apiKey: asNullableString(raw.api_key),
      fallbackApiKey: asNullableString(raw.fallback_api_key),
    };
  }

  async updateModelSettings(input: UpdateModelSettingsInput): Promise<ModelSettings> {
    const current = await this.getModelSettings();
    const rows = await this.client.query(`SELECT * FROM bunwa_model_settings WHERE id = ? LIMIT 1`, [current.id]);
    const raw = rows[0] ?? {};
    const existingApiKey = asNullableString(raw.api_key);
    const existingFallbackApiKey = asNullableString(raw.fallback_api_key);

    // Keys are write-only from the API's point of view: undefined keeps the
    // stored value, null clears it, and a string replaces it.
    const apiKey = input.apiKey === undefined ? existingApiKey : asNullableString(input.apiKey);
    const fallbackApiKey = input.fallbackApiKey === undefined ? existingFallbackApiKey : asNullableString(input.fallbackApiKey);

    const settings: ModelSettings = {
      id: current.id,
      provider: input.provider ?? current.provider,
      baseUrl: input.baseUrl ?? current.baseUrl,
      hasApiKey: apiKey !== null,
      model: input.model ?? current.model,
      fallbackProvider: input.fallbackProvider ?? current.fallbackProvider,
      fallbackBaseUrl: input.fallbackBaseUrl ?? current.fallbackBaseUrl,
      hasFallbackApiKey: fallbackApiKey !== null,
      fallbackModel: input.fallbackModel ?? current.fallbackModel,
      updatedAt: now(),
    };

    await this.client.execute(
      `UPDATE bunwa_model_settings SET provider = ?, base_url = ?, api_key = ?, model = ?, fallback_provider = ?, fallback_base_url = ?, fallback_api_key = ?, fallback_model = ?, updated_at = ? WHERE id = ?`,
      [
        settings.provider,
        settings.baseUrl,
        apiKey,
        settings.model,
        settings.fallbackProvider,
        settings.fallbackBaseUrl,
        fallbackApiKey,
        settings.fallbackModel,
        settings.updatedAt,
        settings.id,
      ],
    );
    return settings;
  }

  async listModelRoleSettings(): Promise<ModelRoleSettings[]> {
    const rows = await this.client.query(`SELECT * FROM bunwa_model_role_settings ORDER BY role ASC`);
    return rows.map(rowToModelRoleSettings);
  }

  async getModelRoleSettings(role: ModelRole): Promise<ModelRoleSettings> {
    const rows = await this.client.query(`SELECT * FROM bunwa_model_role_settings WHERE role = ? LIMIT 1`, [role]);
    if (rows[0]) return rowToModelRoleSettings(rows[0]);

    const at = now();
    const settings: ModelRoleSettings = {
      role,
      provider: 'openai-compatible',
      baseUrl: '',
      hasApiKey: false,
      model: '',
      fallbackProvider: 'openai-compatible',
      fallbackBaseUrl: '',
      hasFallbackApiKey: false,
      fallbackModel: '',
      updatedAt: at,
    };
    await this.client.execute(
      `INSERT INTO bunwa_model_role_settings (role, provider, base_url, api_key, model, fallback_provider, fallback_base_url, fallback_api_key, fallback_model, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [role, settings.provider, settings.baseUrl, null, settings.model, settings.fallbackProvider, settings.fallbackBaseUrl, null, settings.fallbackModel, at],
    );
    return settings;
  }

  async getModelRoleSettingsSecrets(role: ModelRole): Promise<ModelRoleSettingsSecrets> {
    const settings = await this.getModelRoleSettings(role);
    const rows = await this.client.query(`SELECT * FROM bunwa_model_role_settings WHERE role = ? LIMIT 1`, [role]);
    const raw = rows[0] ?? {};
    return {
      ...settings,
      apiKey: asNullableString(raw.api_key),
      fallbackApiKey: asNullableString(raw.fallback_api_key),
    };
  }

  async updateModelRoleSettings(role: ModelRole, input: UpdateModelRoleSettingsInput): Promise<ModelRoleSettings> {
    const current = await this.getModelRoleSettings(role);
    const rows = await this.client.query(`SELECT * FROM bunwa_model_role_settings WHERE role = ? LIMIT 1`, [role]);
    const raw = rows[0] ?? {};
    const existingApiKey = asNullableString(raw.api_key);
    const existingFallbackApiKey = asNullableString(raw.fallback_api_key);

    const apiKey = input.apiKey === undefined ? existingApiKey : asNullableString(input.apiKey);
    const fallbackApiKey = input.fallbackApiKey === undefined ? existingFallbackApiKey : asNullableString(input.fallbackApiKey);

    const settings: ModelRoleSettings = {
      role,
      provider: input.provider ?? current.provider,
      baseUrl: input.baseUrl ?? current.baseUrl,
      hasApiKey: apiKey !== null,
      model: input.model ?? current.model,
      fallbackProvider: input.fallbackProvider ?? current.fallbackProvider,
      fallbackBaseUrl: input.fallbackBaseUrl ?? current.fallbackBaseUrl,
      hasFallbackApiKey: fallbackApiKey !== null,
      fallbackModel: input.fallbackModel ?? current.fallbackModel,
      updatedAt: now(),
    };

    await this.client.execute(
      `UPDATE bunwa_model_role_settings SET provider = ?, base_url = ?, api_key = ?, model = ?, fallback_provider = ?, fallback_base_url = ?, fallback_api_key = ?, fallback_model = ?, updated_at = ? WHERE role = ?`,
      [
        settings.provider,
        settings.baseUrl,
        apiKey,
        settings.model,
        settings.fallbackProvider,
        settings.fallbackBaseUrl,
        fallbackApiKey,
        settings.fallbackModel,
        settings.updatedAt,
        role,
      ],
    );
    return settings;
  }

  /* ---------------------------------------------------------------------- */
  /* External MCP servers                                                  */
  /* ---------------------------------------------------------------------- */

  async createExternalMcpServer(input: CreateExternalMcpServerInput): Promise<ExternalMcpServer> {
    const at = now();
    const server: ExternalMcpServer = {
      id: Bun.randomUUIDv7(),
      name: input.name.trim(),
      description: input.description ?? '',
      url: input.url.trim(),
      headers: input.headers ?? {},
      enabled: input.enabled ?? true,
      lastRefreshedAt: null,
      lastError: null,
      createdAt: at,
      updatedAt: at,
    };
    const sealedHeaders = Object.fromEntries(
      Object.entries(server.headers).map(([key, value]) => [key, sealSecret(value)]),
    );
    await this.client.execute(
      `INSERT INTO bunwa_external_mcp_servers (id, name, description, url, headers, enabled, last_refreshed_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        server.id,
        server.name,
        server.description,
        server.url,
        JSON.stringify(sealedHeaders),
        server.enabled ? 1 : 0,
        null,
        null,
        server.createdAt,
        server.updatedAt,
      ],
    );
    return server;
  }

  async listExternalMcpServers(): Promise<ExternalMcpServer[]> {
    const rows = await this.client.query(`SELECT * FROM bunwa_external_mcp_servers ORDER BY created_at ASC`);
    return rows.map(rowToExternalMcpServer);
  }

  async getExternalMcpServer(id: string): Promise<ExternalMcpServer | null> {
    const rows = await this.client.query(`SELECT * FROM bunwa_external_mcp_servers WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ? rowToExternalMcpServer(rows[0]) : null;
  }

  async updateExternalMcpServer(id: string, input: UpdateExternalMcpServerInput): Promise<ExternalMcpServer | null> {
    const current = await this.getExternalMcpServer(id);
    if (!current) return null;

    const server: ExternalMcpServer = {
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      description: input.description !== undefined ? (input.description ?? '') : current.description,
      url: input.url !== undefined ? input.url.trim() : current.url,
      headers: input.headers !== undefined ? (input.headers ?? {}) : current.headers,
      enabled: input.enabled !== undefined ? input.enabled : current.enabled,
      updatedAt: now(),
    };

    const sealedHeaders = Object.fromEntries(
      Object.entries(server.headers).map(([key, value]) => [key, sealSecret(value)]),
    );
    await this.client.execute(
      `UPDATE bunwa_external_mcp_servers SET name = ?, description = ?, url = ?, headers = ?, enabled = ?, updated_at = ? WHERE id = ?`,
      [
        server.name,
        server.description,
        server.url,
        JSON.stringify(sealedHeaders),
        server.enabled ? 1 : 0,
        server.updatedAt,
        server.id,
      ],
    );
    return server;
  }

  async markExternalMcpServerRefresh(
    id: string,
    input: { refreshedAt?: string; error?: string | null },
  ): Promise<ExternalMcpServer | null> {
    const current = await this.getExternalMcpServer(id);
    if (!current) return null;

    const lastRefreshedAt = input.refreshedAt !== undefined ? input.refreshedAt : current.lastRefreshedAt;
    const lastError = input.error !== undefined ? input.error : current.lastError;
    await this.client.execute(
      `UPDATE bunwa_external_mcp_servers SET last_refreshed_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      [lastRefreshedAt, lastError, now(), id],
    );
    return this.getExternalMcpServer(id);
  }

  async deleteExternalMcpServer(id: string): Promise<boolean> {
    const rows = await this.client.query(`SELECT id FROM bunwa_external_mcp_servers WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) return false;
    await this.client.execute(`DELETE FROM bunwa_external_mcp_tools WHERE server_id = ?`, [id]);
    await this.client.execute(`DELETE FROM bunwa_external_mcp_servers WHERE id = ?`, [id]);
    return true;
  }

  async listExternalMcpTools(): Promise<ExternalMcpTool[]> {
    const rows = await this.client.query(
      `SELECT t.*, s.name AS server_name
       FROM bunwa_external_mcp_tools t
       JOIN bunwa_external_mcp_servers s ON s.id = t.server_id
       WHERE s.enabled = 1 AND t.enabled = 1
       ORDER BY s.name ASC, t.name ASC`,
    );
    return rows.map(rowToExternalMcpTool);
  }

  async listExternalMcpToolsForServer(serverId: string): Promise<ExternalMcpTool[]> {
    const rows = await this.client.query(
      `SELECT t.*, s.name AS server_name
       FROM bunwa_external_mcp_tools t
       JOIN bunwa_external_mcp_servers s ON s.id = t.server_id
       WHERE t.server_id = ?
       ORDER BY t.name ASC`,
      [serverId],
    );
    return rows.map(rowToExternalMcpTool);
  }

  async upsertExternalMcpTools(serverId: string, tools: UpsertExternalMcpToolInput[]): Promise<ExternalMcpTool[]> {
    const existingRows = await this.client.query(`SELECT * FROM bunwa_external_mcp_tools WHERE server_id = ?`, [serverId]);
    const existing = new Map<string, any>(existingRows.map((row) => [row.name, row]));
    const incoming = new Set(tools.map((tool) => tool.name));
    const at = now();

    // Diff instead of delete-all: a failure halfway through an insert must not
    // leave the server with no cached tools.
    for (const tool of tools) {
      const current = existing.get(tool.name);
      if (current) {
        await this.client.execute(
          `UPDATE bunwa_external_mcp_tools
           SET description = ?, input_schema = ?, annotations = ?, tier = ?, destructive = ?, updated_at = ?
           WHERE server_id = ? AND name = ?`,
          [
            tool.description,
            JSON.stringify(tool.inputSchema ?? {}),
            tool.annotations ? JSON.stringify(tool.annotations) : null,
            tool.tier,
            tool.destructive ? 1 : 0,
            at,
            serverId,
            tool.name,
          ],
        );
      } else {
        await this.client.execute(
          `INSERT INTO bunwa_external_mcp_tools (id, server_id, name, description, input_schema, annotations, tier, destructive, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            Bun.randomUUIDv7(),
            serverId,
            tool.name,
            tool.description,
            JSON.stringify(tool.inputSchema ?? {}),
            tool.annotations ? JSON.stringify(tool.annotations) : null,
            tool.tier,
            tool.destructive ? 1 : 0,
            at,
            at,
          ],
        );
      }
    }

    for (const name of existing.keys()) {
      if (!incoming.has(name)) {
        await this.client.execute(`DELETE FROM bunwa_external_mcp_tools WHERE server_id = ? AND name = ?`, [serverId, name]);
      }
    }

    return (await this.client.query(
      `SELECT t.*, s.name AS server_name
       FROM bunwa_external_mcp_tools t
       JOIN bunwa_external_mcp_servers s ON s.id = t.server_id
       WHERE t.server_id = ?
       ORDER BY t.name ASC`,
      [serverId],
    )).map(rowToExternalMcpTool);
  }

  async deleteExternalMcpTools(serverId: string): Promise<boolean> {
    await this.client.execute(`DELETE FROM bunwa_external_mcp_tools WHERE server_id = ?`, [serverId]);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Skills                                                                  */
  /* ---------------------------------------------------------------------- */

  async addSkill(agentId: string, input: CreateSkillInput): Promise<AgentSkill> {
    const skill: AgentSkill = {
      id: Bun.randomUUIDv7(),
      agentId,
      name: input.name.trim(),
      description: input.description ?? '',
      instructions: input.instructions.trim(),
      enabled: input.enabled ?? true,
      createdAt: now(),
    };
    await this.client.execute(
      `INSERT INTO bunwa_agent_skills (id, agent_id, name, description, instructions, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [skill.id, skill.agentId, skill.name, skill.description, skill.instructions, skill.enabled ? 1 : 0, skill.createdAt],
    );
    return skill;
  }

  async listSkills(agentId: string): Promise<AgentSkill[]> {
    const rows = await this.client.query(`SELECT * FROM bunwa_agent_skills WHERE agent_id = ? ORDER BY created_at ASC`, [agentId]);
    return rows.map(rowToSkill);
  }

  async deleteSkill(agentId: string, skillId: string): Promise<boolean> {
    const rows = await this.client.query(`SELECT id FROM bunwa_agent_skills WHERE id = ? AND agent_id = ? LIMIT 1`, [skillId, agentId]);
    if (!rows[0]) return false;
    await this.client.execute(`DELETE FROM bunwa_agent_skills WHERE id = ? AND agent_id = ?`, [skillId, agentId]);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Knowledge                                                               */
  /* ---------------------------------------------------------------------- */

  async addKnowledge(agentId: string, input: CreateKnowledgeInput): Promise<KnowledgeSource> {
    const at = now();
    const source: KnowledgeSource = {
      id: Bun.randomUUIDv7(),
      agentId,
      name: input.name.trim(),
      kind: input.kind,
      content: input.content,
      status: 'pending',
      metadata: input.metadata ?? {},
      embeddingModel: null,
      chunkCount: 0,
      error: null,
      createdAt: at,
      updatedAt: at,
    };
    await this.client.execute(
      `INSERT INTO bunwa_knowledge_sources
         (id, agent_id, name, kind, content, status, metadata, embedding_model, chunk_count, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        source.id,
        source.agentId,
        source.name,
        source.kind,
        source.content,
        source.status,
        JSON.stringify(source.metadata),
        source.embeddingModel,
        source.chunkCount,
        source.error,
        at,
        at,
      ],
    );
    return source;
  }

  async updateKnowledgeStatus(
    sourceId: string,
    input: { status: KnowledgeSource['status']; error?: string | null; embeddingModel?: string | null; chunkCount?: number },
  ): Promise<KnowledgeSource | null> {
    const current = await this.client.query(`SELECT * FROM bunwa_knowledge_sources WHERE id = ? LIMIT 1`, [sourceId]);
    if (!current[0]) return null;
    const at = now();
    await this.client.execute(
      `UPDATE bunwa_knowledge_sources
       SET status = ?, error = ?, embedding_model = ?, chunk_count = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.status,
        input.error === undefined ? current[0].error ?? null : input.error,
        input.embeddingModel === undefined ? current[0].embedding_model ?? null : input.embeddingModel,
        input.chunkCount === undefined ? Number(current[0].chunk_count ?? 0) : input.chunkCount,
        at,
        sourceId,
      ],
    );
    const rows = await this.client.query(`SELECT * FROM bunwa_knowledge_sources WHERE id = ? LIMIT 1`, [sourceId]);
    return rows[0] ? rowToKnowledge(rows[0]) : null;
  }

  async addKnowledgeChunks(chunks: AddKnowledgeChunkInput[]): Promise<KnowledgeChunk[]> {
    this.assertVectorReady();
    if (!chunks.length) return [];
    // The schemas are created with BGE_DIMENSIONS columns; an embedding whose
    // geometry disagrees means the embedding model changed without updating
    // BGE_DIMENSIONS (and recreating the vector tables). Fail with the cause,
    // not a cryptic vec0/pgvector insert error.
    const bad = chunks.find((chunk) => !Array.isArray(chunk.embedding) || chunk.embedding.length !== BGE_DIMENSIONS);
    if (bad) {
      const got = Array.isArray(bad.embedding) ? bad.embedding.length : 'none';
      throw new Error(
        `Knowledge chunk embedding has ${got} dimensions but the vector store expects ${BGE_DIMENSIONS}. ` +
          'The embedding model and the database schema disagree — update BGE_DIMENSIONS and rebuild the vector tables together.',
      );
    }
    const at = now();
    const saved: KnowledgeChunk[] = [];
    for (const chunk of chunks) {
      const id = Bun.randomUUIDv7();
      const vectorExpr = this.client.dialect === 'postgres' ? '?::vector' : '?';
      const embeddingParam =
        this.client.dialect === 'postgres'
          ? `[${chunk.embedding.join(',')}]`
          : Buffer.from(new Float32Array(chunk.embedding).buffer);
      await this.client.execute(
        `INSERT INTO bunwa_knowledge_chunks
           (id, source_id, agent_id, chunk_index, text, char_count, token_count, embedding, embedding_model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ${vectorExpr}, ?, ?)`,
        [
          id,
          chunk.sourceId,
          chunk.agentId,
          chunk.index,
          chunk.text,
          chunk.charCount,
          chunk.tokenCount,
          embeddingParam,
          chunk.embeddingModel,
          at,
        ],
      );
      if (this.client.dialect === 'sqlite') {
        const rows = await this.client.query(`SELECT rowid FROM bunwa_knowledge_chunks WHERE id = ? LIMIT 1`, [id]);
        if (!rows[0]) throw new Error(`Could not read back knowledge chunk ${id}`);
        await this.client.execute(`INSERT INTO bunwa_knowledge_vec(rowid, embedding) VALUES (?, ?)`, [
          rows[0].rowid,
          new Float32Array(chunk.embedding),
        ]);
      }
      saved.push({
        id,
        sourceId: chunk.sourceId,
        agentId: chunk.agentId,
        index: chunk.index,
        text: chunk.text,
        charCount: chunk.charCount,
        tokenCount: chunk.tokenCount,
        embeddingModel: chunk.embeddingModel,
        createdAt: at,
      });
    }
    return saved;
  }

  async listKnowledgeChunks(agentId: string, sourceId: string): Promise<KnowledgeChunk[]> {
    const rows = await this.client.query(
      `SELECT * FROM bunwa_knowledge_chunks
       WHERE agent_id = ? AND source_id = ?
       ORDER BY chunk_index ASC`,
      [agentId, sourceId],
    );
    return rows.map(rowToKnowledgeChunk);
  }

  async searchKnowledge(
    agentId: string,
    embedding: number[],
    model: string,
    limit: number,
  ): Promise<KnowledgeSearchHit[]> {
    this.assertVectorReady();
    if (!Array.isArray(embedding) || embedding.length !== BGE_DIMENSIONS) {
      throw new Error(
        `Search embedding has ${Array.isArray(embedding) ? embedding.length : 'no'} dimensions but the vector store expects ${BGE_DIMENSIONS}. ` +
          'The embedding model and the database schema disagree — update BGE_DIMENSIONS and rebuild the vector tables together.',
      );
    }
    if (!embedding.length || limit <= 0) return [];
    if (this.client.dialect === 'postgres') {
      const literal = `[${embedding.join(',')}]`;
      const rows = await this.client.query(
        `SELECT c.id, c.source_id, c.chunk_index, c.text, s.name AS source_name,
                1 - (c.embedding <=> ?::vector) AS score
         FROM bunwa_knowledge_chunks c
         JOIN bunwa_knowledge_sources s ON s.id = c.source_id
         WHERE c.agent_id = ? AND c.embedding_model = ? AND c.embedding IS NOT NULL
         ORDER BY c.embedding <=> ?::vector
         LIMIT ?`,
        [literal, agentId, model, literal, limit],
      );
      return rows.map((row: any) => ({
        sourceId: row.source_id,
        sourceName: row.source_name,
        chunkId: row.id,
        index: Number(row.chunk_index),
        text: row.text,
        score: Number(row.score),
      }));
    }

    // sqlite-vec returns the nearest rowids; join the chunk metadata after.
    const nearest = await this.client.query(
      `SELECT rowid, distance FROM bunwa_knowledge_vec
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`,
      [new Float32Array(embedding), Math.max(limit * 4, limit)],
    );
    if (!nearest.length) return [];
    const rowids = nearest.map((row: any) => row.rowid);
    const placeholders = rowids.map(() => '?').join(',');
    const rows = await this.client.query(
      `SELECT c.id, c.source_id, c.chunk_index, c.text, s.name AS source_name, c.rowid
       FROM bunwa_knowledge_chunks c
       JOIN bunwa_knowledge_sources s ON s.id = c.source_id
       WHERE c.rowid IN (${placeholders})
         AND c.agent_id = ?
         AND c.embedding_model = ?`,
      [...rowids, agentId, model],
    );
    const distanceByRowid = new Map<number, number>(nearest.map((row: any) => [Number(row.rowid), Number(row.distance)]));
    return rows
      .map((row: any) => ({
        sourceId: row.source_id,
        sourceName: row.source_name,
        chunkId: row.id,
        index: Number(row.chunk_index),
        text: row.text,
        score: 1 - (distanceByRowid.get(Number(row.rowid)) ?? 1),
      }))
      .sort((a: KnowledgeSearchHit, b: KnowledgeSearchHit) => b.score - a.score)
      .slice(0, limit);
  }

  private assertVectorReady(): void {
    if (!this.vectorReady) {
      throw new Error(
        `Knowledge search is unavailable: ${this.vectorError ?? 'the vector store was not initialized'}`,
      );
    }
  }

  async listKnowledge(agentId: string): Promise<KnowledgeSource[]> {
    const rows = await this.client.query(`SELECT * FROM bunwa_knowledge_sources WHERE agent_id = ? ORDER BY created_at ASC`, [agentId]);
    return rows.map(rowToKnowledge);
  }

  async deleteKnowledge(agentId: string, sourceId: string): Promise<boolean> {
    const rows = await this.client.query(`SELECT id FROM bunwa_knowledge_sources WHERE id = ? AND agent_id = ? LIMIT 1`, [sourceId, agentId]);
    if (!rows[0]) return false;
    if (this.client.dialect === 'sqlite' && this.vectorReady) {
      const chunkRows = await this.client.query(
        `SELECT rowid FROM bunwa_knowledge_chunks WHERE source_id = ? AND agent_id = ?`,
        [sourceId, agentId],
      );
      if (chunkRows.length) {
        const placeholders = chunkRows.map(() => '?').join(',');
        await this.client.execute(
          `DELETE FROM bunwa_knowledge_vec WHERE rowid IN (${placeholders})`,
          chunkRows.map((row: any) => row.rowid),
        );
      }
    }
    await this.client.execute(`DELETE FROM bunwa_knowledge_chunks WHERE source_id = ? AND agent_id = ?`, [sourceId, agentId]);
    await this.client.execute(`DELETE FROM bunwa_knowledge_sources WHERE id = ? AND agent_id = ?`, [sourceId, agentId]);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* User profiles                                                           */
  /* ---------------------------------------------------------------------- */

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const rows = await this.client.query(`SELECT * FROM bunwa_user_profiles WHERE user_id = ? LIMIT 1`, [userId]);
    return rows[0] ? rowToUserProfile(rows[0]) : null;
  }

  async upsertUserProfile(input: UpsertUserProfileInput): Promise<UserProfile> {
    const existing = await this.getUserProfile(input.userId);
    const at = now();
    const profile: UserProfile = {
      id: existing?.id ?? Bun.randomUUIDv7(),
      userId: input.userId,
      displayName: input.displayName ?? existing?.displayName ?? null,
      phone: input.phone ?? existing?.phone ?? null,
      email: input.email ?? existing?.email ?? null,
      timezone: input.timezone ?? existing?.timezone ?? null,
      locale: input.locale ?? existing?.locale ?? null,
      notes: input.notes ?? existing?.notes ?? null,
      tags: input.tags ?? existing?.tags ?? [],
      customFields: input.customFields ?? existing?.customFields ?? {},
      preferences: input.preferences ?? existing?.preferences ?? {},
      importantDetails: input.importantDetails ?? existing?.importantDetails ?? {},
      lastSeenAt: input.lastSeenAt ?? existing?.lastSeenAt ?? null,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    if (existing) {
      await this.client.execute(
        `UPDATE bunwa_user_profiles SET display_name = ?, phone = ?, email = ?, timezone = ?, locale = ?, notes = ?, tags = ?, custom_fields = ?, preferences = ?, important_details = ?, last_seen_at = ?, updated_at = ? WHERE user_id = ?`,
        [
          profile.displayName,
          profile.phone,
          profile.email,
          profile.timezone,
          profile.locale,
          profile.notes,
          JSON.stringify(profile.tags),
          JSON.stringify(profile.customFields),
          JSON.stringify(profile.preferences),
          JSON.stringify(profile.importantDetails),
          profile.lastSeenAt,
          profile.updatedAt,
          profile.userId,
        ],
      );
    } else {
      await this.client.execute(
        `INSERT INTO bunwa_user_profiles (id, user_id, display_name, phone, email, timezone, locale, notes, tags, custom_fields, preferences, important_details, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          profile.id,
          profile.userId,
          profile.displayName,
          profile.phone,
          profile.email,
          profile.timezone,
          profile.locale,
          profile.notes,
          JSON.stringify(profile.tags),
          JSON.stringify(profile.customFields),
          JSON.stringify(profile.preferences),
          JSON.stringify(profile.importantDetails),
          profile.lastSeenAt,
          profile.createdAt,
          profile.updatedAt,
        ],
      );
    }
    return profile;
  }

  async listUserProfiles(limit = 100): Promise<UserProfile[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const rows = await this.client.query(
      `SELECT * FROM bunwa_user_profiles ORDER BY COALESCE(last_seen_at, updated_at) DESC LIMIT ${safeLimit}`,
    );
    return rows.map(rowToUserProfile);
  }

  async listUserProfileFacts(userId: string, includeInactive = false): Promise<UserProfileFact[]> {
    const rows = await this.client.query(
      includeInactive
        ? `SELECT * FROM bunwa_user_profile_facts WHERE user_id = ? ORDER BY kind ASC, key ASC`
        : `SELECT * FROM bunwa_user_profile_facts WHERE user_id = ? AND status = 'active' ORDER BY kind ASC, key ASC`,
      [userId],
    );
    return rows.map(rowToUserProfileFact);
  }

  async createUserProfileFact(input: CreateUserProfileFactInput): Promise<UserProfileFact> {
    const at = now();
    const active = (await this.listUserProfileFacts(input.userId)).find((fact) => fact.key === input.key);
    const value = input.value ?? null;

    // Same key + same value: confirm the existing fact instead of creating a
    // duplicate. Same key + different value: keep history by superseding.
    if (active && JSON.stringify(active.value) === JSON.stringify(value)) {
      const updated = await this.updateUserProfileFact(active.id, {
        confidence: Math.max(active.confidence, input.confidence ?? 0.7),
        source: input.source ?? active.source,
        sourceRef: input.sourceRef ?? active.sourceRef,
        evidence: input.evidence ?? active.evidence,
        expiresAt: input.expiresAt ?? active.expiresAt,
        sensitivity: input.sensitivity ?? active.sensitivity,
      });
      if (updated) return updated;
    }
    if (active) {
      await this.client.execute(`UPDATE bunwa_user_profile_facts SET status = 'superseded', updated_at = ? WHERE id = ?`, [at, active.id]);
    }

    const fact: UserProfileFact = {
      id: Bun.randomUUIDv7(),
      userId: input.userId,
      kind: input.kind,
      key: input.key.trim(),
      value,
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.7)),
      source: input.source ?? 'manual',
      sourceRef: input.sourceRef ?? null,
      evidence: input.evidence ?? null,
      firstSeenAt: at,
      lastConfirmedAt: at,
      expiresAt: input.expiresAt ?? null,
      sensitivity: input.sensitivity ?? 'normal',
      status: 'active',
      createdAt: at,
      updatedAt: at,
    };

    await this.client.execute(
      `INSERT INTO bunwa_user_profile_facts
        (id, user_id, kind, key, value, confidence, source, source_ref, evidence, first_seen_at, last_confirmed_at, expires_at, sensitivity, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fact.id,
        fact.userId,
        fact.kind,
        fact.key,
        JSON.stringify(fact.value),
        fact.confidence,
        fact.source,
        fact.sourceRef,
        fact.evidence,
        fact.firstSeenAt,
        fact.lastConfirmedAt,
        fact.expiresAt,
        fact.sensitivity,
        fact.status,
        fact.createdAt,
        fact.updatedAt,
      ],
    );
    return fact;
  }

  async updateUserProfileFact(id: string, input: UpdateUserProfileFactInput): Promise<UserProfileFact | null> {
    const rows = await this.client.query(`SELECT * FROM bunwa_user_profile_facts WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) return null;
    const current = rowToUserProfileFact(rows[0]);
    const at = now();
    const fact: UserProfileFact = {
      ...current,
      kind: input.kind ?? current.kind,
      key: input.key !== undefined ? input.key.trim() : current.key,
      value: input.value !== undefined ? input.value : current.value,
      confidence: input.confidence !== undefined ? Math.max(0, Math.min(1, input.confidence)) : current.confidence,
      source: input.source ?? current.source,
      sourceRef: input.sourceRef !== undefined ? input.sourceRef : current.sourceRef,
      evidence: input.evidence !== undefined ? input.evidence : current.evidence,
      expiresAt: input.expiresAt !== undefined ? input.expiresAt : current.expiresAt,
      sensitivity: input.sensitivity ?? current.sensitivity,
      status: input.status ?? current.status,
      lastConfirmedAt: at,
      updatedAt: at,
    };
    await this.client.execute(
      `UPDATE bunwa_user_profile_facts
       SET kind = ?, key = ?, value = ?, confidence = ?, source = ?, source_ref = ?, evidence = ?, last_confirmed_at = ?, expires_at = ?, sensitivity = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        fact.kind,
        fact.key,
        JSON.stringify(fact.value),
        fact.confidence,
        fact.source,
        fact.sourceRef,
        fact.evidence,
        fact.lastConfirmedAt,
        fact.expiresAt,
        fact.sensitivity,
        fact.status,
        fact.updatedAt,
        fact.id,
      ],
    );
    return fact;
  }

  async deleteUserProfileFact(id: string): Promise<boolean> {
    const rows = await this.client.query(`SELECT id FROM bunwa_user_profile_facts WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) return false;
    await this.client.execute(`UPDATE bunwa_user_profile_facts SET status = 'deleted', updated_at = ? WHERE id = ?`, [now(), id]);
    return true;
  }

  async getUserProfileSummary(userId: string): Promise<UserProfileSummary | null> {
    const rows = await this.client.query(`SELECT * FROM bunwa_user_profile_summaries WHERE user_id = ? LIMIT 1`, [userId]);
    return rows[0] ? rowToUserProfileSummary(rows[0]) : null;
  }

  async upsertUserProfileSummary(input: UpsertUserProfileSummaryInput): Promise<UserProfileSummary> {
    const current = await this.getUserProfileSummary(input.userId);
    const at = now();
    const summary: UserProfileSummary = {
      userId: input.userId,
      summary: input.summary,
      version: (current?.version ?? 0) + 1,
      tokenCount: input.tokenCount ?? Math.ceil(input.summary.length / 4),
      model: input.model ?? current?.model ?? '',
      sourceFactIds: input.sourceFactIds ?? current?.sourceFactIds ?? [],
      generatedAt: at,
    };
    if (current) {
      await this.client.execute(
        `UPDATE bunwa_user_profile_summaries SET summary = ?, version = ?, token_count = ?, model = ?, source_fact_ids = ?, generated_at = ? WHERE user_id = ?`,
        [summary.summary, summary.version, summary.tokenCount, summary.model, JSON.stringify(summary.sourceFactIds), at, summary.userId],
      );
    } else {
      await this.client.execute(
        `INSERT INTO bunwa_user_profile_summaries (user_id, summary, version, token_count, model, source_fact_ids, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [summary.userId, summary.summary, summary.version, summary.tokenCount, summary.model, JSON.stringify(summary.sourceFactIds), at],
      );
    }
    return summary;
  }

  async listUserSegments(userId: string): Promise<UserSegment[]> {
    const at = now();
    const rows = await this.client.query(
      `SELECT * FROM bunwa_user_segments WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY segment_type ASC`,
      [userId, at],
    );
    return rows.map(rowToUserSegment);
  }

  async upsertUserSegment(input: UpsertUserSegmentInput): Promise<UserSegment> {
    const rows = await this.client.query(
      `SELECT * FROM bunwa_user_segments WHERE user_id = ? AND segment_type = ? LIMIT 1`,
      [input.userId, input.segmentType],
    );
    const at = now();
    const segment: UserSegment = {
      id: rows[0]?.id ?? Bun.randomUUIDv7(),
      userId: input.userId,
      segmentType: input.segmentType,
      segmentValue: input.segmentValue,
      score: input.score ?? null,
      reason: input.reason ?? '',
      computedAt: at,
      expiresAt: input.expiresAt ?? null,
    };
    if (rows[0]) {
      await this.client.execute(
        `UPDATE bunwa_user_segments SET segment_value = ?, score = ?, reason = ?, computed_at = ?, expires_at = ? WHERE id = ?`,
        [segment.segmentValue, segment.score, segment.reason, segment.computedAt, segment.expiresAt, segment.id],
      );
    } else {
      await this.client.execute(
        `INSERT INTO bunwa_user_segments (id, user_id, segment_type, segment_value, score, reason, computed_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [segment.id, segment.userId, segment.segmentType, segment.segmentValue, segment.score, segment.reason, segment.computedAt, segment.expiresAt],
      );
    }
    return segment;
  }

  async deleteUserSegment(id: string): Promise<boolean> {
    const rows = await this.client.query(`SELECT id FROM bunwa_user_segments WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) return false;
    await this.client.execute(`DELETE FROM bunwa_user_segments WHERE id = ?`, [id]);
    return true;
  }

  async buildProfileContext(userId: string, options: { includeSensitive?: boolean } = {}): Promise<ProfileContext | null> {
    const profile = await this.getUserProfile(userId);
    if (!profile) return null;
    const facts = (await this.listUserProfileFacts(userId)).filter(
      (fact) =>
        fact.status === 'active' &&
        fact.confidence >= 0.7 &&
        (options.includeSensitive === true || fact.sensitivity !== 'sensitive') &&
        (fact.expiresAt === null || fact.expiresAt > now()),
    );
    const segments = await this.listUserSegments(userId);
    const summary = await this.getUserProfileSummary(userId);

    const lines: string[] = ['<user_profile>'];
    const identity = [profile.displayName, profile.phone, profile.email, profile.timezone, profile.locale].filter(Boolean);
    if (identity.length) lines.push(`Identity: ${identity.join('; ')}.`);
    if (profile.tags.length) lines.push(`Tags: ${profile.tags.join(', ')}.`);

    const preferenceEntries = Object.entries(profile.preferences).map(([key, value]) => `${key}: ${formatProfileValue(value)}`);
    if (preferenceEntries.length) lines.push(`Preferences: ${preferenceEntries.join('; ')}.`);

    const importantEntries = Object.entries(profile.importantDetails).map(([key, value]) => `${key}: ${formatProfileValue(value)}`);
    if (importantEntries.length) lines.push(`Important: ${importantEntries.join('; ')}.`);

    for (const kind of ['communication', 'relationship', 'goal', 'constraint', 'preference', 'identity', 'other'] as const) {
      const group = facts.filter((fact) => fact.kind === kind);
      if (!group.length) continue;
      lines.push(`${kind[0].toUpperCase()}${kind.slice(1)}: ${group.map((fact) => `${fact.key}=${formatProfileValue(fact.value)}`).join('; ')}.`);
    }

    if (segments.length) {
      lines.push(`Segments: ${segments.map((segment) => `${segment.segmentType}=${segment.segmentValue}`).join(', ')}.`);
    }
    if (profile.notes) lines.push(`Notes: ${profile.notes}`);
    lines.push('</user_profile>');

    return { userId, text: lines.join('\n'), profile, facts, segments, summary };
  }

  /* ---------------------------------------------------------------------- */
  /* Conversations                                                           */
  /* ---------------------------------------------------------------------- */

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const at = now();
    const conversation: Conversation = {
      id: Bun.randomUUIDv7(),
      agentId: input.agentId,
      userId: input.userId ?? null,
      channel: input.channel ?? 'whatsapp',
      status: 'open',
      reviewEnabled: input.reviewEnabled ?? false,
      reviewRequestedAt: null,
      reviewRating: null,
      reviewText: null,
      metadata: input.metadata ?? {},
      startedAt: at,
      endedAt: null,
    };
    await this.client.execute(
      `INSERT INTO bunwa_conversations (id, agent_id, user_id, channel, status, review_enabled, review_requested_at, review_rating, review_text, metadata, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation.id,
        conversation.agentId,
        conversation.userId,
        conversation.channel,
        conversation.status,
        conversation.reviewEnabled ? 1 : 0,
        null,
        null,
        null,
        JSON.stringify(conversation.metadata),
        conversation.startedAt,
        null,
      ],
    );
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const rows = await this.client.query(`SELECT * FROM bunwa_conversations WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ? rowToConversation(rows[0]) : null;
  }

  async listConversations(filter: {
    agentId?: string;
    channel?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}): Promise<Conversation[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.agentId) {
      where.push('agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter.channel) {
      where.push('channel = ?');
      params.push(filter.channel);
    }
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.from) {
      where.push('started_at >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('started_at <= ?');
      params.push(filter.to);
    }
    const limit = Math.max(1, Math.min(filter.limit ?? 10_000, 50_000));
    const sql = `SELECT * FROM bunwa_conversations${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC LIMIT ${limit}`;
    const rows = await this.client.query(sql, params);
    return rows.map(rowToConversation);
  }

  async listConversationSummaries(filter: ConversationListFilter = {}): Promise<ConversationPage> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.agentId) {
      where.push('c.agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter.channel) {
      where.push('c.channel = ?');
      params.push(filter.channel);
    }
    if (filter.status) {
      where.push('c.status = ?');
      params.push(filter.status);
    }
    if (filter.from) {
      where.push('c.started_at >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('c.started_at <= ?');
      params.push(filter.to);
    }
    const q = filter.q?.trim().slice(0, 200);
    if (q) {
      where.push(`(
        c.id LIKE ? OR c.user_id LIKE ? OR c.metadata LIKE ?
        OR EXISTS (
          SELECT 1 FROM bunwa_conversation_messages sm
          WHERE sm.conversation_id = c.id AND sm.text LIKE ?
        )
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const pageSize = Math.max(1, Math.min(Math.floor(filter.pageSize ?? 20), 100));
    const offset = (page - 1) * pageSize;
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const lastMessageAt = `(
      SELECT MAX(m.created_at) FROM bunwa_conversation_messages m
      WHERE m.conversation_id = c.id
    )`;

    const rows = await this.client.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM bunwa_conversation_messages m WHERE m.conversation_id = c.id) AS message_count,
        (SELECT m.text FROM bunwa_conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.role FROM bunwa_conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_role,
        ${lastMessageAt} AS last_message_at
       FROM bunwa_conversations c${whereSql}
       ORDER BY COALESCE(${lastMessageAt}, c.started_at) DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );
    const totalRows = await this.client.query(
      `SELECT COUNT(*) AS total FROM bunwa_conversations c${whereSql}`,
      params,
    );
    const total = Number(totalRows[0]?.total ?? 0);
    return {
      conversations: rows.map(rowToConversationSummary),
      total,
      page,
      pageSize,
    };
  }

  async addConversationMessage(input: CreateConversationMessageInput): Promise<ConversationMessage> {
    const message: ConversationMessage = {
      id: Bun.randomUUIDv7(),
      conversationId: input.conversationId,
      agentId: input.agentId,
      userId: input.userId ?? null,
      role: input.role,
      channel: input.channel ?? 'whatsapp',
      text: input.text,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt ?? now(),
    };
    await this.client.execute(
      `INSERT INTO bunwa_conversation_messages
        (id, conversation_id, agent_id, user_id, role, channel, text, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.conversationId,
        message.agentId,
        message.userId,
        message.role,
        message.channel,
        message.text,
        JSON.stringify(message.metadata),
        message.createdAt,
      ],
    );
    return message;
  }

  async listConversationMessages(
    conversationId: string,
    filter: { limit?: number; before?: string; after?: string } = {},
  ): Promise<ConversationMessage[]> {
    const limit = Math.max(1, Math.min(filter.limit ?? 200, 500));
    const where = ['conversation_id = ?'];
    const params: any[] = [conversationId];
    if (filter.after) {
      where.push('created_at > ?');
      params.push(filter.after);
    }
    if (filter.before) {
      where.push('created_at < ?');
      params.push(filter.before);
    }
    const ascending = Boolean(filter.after);
    const rows = await this.client.query(
      `SELECT * FROM bunwa_conversation_messages
       WHERE ${where.join(' AND ')}
       ORDER BY created_at ${ascending ? 'ASC' : 'DESC'}
       LIMIT ${limit}`,
      params,
    );
    const messages = rows.map(rowToConversationMessage);
    return ascending ? messages : messages.reverse();
  }

  async closeConversation(id: string, endedAt = now()): Promise<Conversation | null> {
    const current = await this.getConversation(id);
    if (!current) return null;
    await this.client.execute(
      `UPDATE bunwa_conversations SET status = 'closed', ended_at = ? WHERE id = ?`,
      [endedAt, id],
    );
    return { ...current, status: 'closed', endedAt };
  }

  async setReviewRequested(id: string, at: string): Promise<Conversation | null> {
    const current = await this.getConversation(id);
    if (!current) return null;
    await this.client.execute(
      `UPDATE bunwa_conversations SET review_requested_at = ? WHERE id = ?`,
      [at, id],
    );
    return { ...current, reviewRequestedAt: at };
  }

  async submitReview(id: string, rating: number, text?: string): Promise<Conversation | null> {
    const current = await this.getConversation(id);
    if (!current) return null;
    await this.client.execute(
      `UPDATE bunwa_conversations SET review_rating = ?, review_text = ? WHERE id = ?`,
      [rating, text ?? null, id],
    );
    return { ...current, reviewRating: rating, reviewText: text ?? null };
  }

  /* ---------------------------------------------------------------------- */
  /* Analytics                                                               */
  /* ---------------------------------------------------------------------- */

  async recordEvent(input: RecordEventInput): Promise<AnalyticsEvent> {
    const event: AnalyticsEvent = {
      id: Bun.randomUUIDv7(),
      type: input.type,
      agentId: input.agentId ?? null,
      conversationId: input.conversationId ?? null,
      userId: input.userId ?? null,
      data: input.data ?? {},
      createdAt: now(),
    };
    await this.client.execute(
      `INSERT INTO bunwa_analytics_events (id, type, agent_id, conversation_id, user_id, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.type, event.agentId, event.conversationId, event.userId, JSON.stringify(event.data), event.createdAt],
    );
    return event;
  }

  async listEvents(filter: { agentId?: string; conversationId?: string; type?: string; limit?: number } = {}): Promise<AnalyticsEvent[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.agentId) {
      where.push('agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter.conversationId) {
      where.push('conversation_id = ?');
      params.push(filter.conversationId);
    }
    if (filter.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 1000));
    const sql = `SELECT * FROM bunwa_analytics_events${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ${limit}`;
    const rows = await this.client.query(sql, params);
    return rows.map(rowToEvent);
  }

  async listEventsForAnalytics(filter: {
    agentId?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}): Promise<AnalyticsEvent[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.agentId) {
      where.push('agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter.from) {
      where.push('created_at >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('created_at <= ?');
      params.push(filter.to);
    }
    const limit = Math.max(1, Math.min(filter.limit ?? 50_000, 50_000));
    const sql = `SELECT * FROM bunwa_analytics_events${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at ASC LIMIT ${limit}`;
    const rows = await this.client.query(sql, params);
    return rows.map(rowToEvent);
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                     */
/* -------------------------------------------------------------------------- */

function postgresUrlFromEnv(): string | undefined {
  return (
    process.env.BUNWA_DATABASE_URL ||
    process.env.WHATSAPP_SESSIONS_POSTGRESQL_URL
  );
}

function sqlitePathFromEnv(): string {
  return process.env.BUNWA_AGENT_DB_PATH || resolve(process.cwd(), 'data', 'bunwa-agent.sqlite');
}

export async function createAgentStore(): Promise<AgentStore> {
  const rawDriver =
    process.env.BUNWA_DATABASE_DRIVER ||
    process.env.BUNWA_DB_TYPE ||
    'sqlite';
  const driver = rawDriver.toLowerCase() === 'postgres' || rawDriver.toLowerCase() === 'postgresql'
    ? 'postgres'
    : 'sqlite';

  if (driver === 'postgres') {
    const url = postgresUrlFromEnv();
    if (!url) {
      throw new Error('Agent store: Postgres selected but BUNWA_DATABASE_URL / BUNWA_DATABASE_URL is not set');
    }
    const store = new SqlAgentStore(new KnexSqlClient(makePostgresKnex(url)));
    await store.init();
    return store;
  }

  const path = sqlitePathFromEnv();
  await mkdir(dirname(path), { recursive: true });
  const store = new SqlAgentStore(new BunSqliteClient(new Database(path)));
  await store.init();
  return store;
}

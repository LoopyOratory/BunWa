import type {
  Agent,
  AgentSkill,
  AddKnowledgeChunkInput,
  AnalyticsEvent,
  Conversation,
  CreateAgentInput,
  CreateConversationInput,
  CreateKnowledgeInput,
  CreateSkillInput,
  CreateUserProfileFactInput,
  ExternalMcpServer,
  ExternalMcpTool,
  CreateExternalMcpServerInput,
  UpdateExternalMcpServerInput,
  UpsertExternalMcpToolInput,
  KnowledgeChunk,
  KnowledgeSearchHit,
  KnowledgeSource,
  ModelRole,
  ModelSettings,
  ModelSettingsSecrets,
  ModelRoleSettings,
  ProfileContext,
  UpdateModelRoleSettingsInput,
  UpdateUserProfileFactInput,
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

export interface AgentStore {
  init(): Promise<void>;
  close(): Promise<void>;

  createAgent(input: CreateAgentInput): Promise<Agent>;
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  updateAgent(id: string, input: UpdateAgentInput): Promise<Agent | null>;
  deleteAgent(id: string): Promise<boolean>;

  getModelSettings(): Promise<ModelSettings>;
  getModelSettingsSecrets(): Promise<ModelSettingsSecrets>;
  updateModelSettings(input: UpdateModelSettingsInput): Promise<ModelSettings>;

  listModelRoleSettings(): Promise<ModelRoleSettings[]>;
  getModelRoleSettings(role: ModelRole): Promise<ModelRoleSettings>;
  updateModelRoleSettings(role: ModelRole, input: UpdateModelRoleSettingsInput): Promise<ModelRoleSettings>;

  createExternalMcpServer(input: CreateExternalMcpServerInput): Promise<ExternalMcpServer>;
  listExternalMcpServers(): Promise<ExternalMcpServer[]>;
  getExternalMcpServer(id: string): Promise<ExternalMcpServer | null>;
  updateExternalMcpServer(id: string, input: UpdateExternalMcpServerInput): Promise<ExternalMcpServer | null>;
  markExternalMcpServerRefresh(id: string, input: { refreshedAt?: string; error?: string | null }): Promise<ExternalMcpServer | null>;
  deleteExternalMcpServer(id: string): Promise<boolean>;

  listExternalMcpTools(): Promise<ExternalMcpTool[]>;
  listExternalMcpToolsForServer(serverId: string): Promise<ExternalMcpTool[]>;
  upsertExternalMcpTools(serverId: string, tools: UpsertExternalMcpToolInput[]): Promise<ExternalMcpTool[]>;
  deleteExternalMcpTools(serverId: string): Promise<boolean>;

  addSkill(agentId: string, input: CreateSkillInput): Promise<AgentSkill>;
  listSkills(agentId: string): Promise<AgentSkill[]>;
  deleteSkill(agentId: string, skillId: string): Promise<boolean>;

  addKnowledge(agentId: string, input: CreateKnowledgeInput): Promise<KnowledgeSource>;
  listKnowledge(agentId: string): Promise<KnowledgeSource[]>;
  deleteKnowledge(agentId: string, sourceId: string): Promise<boolean>;
  updateKnowledgeStatus(
    sourceId: string,
    input: { status: KnowledgeSource['status']; error?: string | null; embeddingModel?: string | null; chunkCount?: number },
  ): Promise<KnowledgeSource | null>;
  addKnowledgeChunks(chunks: AddKnowledgeChunkInput[]): Promise<KnowledgeChunk[]>;
  listKnowledgeChunks(agentId: string, sourceId: string): Promise<KnowledgeChunk[]>;
  searchKnowledge(agentId: string, embedding: number[], model: string, limit: number): Promise<KnowledgeSearchHit[]>;

  getUserProfile(userId: string): Promise<UserProfile | null>;
  upsertUserProfile(input: UpsertUserProfileInput): Promise<UserProfile>;
  listUserProfiles(limit?: number): Promise<UserProfile[]>;

  listUserProfileFacts(userId: string, includeInactive?: boolean): Promise<UserProfileFact[]>;
  createUserProfileFact(input: CreateUserProfileFactInput): Promise<UserProfileFact>;
  updateUserProfileFact(id: string, input: UpdateUserProfileFactInput): Promise<UserProfileFact | null>;
  deleteUserProfileFact(id: string): Promise<boolean>;

  getUserProfileSummary(userId: string): Promise<UserProfileSummary | null>;
  upsertUserProfileSummary(input: UpsertUserProfileSummaryInput): Promise<UserProfileSummary>;

  listUserSegments(userId: string): Promise<UserSegment[]>;
  upsertUserSegment(input: UpsertUserSegmentInput): Promise<UserSegment>;
  deleteUserSegment(id: string): Promise<boolean>;

  buildProfileContext(userId: string, options?: { includeSensitive?: boolean }): Promise<ProfileContext | null>;

  createConversation(input: CreateConversationInput): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  closeConversation(id: string, endedAt?: string): Promise<Conversation | null>;
  setReviewRequested(id: string, at: string): Promise<Conversation | null>;
  submitReview(id: string, rating: number, text?: string): Promise<Conversation | null>;

  recordEvent(input: RecordEventInput): Promise<AnalyticsEvent>;
  listEvents(filter?: { agentId?: string; conversationId?: string; type?: string; limit?: number }): Promise<AnalyticsEvent[]>;
}

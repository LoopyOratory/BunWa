import type {
  Agent,
  AgentSkill,
  AnalyticsEvent,
  Conversation,
  CreateAgentInput,
  CreateConversationInput,
  CreateKnowledgeInput,
  CreateSkillInput,
  KnowledgeSource,
  ModelSettings,
  ModelSettingsSecrets,
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

  addSkill(agentId: string, input: CreateSkillInput): Promise<AgentSkill>;
  listSkills(agentId: string): Promise<AgentSkill[]>;
  deleteSkill(agentId: string, skillId: string): Promise<boolean>;

  addKnowledge(agentId: string, input: CreateKnowledgeInput): Promise<KnowledgeSource>;
  listKnowledge(agentId: string): Promise<KnowledgeSource[]>;
  deleteKnowledge(agentId: string, sourceId: string): Promise<boolean>;

  getUserProfile(userId: string): Promise<UserProfile | null>;
  upsertUserProfile(input: UpsertUserProfileInput): Promise<UserProfile>;

  createConversation(input: CreateConversationInput): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  closeConversation(id: string, endedAt?: string): Promise<Conversation | null>;
  setReviewRequested(id: string, at: string): Promise<Conversation | null>;
  submitReview(id: string, rating: number, text?: string): Promise<Conversation | null>;

  recordEvent(input: RecordEventInput): Promise<AnalyticsEvent>;
  listEvents(filter?: { agentId?: string; conversationId?: string; type?: string; limit?: number }): Promise<AnalyticsEvent[]>;
}

export interface ChatwootAppConfig {
  id: string;
  session: string;
  app: 'chatwoot';
  enabled: boolean;
  config: {
    url: string;
    accountId: number;
    accountToken: string;
    inboxId: number;
    inboxIdentifier?: string;
    webhookSecret?: string; // HMAC secret for Chatwoot webhook signature verification
    locale?: string;
    commands?: { server?: boolean; queue?: boolean };
    conversations?: {
      sort?: 'created_newest' | 'activity_newest';
      status?: string[];
    };
    templates?: Record<string, string>;
  };
}

export interface ChatwootWebhookPayload {
  event: 'message_created' | 'message_updated';
  id: number;
  content: string;
  content_type?: string;
  content_attributes?: Record<string, any>;
  message_type: 'incoming' | 'outgoing';
  source_id: string | null;
  sender: {
    id: number;
    name: string;
    email?: string;
    type: 'user' | 'contact' | 'agent_bot';
  };
  conversation: {
    id: number;
    inbox_id: number;
    contact_inbox: {
      source_id: string;
    };
    status: string;
    additional_attributes?: Record<string, any>;
  };
  account: {
    id: number;
    name: string;
  };
  created_at: number;
  private: boolean;
  attachment?: {
    file_type?: string;
    data_url?: string;
  };
  [key: string]: any;
}

export interface ChatwootContactPayload {
  inbox_id: number;
  name: string;
  phone_number: string;
  source_id: string;
  custom_attributes?: Record<string, string>;
}

export interface ChatwootConversationPayload {
  inbox_id: number;
  source_id: string;
  contact_id: number;
  additional_attributes?: Record<string, any>;
  custom_attributes?: Record<string, any>;
  status?: 'open' | 'resolved' | 'pending';
}

/**
 * Engine-neutral WhatsApp interface.
 * Defines the contract that all engine adapters (Baileys, whatsapp-web.js) must implement.
 * Application code depends on this interface, never on engine-specific types.
 */

export type EngineType = 'noweb' | 'webjs' | 'baileys';

export interface EngineMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  type: MessageType;
  timestamp: number;
  isForwarded?: boolean;
  isFromMe: boolean;
  hasMedia?: boolean;
  mediaUrl?: string;
  mediaMimeType?: string;
  caption?: string;
  quotedMessage?: EngineMessage;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction' | 'unknown';

export interface EngineSessionConfig {
  engine: EngineType;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  authTimeout?: number;
}

export interface IWhatsAppEngine {
  readonly type: EngineType;

  /** Initialize the engine with credentials */
  initialize(config: EngineSessionConfig): Promise<void>;

  /** Shut down the engine gracefully */
  shutdown(): Promise<void>;

  /** Send a text message. Returns the message ID. */
  sendText(chatId: string, text: string): Promise<string>;

  /** Send an image message. Returns the message ID. */
  sendImage(chatId: string, buffer: Buffer, caption?: string, mimeType?: string): Promise<string>;

  /** Send a video message */
  sendVideo(chatId: string, buffer: Buffer, caption?: string): Promise<string>;

  /** Send an audio message */
  sendAudio(chatId: string, buffer: Buffer): Promise<string>;

  /** Send a document message */
  sendDocument(chatId: string, buffer: Buffer, filename: string, mimeType?: string): Promise<string>;

  /** Send a location message */
  sendLocation(chatId: string, lat: number, lng: number, title?: string): Promise<string>;

  /** Send a contact card */
  sendContact(chatId: string, contacts: Array<{ name: string; phone: string }>): Promise<string>;

  /** Send a sticker */
  sendSticker(chatId: string, buffer: Buffer, mimeType?: string): Promise<string>;

  /** Send a reaction to a message */
  sendReaction(chatId: string, messageId: string, emoji: string): Promise<void>;

  /** Send seen/read indicator */
  sendSeen(chatId: string): Promise<void>;

  /** Start typing indicator */
  startTyping(chatId: string): Promise<void>;

  /** Stop typing indicator */
  stopTyping(chatId: string): Promise<void>;

  /** Get contacts list */
  getContacts(): Promise<EngineContact[]>;

  /** Check if a phone number exists on WhatsApp */
  checkNumberExists(phone: string): Promise<boolean>;

  /** Get contact by phone number */
  getContactById(contactId: string): Promise<EngineContact | null>;

  /** Resolve phone number to JID */
  getNumberId(phone: string): Promise<string | null>;

  /** Get chat list */
  getChats(): Promise<EngineChat[]>;

  /** Get messages from a chat */
  getMessages(chatId: string, limit?: number): Promise<EngineMessage[]>;

  /** Delete a message */
  deleteMessage(chatId: string, messageId: string): Promise<void>;

  /** Forward a message */
  forwardMessage(chatId: string, messageId: string): Promise<string>;

  /** Mark a chat as read */
  markChatAsRead(chatId: string): Promise<void>;

  /** Get profile picture URL */
  getProfilePicture(chatId: string): Promise<string | null>;

  /** Get group info */
  getGroupMetadata(groupId: string): Promise<EngineGroupMetadata | null>;

  /** Get group members */
  getGroupMembers(groupId: string): Promise<EngineContact[]>;

  /** Add members to group */
  addGroupMembers(groupId: string, participants: string[]): Promise<void>;

  /** Remove members from group */
  removeGroupMembers(groupId: string, participants: string[]): Promise<void>;

  /** Leave group */
  leaveGroup(groupId: string): Promise<void>;

  /** Get QR code for pairing */
  getQrCode(): Promise<string | null>;

  /** Request pairing code for phone number */
  requestPairingCode(phoneNumber: string): Promise<string>;

  /** Get current session status */
  getStatus(): Promise<string>;

  /** Get current profile info */
  getMe(): Promise<EngineProfile | null>;
}

export interface EngineContact {
  id: string;
  name: string;
  phone: string;
  pushName?: string;
  isBusiness?: boolean;
  isMyContact?: boolean;
  profilePicture?: string;
}

export interface EngineChat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: EngineMessage;
}

export interface EngineGroupMetadata {
  id: string;
  name: string;
  description?: string;
  participants: Array<{ id: string; isAdmin: boolean; isSuperAdmin: boolean }>;
}

export interface EngineProfile {
  id: string;
  name: string;
  phone: string;
  profilePicture?: string;
}

/** Event emitted by engines */
export type EngineEvent =
  | 'message'
  | 'message_ack'
  | 'session_status'
  | 'message_reaction'
  | 'message_revoked'
  | 'message_edited'
  | 'group_join'
  | 'group_leave'
  | 'group_update'
  | 'presence_update'
  | 'call'
  | 'label_association'
  | 'channel_message';

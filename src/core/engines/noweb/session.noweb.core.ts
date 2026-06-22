import makeWASocket, {
  Browsers,
  Chat,
  Contact,
  decryptPollVote,
  DisconnectReason,
  downloadMediaMessage,
  extractMessageContent,
  generateMessageIDV2,
  generateWAMessageFromContent,
  getAggregateVotesInPollMessage,
  getContentType,
  getKeyAuthor,
  isPnUser,
  isRealMessage,
  isLidUser,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  MiscMessageGenerationOptions,
  normalizeMessageContent,
  PresenceData,
  proto,
  SocketConfig,
  WABrowserDescription,
  WAMessageContent,
  WAMessageKey,
  WAMessageUpdate,
  areJidsSameUser,
  jidDecode,
  updateMessageWithReceipt,
  updateMessageWithReaction,
} from '@whiskeysockets/baileys';
import { WACallEvent } from '@whiskeysockets/baileys/lib/Types/Call';
import { BaileysEventMap } from '@whiskeysockets/baileys/lib/Types/Events';
import { GroupMetadata } from '@whiskeysockets/baileys/lib/Types/GroupMetadata';
import {
  Label as NOWEBLabel,
  LabelActionBody,
} from '@whiskeysockets/baileys/lib/Types/Label';
import {
  ChatLabelAssociation,
  LabelAssociationType,
} from '@whiskeysockets/baileys/lib/Types/LabelAssociation';
import { MessageUserReceiptUpdate } from '@whiskeysockets/baileys/lib/Types/Message';
import { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger';
import { UnprocessableEntityException } from "../../exceptions";
import {
  getChannelInviteLink,
  getPublicUrlFromDirectPath,
  WhatsappSession,
} from '../../abc/session.abc';
import {
  ToGroupParticipant,
  ToGroupV2JoinEvent,
  ToGroupV2LeaveEvent,
  ToGroupV2Participants,
  ToGroupV2UpdateEvent,
} from './groups.noweb';
import { randomId, sendButtonMessage } from './noweb.buttons';
import {
  NOWEBNewsletterMetadata,
  toNewsletterMetadata,
} from './noweb.newsletter';
import { NowebAuthFactoryCore } from './NowebAuthFactoryCore';
import { NowebInMemoryStore } from './store/NowebInMemoryStore';
import {
  AvailableInPlusVersion,
  NotImplementedByEngineError,
} from '../../exceptions';
import { toVcardV3 } from '../../vcard';
import { createAgentProxy } from '../../helpers.proxy';
import type { Agent } from 'https';
import { IMediaEngineProcessor } from '../../media/IMediaEngineProcessor';
import { LottieMediaProcessorWrapper } from '../../media/LottieMediaProcessorWrapper';
import { QR } from '../../QR';
import { AckToStatus, StatusToAck } from '../../utils/acks';
import { pairs } from '../../../utils/pairs';
import { parseMessageIdSerialized } from '../../utils/ids';
import { isJidNewsletter, toCusFormat, toJID, JidFilter, jidsFromKey } from '../../utils/jids';
import { DistinctAck, DistinctMessages } from '../../utils/reactive';
import { flipObject, splitAt } from '../../../helpers';
import { PairingCodeResponse } from '../../../structures/auth.dto';
import { CallData } from '../../../structures/calls.dto';
import {
  Channel,
  ChannelListResult,
  ChannelMessage,
  ChannelRole,
  ChannelSearchByText,
  ChannelSearchByView,
  CreateChannelRequest,
  ListChannelsQuery,
  PreviewChannelMessages,
} from '../../../structures/channels.dto';
import {
  ChatSummary,
  GetChatMessageQuery,
  GetChatMessagesFilter,
  GetChatMessagesQuery,
  GetChatsOverviewParams,
  GetChatsParams,
  OverviewFilter,
  PinDuration,
  ReadChatMessagesQuery,
  ReadChatMessagesResponse,
} from '../../../structures/chats.dto';
import { SendButtonsRequest } from '../../../structures/chatting.buttons.dto';
import {
  ChatRequest,
  CheckNumberStatusQuery,
  EditMessageRequest,
  MessageContactVcardRequest,
  MessageDestination,
  MessageFileRequest,
  MessageForwardRequest,
  MessageImageRequest,
  MessageLinkCustomPreviewRequest,
  MessageLinkPreviewRequest,
  MessageLocationRequest,
  MessagePollRequest,
  MessageReactionRequest,
  MessageReplyRequest,
  MessageStarRequest,
  MessageTextRequest,
  MessageVideoRequest,
  MessageVoiceRequest,
  SendSeenRequest,
  WANumberExistResult,
} from '../../../structures/chatting.dto';
import { SendListRequest } from '../../../structures/chatting.list.dto';
import {
  ContactQuery,
  ContactRequest,
  ContactUpdateBody,
} from '../../../structures/contacts.dto';
import {
  ACK_UNKNOWN,
  SECOND,
  WAHAEngine,
  WAHAEvents,
  WAHAPresenceStatus,
  WAHASessionStatus,
  WAMessageAck,
} from '../../../structures/enums.dto';
import { BinaryFile, RemoteFile } from '../../../structures/files.dto';
import {
  CreateGroupRequest,
  GroupParticipant,
  ParticipantsRequest,
  SettingsSecurityChangeInfo,
} from '../../../structures/groups.dto';
import {
  Label,
  LabelChatAssociation,
  LabelDTO,
  LabelID,
} from '../../../structures/labels.dto';
import { LidToPhoneNumber } from '../../../structures/lids.dto';
import { WAMedia } from '../../../structures/media.dto';
import { ReplyToMessage } from '../../../structures/message.dto';
import { PaginationParams } from '../../../structures/pagination.dto';
import {
  WAHAChatPresences,
  WAHAPresenceData,
} from '../../../structures/presence.dto';
import { WAMessage, WAMessageReaction } from '../../../structures/responses.dto';
import { MeInfo } from '../../../structures/sessions.dto';
import {
  BROADCAST_ID,
  DeleteStatusRequest,
  ImageStatus,
  StatusRequest,
  TextStatus,
  VideoStatus,
  VoiceStatus,
} from '../../../structures/status.dto';
import {
  EnginePayload,
  PollVote,
  PollVotePayload,
  WAMessageAckBody,
  WAMessageEditedBody,
  WAMessageRevokedBody,
} from '../../../structures/webhooks.dto';
import { readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { LocalStore } from '../../storage/LocalStore';
import { LoggerBuilder } from '../../../utils/logging';
import { sleep, waitUntil } from '../../../utils/promiseTimeout';
import { exclude } from '../../../utils/reactive/ops/exclude';
import { SingleDelayedJobRunner } from '../../../utils/SingleDelayedJobRunner';
import { SinglePeriodicJobRunner } from '../../../utils/SinglePeriodicJobRunner';
import { StatusTracker } from '../../../utils/StatusTracker';
import { DefaultMap } from '../../../utils/DefaultMap';
import * as lodash from 'lodash';
import NodeCache from 'node-cache';
import {
  filter,
  fromEvent,
  groupBy,
  identity,
  merge,
  mergeAll,
  mergeMap,
  Observable,
  partition,
  share,
  tap,
} from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';

import { INowebStore } from './store/INowebStore';
import { NowebPersistentStore } from './store/NowebPersistentStore';
import { NowebStorageFactoryCore } from './store/NowebStorageFactoryCore';
import { ensureNumber, extractMediaContent } from './utils';
import { Agents } from './types';
import {
  IsEditedMessage,
  IsHistorySyncNotification,
  IsSecretEncryptedMessageEdit,
} from '../../../utils/pwa';
import {
  decryptSecretEncryptedMessageEditProto,
  getOrigSenderJidForMsgSecret,
  jidToNonAD,
} from '../../utils/secretEncryptedMessageEdit';
import { extractWALocation } from '../waproto/locaiton';
import { extractVCards } from '../waproto/vcards';
import { Activity } from '../../abc/activity';
import {
  WAHA_CLIENT_BROWSER_NAME,
  WAHA_CLIENT_DEVICE_NAME,
} from '../../env';
import { StatusStringToStatus } from '../../utils/acks';
import promiseRetry from 'promise-retry';

export const BaileysEvents = {
  CONNECTION_UPDATE: 'connection.update',
  CREDS_UPDATE: 'creds.update',
  MESSAGES_UPDATE: 'messages.update',
  MESSAGES_UPSERT: 'messages.upsert',
  MESSAGE_RECEIPT_UPDATE: 'message-receipt.update',
  GROUPS_UPSERT: 'groups.upsert',
  PRESENCE_UPDATE: 'presence.update',
};

const PresenceStatuses = {
  unavailable: WAHAPresenceStatus.OFFLINE,
  available: WAHAPresenceStatus.ONLINE,
  composing: WAHAPresenceStatus.TYPING,
  recording: WAHAPresenceStatus.RECORDING,
  paused: WAHAPresenceStatus.PAUSED,
};
const ToEnginePresenceStatus = flipObject(PresenceStatuses);

export class WhatsappSessionNoWebCore extends WhatsappSession {
  private START_ATTEMPT_DELAY_SECONDS = 2;
  private AUTO_RESTART_AFTER_SECONDS = 28 * 60;

  engine = WAHAEngine.NOWEB;
  authFactory = new NowebAuthFactoryCore();
  storageFactory = new NowebStorageFactoryCore();
  private startDelayedJob: SingleDelayedJobRunner;
  private shouldRestart: boolean;

  private autoRestartJob: SinglePeriodicJobRunner;
  private msgRetryCounterCache: NodeCache;
  private placeholderResendCache: NodeCache;
  protected engineLogger: ILogger;

  private authNOWEBStore: any;

  sock: ReturnType<typeof makeWASocket>;
  store: INowebStore;
  private qr: QR;

  private statusTracker = new StatusTracker();

  public constructor(config) {
    super(config);
    this.shouldRestart = true;

    this.qr = new QR();
    // external map to store retry counts of messages when decryption/encryption fails
    // keep this out of the socket itself, to prevent a message decryption/encryption loop across socket restarts
    this.msgRetryCounterCache = new NodeCache({
      stdTTL: 60 * 60, // 1 hour
      useClones: false,
    });
    this.placeholderResendCache = new NodeCache({
      stdTTL: 60 * 60, // 1 hour
      useClones: false,
    });

    this.engineLogger = this.loggerBuilder.child({
      name: 'NOWEBEngine',
    }) as unknown as ILogger;

    // Restart job if session failed
    this.startDelayedJob = new SingleDelayedJobRunner(
      'start-engine',
      this.START_ATTEMPT_DELAY_SECONDS * SECOND,
      this.logger,
    );

    // Enable auto-restart
    const shiftSeconds = Math.floor(Math.random() * 30);
    const delay = this.AUTO_RESTART_AFTER_SECONDS + shiftSeconds;
    this.autoRestartJob = new SinglePeriodicJobRunner(
      'auto-restart',
      delay * SECOND,
      this.logger,
    );
    this.authNOWEBStore = null;
  }

  protected set status(value: WAHASessionStatus) {
    this.statusTracker.track(value);
    super.status = value;
  }

  public get status() {
    return super.status;
  }

  async start() {
    this.status = WAHASessionStatus.STARTING;
    this.buildClient().catch((err) => {
      this.logger.error('Failed to start the client');
      this.logger.error(err, err.stack);
      this.status = WAHASessionStatus.FAILED;
      this.restartClient();
    });
  }

  async unpair() {
    this.unpairing = true;
    this.shouldRestart = false;
    await this.sock?.logout();
  }

  getSocketConfig(agents: Agents | undefined, state): Partial<SocketConfig> {
    // Detect browser — default to macOS Safari
    let browser = Browsers.macOS('Safari');
    let deviceName =
      this.sessionConfig?.client?.deviceName ?? WAHA_CLIENT_DEVICE_NAME;
    let browserName =
      this.sessionConfig?.client?.browserName ?? WAHA_CLIENT_BROWSER_NAME;
    if (browserName && !deviceName) {
      browser = Browsers.appropriate(browserName);
    } else if (!browserName && deviceName) {
      browser = [deviceName, 'Chrome', '22.04.4'];
    } else if (browserName && deviceName) {
      switch (deviceName) {
        case 'Mac OS':
        case 'MacOS':
        case 'macos':
          browser = Browsers.macOS(browserName);
          break;
        case 'ubuntu':
        case 'Ubuntu':
          browser = Browsers.ubuntu(browserName);
          break;
        case 'windows':
        case 'Windows':
          browser = Browsers.windows(browserName);
          break;
        default:
          browser = [deviceName, browserName, '22.04.4'];
      }
    }

    const fullSyncEnabled = this.sessionConfig?.noweb?.store?.fullSync || false;
    let markOnlineOnConnect = this.sessionConfig?.noweb?.markOnline;
    if (markOnlineOnConnect == undefined) {
      markOnlineOnConnect = true;
    }
    return {
      agent: agents?.socket,
      // Baileys media upload uses Node https.request in Node runtime.
      fetchAgent: agents?.fetch as Agent,
      auth: state,
      printQRInTerminal: false,
      browser: browser,
      logger: this.engineLogger,
      mobile: false,
      defaultQueryTimeoutMs: 30_000,
      keepAliveIntervalMs: 30_000,
      getMessage: (key) => this.getMessage(key),
      syncFullHistory: fullSyncEnabled,
      msgRetryCounterCache: this.msgRetryCounterCache,
      placeholderResendCache: this.placeholderResendCache,
      markOnlineOnConnect: markOnlineOnConnect,
    };
  }

  async makeSocket(): Promise<any> {
    if (!this.authNOWEBStore) {
      const store = await this.authFactory.buildAuth(
        this.sessionStore,
        this.name,
      );
      /** caching makes the store faster to send/recv messages */
      store.state.keys = makeCacheableSignalKeyStore(
        store.state.keys,
        this.engineLogger,
      );
      this.authNOWEBStore = store;
    }
    const { state, saveCreds } = this.authNOWEBStore;
    const agents = this.makeProxyAgents();
    const socketConfig: SocketConfig = this.getSocketConfig(
      agents,
      state,
    ) as SocketConfig;
    const sock = makeWASocket(socketConfig);
    sock.ev.on('creds.update', saveCreds);
    return sock;
  }

  protected makeProxyAgents(): Agents | undefined {
    if (!this.proxyConfig) {
      return undefined;
    }
    return createAgentProxy(this.proxyConfig);
  }

  private async ensureStore() {
    if (this.store) {
      return;
    }

    this.logger.debug(`Making a new store...`);
    const storeEnabled = this.sessionConfig?.noweb?.store?.enabled || false;
    if (!storeEnabled) {
      this.logger.debug('Using NowebInMemoryStore');
      this.store = new NowebInMemoryStore();
      return;
    }

    this.logger.debug('Using NowebPersistentStore');
    const storage = this.storageFactory.createStorage(
      this.sessionStore,
      this.name,
    );
    this.store = new NowebPersistentStore(
      this.loggerBuilder.child({ name: NowebPersistentStore.name }),
      storage,
      this.jids,
    );
    await this.store.init();
  }

  connectStore() {
    this.logger.debug(`Connecting store...`);
    this.logger.debug(`Binding store to socket...`);
    this.store.bind(this.sock.ev, this.sock);
  }

  resubscribeToKnownPresences() {
    for (const jid in this.store.presences) {
      this.subscribePresence(jid);
    }
  }

  async buildClient() {
    const t0 = Date.now();
    this.statusTracker.reset();
    this.shouldRestart = true;
    // @ts-ignore
    this.sock?.ev?.removeAllListeners();

    await this.ensureStore();
    this.logger.info(`[${this.name}] Store ready in ${Date.now() - t0}ms`);

    this.sock = await this.makeSocket();
    this.logger.info(`[${this.name}] Socket created in ${Date.now() - t0}ms`);

    this.fixMessages();
    this.issueMessageUpdateOnEdits();
    this.issueMessageUpdateOnPoll();
    this.issuePresenceUpdateOnMessageUpsert();
    if (this.isDebugEnabled()) {
      this.listenEngineEventsInDebugMode();
    }
    this.connectStore();
    this.listenConnectionEvents();
    this.subscribeEngineEvents2();
    this.listenContactsUpdatePictureProfile();
    this.logger.info(`[${this.name}] buildClient complete in ${Date.now() - t0}ms`);
  }

  private enableAutoRestart() {
    this.autoRestartJob.start(async () => {
      this.logger.info('Auto-restarting the client connection...');
      if (this.sock?.ws?.isConnecting) {
        this.logger.warn('Auto-restart skipped, the client is connecting...');
        return;
      }
      this.sock?.end(undefined);
    });
  }

  protected async getMessage(
    key: WAMessageKey,
  ): Promise<WAMessageContent | undefined> {
    if (!this.store) {
      return proto.Message.create({});
    }
    const msg = await this.store.loadMessage(key.remoteJid, key.id);
    return msg?.message || undefined;
  }

  protected listenEngineEventsInDebugMode() {
    this.sock.ev.process((events) => {
      this.logger.debug({ events: events }, `NOWEB events`);
    });
  }

  private restartClient() {
    if (!this.shouldRestart) {
      this.logger.debug(
        'Should not restart the client, ignoring restart request',
      );
      return;
    }

    this.startDelayedJob.schedule(async () => {
      if (!this.shouldRestart) {
        this.logger.warn(
          'Should not restart the client, ignoring restart request',
        );
        return;
      }
      await this.end();
      await this.start();
    });
  }

  protected listenConnectionEvents() {
    const startTime = Date.now();
    this.logger.debug(`Start listening ${BaileysEvents.CONNECTION_UPDATE}...`);
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;
      if (connection === 'open') {
        this.logger.info(`[${this.name}] WhatsApp connection OPEN in ${Date.now() - startTime}ms`);
      }
      if (isNewLogin) {
        this.restartClient();
      } else if (connection === 'open') {
        this.qr.save('');
        this.status = WAHASessionStatus.WORKING;
        // Do we need to resubscribe?
        // Ideally not, we need to explicitly call interesting
        // jids every 1 minute
        // this.resubscribeToKnownPresences();
        return;
      } else if (connection === 'close') {
        this.logger.info(`[${this.name}] Connection closed after ${Date.now() - startTime}ms`);
        this.qr.save('');
        const error = lastDisconnect.error as any;
        const statusCode = error?.output?.statusCode;

        // Restart required from the server
        const restartRequired = statusCode === DisconnectReason.restartRequired;
        if (restartRequired) {
          this.restartClient();
          return;
        }

        // Stuck in STARTING status
        if (this.statusTracker.isStuckInStarting()) {
          this.logger.error(
            'Session stuck in STARTING status, force stopping the session.',
          );
          await this.failed();
          return;
        }

        // Do not reconnect if the QR code has not been scanned yet
        if (this.status == WAHASessionStatus.SCAN_QR_CODE) {
          this.logger.warn(
            'QR code has not been scanned yet, force stopping the session.',
          );
          await this.failed();
          return;
        }

        // Reconnect if not logged out
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          if (lastDisconnect.error) {
            this.logger.info(
              `Connection closed due to '${lastDisconnect.error}', reconnecting...`,
            );
          }
          this.restartClient();
          return;
        }

        // 401 / logged out — clear stale auth and fall back to QR code
        this.logger.warn(
          `Connection closed due to '${lastDisconnect.error}' (status ${statusCode}). Clearing auth state and restarting for QR code scan.`,
        );
        await this.clearAuthAndRestart();
      }

      // Save QR
      if (qr) {
        this.logger.info(`[${this.name}] QR code received in ${Date.now() - startTime}ms`);
        this.qr.save(qr);
        this.printQR(this.qr);
        this.status = WAHASessionStatus.SCAN_QR_CODE;
      }
    });
  }

  async stop() {
    this.shouldRestart = false;
    this.startDelayedJob.cancel();
    this.autoRestartJob.stop();

    const hasCreds = this.authNOWEBStore?.state?.creds;
    if (hasCreds && this.status == WAHASessionStatus.WORKING) {
      this.logger.info('Saving creds before stopping...');
      await this.authNOWEBStore.saveCreds().catch((e) => {
        this.logger.error('Failed to save creds');
        this.logger.error(e, e.stack);
      });
      this.logger.info('Creds saved');
    }
    this.status = WAHASessionStatus.STOPPED;
    this.stopEvents();

    this.mediaManager?.close();
    await this.end();
    await this.store?.close();
    this.authNOWEBStore?.close().catch((err) => {
      this.logger.error('Failed to close NOWEB auth store');
      this.logger.error(err, err.stack);
    });
  }

  protected async failed() {
    this.shouldRestart = false;
    this.startDelayedJob.cancel();
    this.autoRestartJob.stop();

    // We'll restart the client if it's in the process of unpairing
    this.status = WAHASessionStatus.FAILED;

    if (this.unpairing) {
      // Wait for unpairing to complete before ending the socket
      await sleep(1_000);
    }

    await this.end();
    await this.store?.close();
  }

  private async clearAuthAndRestart() {
    // If user intentionally unpaired, don't restart
    if (this.unpairing) {
      this.logger.info('Intentional logout, not restarting.');
      await this.failed();
      return;
    }

    this.logger.info('Clearing stale auth state...');
    this.shouldRestart = false;
    this.startDelayedJob.cancel();
    this.autoRestartJob.stop();

    await this.end();
    await this.store?.close();
    this.store = null as any;

    // Delete auth files (creds.json, pre-keys, etc.) from the session directory
    try {
      if (this.sessionStore instanceof LocalStore) {
        const authFolder = this.sessionStore.getSessionDirectory(this.name);
        const files = await readdir(authFolder);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await unlink(join(authFolder, file)).catch(() => {});
          }
        }
        this.logger.info(`Cleared ${files.length} auth files from ${authFolder}`);
      } else {
        this.logger.warn('Session store is not LocalStore, cannot clear auth files');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to clear auth files, continuing anyway');
    }

    // Reset auth store so makeSocket() builds fresh state
    this.authNOWEBStore = null;

    // Restart — will generate new QR code since creds are gone
    this.status = WAHASessionStatus.STARTING;
    this.shouldRestart = true;
    this.buildClient().catch((err) => {
      this.logger.error('Failed to restart client after auth clear');
      this.logger.error(err, err.stack);
      this.status = WAHASessionStatus.FAILED;
    });
  }

  private fixMessages() {
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      for (const message of messages) {
        // If no status - set it to WAMessageAck.DEVICE
        message.status = message.status ?? AckToStatus(WAMessageAck.DEVICE);

        // Fix fromMe in @lid addressed groups
        // https://github.com/devlikeapro/waha/issues/1350
        if (message.key.participant === this.getSessionMeInfo()?.lid) {
          message.key.fromMe = true;
        }
      }
    });
  }

  private issueMessageUpdateOnEdits() {
    // Remove it after it's been merged
    // https://github.com/WhiskeySockets/Baileys/pull/855/
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      for (const message of messages) {
        if (IsEditedMessage(message.message)) {
          const content = normalizeMessageContent(message.message);
          const protocolMsg = content?.protocolMessage;
          this.sock?.ev.emit('messages.update', [
            {
              key: {
                ...message.key,
                id: protocolMsg.key.id,
              },
              update: { message: protocolMsg.editedMessage },
            },
          ]);
        }
      }
    });
  }

  private issueMessageUpdateOnPoll() {
    // Fix for https://github.com/devlikeapro/waha/issues/960
    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      const me = this.getSessionMeInfo();
      if (!me) {
        this.logger.warn(
          'Cannot issue poll updates, session "me" info not found',
        );
        return;
      }

      for (const message of messages) {
        const content = normalizeMessageContent(message.message);
        if (!content?.pollUpdateMessage) {
          continue;
        }
        const creationMsgKey = content.pollUpdateMessage.pollCreationMessageKey;
        // we need to fetch the poll creation message to get the poll enc key
        const pkey = { ...creationMsgKey };
        pkey.remoteJid = null; // try to find message creation by id only
        const pollMsg = await this.getMessage(pkey);
        if (!pollMsg) {
          this.logger.warn(
            { creationMsgKey },
            'poll creation message not found, cannot decrypt update',
          );
          continue;
        }

        // Because of new @lid system it's hard to detect exactly how
        // the vote has been encrypted, so we'll iterator over all possible
        // not null combinations
        const key = message.key;
        const myIds = [jidNormalizedUser(me.id), jidNormalizedUser(me.lid)];
        const participantIds = [
          jidNormalizedUser(key?.participantAlt),
          jidNormalizedUser(key?.remoteJidAlt),
          jidNormalizedUser(key?.participant),
          jidNormalizedUser(key?.remoteJid),
        ];
        let creators: string[] = creationMsgKey.fromMe
          ? [...myIds, ...participantIds]
          : [...participantIds, ...myIds];
        let votes: string[] = key.fromMe
          ? [...myIds, ...participantIds]
          : [...participantIds, ...myIds];
        creators = lodash.uniq(creators.filter(Boolean));
        votes = lodash.uniq(votes.filter(Boolean));
        let found = false;
        for (const [pollCreatorJid, voterJid] of pairs(creators, votes)) {
          try {
            const pollEncKey = pollMsg.messageContextInfo?.messageSecret;
            const voteMsg = decryptPollVote(content.pollUpdateMessage.vote, {
              pollCreatorJid: pollCreatorJid,
              pollMsgId: creationMsgKey.id,
              pollEncKey: pollEncKey,
              voterJid: voterJid,
            });
            this.sock.ev.emit('messages.update', [
              {
                key: creationMsgKey,
                update: {
                  pollUpdates: [
                    {
                      pollUpdateMessageKey: message.key,
                      vote: voteMsg,
                      senderTimestampMs: (
                        content.pollUpdateMessage.senderTimestampMs as Long
                      ).toNumber(),
                    },
                  ],
                },
              },
            ]);
            found = true;
            break;
          } catch (err) {
            this.logger.trace(
              {
                err: err.message,
                key: key,
                creationsMsgKey: creationMsgKey,
                pollCreatorJid: pollCreatorJid,
                voterJid: voterJid,
              },
              'failed to decrypt poll vote using creator and voter',
            );
          }
        }
        if (!found) {
          this.logger.warn(
            {
              key: key,
              creationsMsgKey: creationMsgKey,
              creators: creators,
              voters: votes,
            },
            'failed to decrypt poll vote with any combination of creator/voter',
          );
        }
      }
    });
  }

  private issuePresenceUpdateOnMessageUpsert() {
    //
    // Fix for "typing" after sending a message
    // https://github.com/devlikeapro/waha/issues/379
    //
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      const meId = this.sock?.authState?.creds?.me?.id;
      for (const message of messages) {
        if (!isRealMessage(message)) {
          continue;
        }
        if (message.key.fromMe) {
          continue;
        }
        const jid = message.key.remoteJid;
        const participant = message.key.participant || jid;
        const jidPresences = this.store?.presences?.[jid];
        const participantPresence = jidPresences?.[participant];
        if (participantPresence?.lastKnownPresence === 'composing') {
          this.logger.debug(
            `Fixing presence for '${participant}' in '${jid} since it's typing`,
          );
          const presence: PresenceData = { lastKnownPresence: 'available' };
          this.sock?.ev?.emit('presence.update', {
            id: jid,
            presences: { [participant]: presence },
          });
        }
      }
    });
  }

  private async end() {
    this.cleanupPresenceTimeout();
    this.presence = null;
    this.autoRestartJob.stop();
    // @ts-ignore
    this.sock?.ev?.removeAllListeners();
    this.sock?.ws?.removeAllListeners();
    // wait until connection is not connecting to avoid error:
    // "WebSocket was closed before the connection was established"
    await waitUntil(async () => !this.sock?.ws?.isConnecting, 500, 3_000);
    this.sock?.end(undefined);
  }

  getSessionMeInfo(): MeInfo | null {
    const me = this.sock?.authState?.creds?.me;
    if (!me) {
      return null;
    }
    const meId = jidNormalizedUser(me.id);
    return {
      id: toCusFormat(meId),
      pushName: me.name,
      lid: jidNormalizedUser(me.lid),
    };
  }

  /**
   * START - Methods for API
   */

  /**
   * Auth methods
   */
  public getQR(): QR {
    return this.qr;
  }

  public async requestCode(
    phoneNumber: string,
    method: string,
    params?: any,
  ): Promise<PairingCodeResponse> {
    if (method) {
      const err = `NOWEB engine doesn't support any 'method', remove it and try again`;
      throw new UnprocessableEntityException(err);
    }

    if (this.status == WAHASessionStatus.STARTING) {
      this.logger.debug('Waiting for connection update...');
      await this.sock.waitForConnectionUpdate(async (update) => !!update.qr);
    }

    if (this.status != WAHASessionStatus.SCAN_QR_CODE) {
      const err = `Can request code only in SCAN_QR_CODE status. The current status is ${this.status}`;
      throw new UnprocessableEntityException(err);
    }

    this.logger.info(`Requesting pairing code for '${phoneNumber}'...`);
    const code: string = await this.sock.requestPairingCode(phoneNumber);
    // show it as ABCD-ABCD
    const parts = splitAt(code, 4);
    const codeRepr = parts.join('-');
    this.logger.info(`Your code: ${codeRepr}`);
    return { code: codeRepr };
  }

  async getScreenshot(): Promise<Buffer> {
    if (this.status === WAHASessionStatus.STARTING) {
      throw new UnprocessableEntityException(
        `The session is starting, please try again after few seconds`,
      );
    } else if (this.status === WAHASessionStatus.SCAN_QR_CODE) {
      return this.qr.get();
    } else if (this.status === WAHASessionStatus.WORKING) {
      throw new UnprocessableEntityException(
        `Can not get screenshot for non chrome based engine.`,
      );
    } else {
      throw new UnprocessableEntityException(`Unknown status - ${this.status}`);
    }
  }

  /**
   * Profile methods
   */
  @Activity()
  public async setProfileName(name: string): Promise<boolean> {
    await this.sock.updateProfileName(name);
    return true;
  }

  @Activity()
  public async setProfileStatus(status: string): Promise<boolean> {
    await this.sock.updateProfileStatus(status);
    return true;
  }

  protected setProfilePicture(file: BinaryFile | RemoteFile): Promise<boolean> {
    throw new AvailableInPlusVersion();
  }

  protected deleteProfilePicture(): Promise<boolean> {
    throw new AvailableInPlusVersion();
  }

  /**
   * Other methods
   */
  @Activity()
  async checkNumberStatus(
    request: CheckNumberStatusQuery,
  ): Promise<WANumberExistResult> {
    let phone = request.phone.split('@')[0];
    phone = phone.replace(/\+/g, '');
    const [result] = await this.sock.onWhatsApp(phone);
    if (!result || !result.exists) {
      return { numberExists: false };
    }
    return {
      numberExists: true,
      chatId: toCusFormat(result.jid),
    };
  }

  async generateNewMessageId(): Promise<string> {
    return this.generateMessageID();
  }

  @Activity()
  async rejectCall(from: string, id: string): Promise<void> {
    const jid = toJID(this.ensureSuffix(from));
    await this.sock.rejectCall(id, jid);
  }

  @Activity()
  async sendText(request: MessageTextRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const message = {
      text: request.text,
      mentions: request.mentions?.map(toJID),
      linkPreview: this.getLinkPreview(request),
    };
    const options: any = await this.getMessageOptions(request);
    options.linkPreviewHighQuality = request.linkPreviewHighQuality;
    return this.sock.sendMessage(chatId, message, options);
  }

  @Activity()
  public deleteMessage(chatId: string, messageId: string) {
    const jid = toJID(this.ensureSuffix(chatId));
    const key = parseMessageIdSerialized(messageId);
    const options = {
      messageId: this.generateMessageID(),
    };
    return this.sock.sendMessage(jid, { delete: key }, options);
  }

  @Activity()
  public async editMessage(
    chatId: string,
    messageId: string,
    request: EditMessageRequest,
  ) {
    const jid = toJID(this.ensureSuffix(chatId));
    const key = parseMessageIdSerialized(messageId);
    const stored = await this.store
      ?.loadMessage(key.remoteJid, key.id)
      .catch(() => null);
    const content = extractMessageContent(stored?.message);
    let editedMessage = undefined;
    if (content?.imageMessage) {
      editedMessage = {
        imageMessage: {
          caption: request.text,
        },
      };
    } else if (content?.videoMessage) {
      editedMessage = {
        videoMessage: {
          caption: request.text,
        },
      };
    } else if (content?.documentMessage) {
      editedMessage = {
        documentMessage: {
          caption: request.text,
        },
      };
    } else if (content?.documentWithCaptionMessage?.message?.documentMessage) {
      editedMessage = {
        documentWithCaptionMessage: {
          message: {
            documentMessage: {
              caption: request.text,
            },
          },
        },
      };
    }
    let message: any = {
      text: request.text,
      mentions: request.mentions?.map(toJID),
      edit: key,
      editedMessage: editedMessage,
      linkPreview: this.getLinkPreview(request),
      linkPreviewHighQuality: request.linkPreviewHighQuality,
    };
    const options = {
      messageId: this.generateMessageID(),
    };
    if (isJidNewsletter(jid)) {
      // Newsletter edits reuse the original message ID
      options.messageId = key.id;
    }
    return await this.sock.sendMessage(jid, message, options);
  }

  @Activity()
  async sendContactVCard(request: MessageContactVcardRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const contacts = (request.contacts || []).map((el) => ({
      vcard: toVcardV3([el]),
    }));
    if (contacts.length === 0) {
      throw new UnprocessableEntityException('No contacts provided');
    }
    const options = await this.getMessageOptions(request);
    const msg = { contacts: { contacts: contacts } };
    return await this.sock.sendMessage(chatId, msg, options);
  }

  @Activity()
  async sendPoll(request: MessagePollRequest) {
    if (!request.poll) {
      throw new UnprocessableEntityException('Missing poll data');
    }
    const requestPoll = request.poll;
    if (!requestPoll.name || !requestPoll.options?.length) {
      throw new UnprocessableEntityException(
        'Poll requires name and at least one option',
      );
    }
    const values = requestPoll.options.map((opt) =>
      typeof opt === 'string' ? opt : opt.name,
    );
    const poll = {
      name: requestPoll.name,
      values: values,
      selectableCount: requestPoll.multipleAnswers
        ? values.length
        : 1,
      messageSecret: requestPoll.messageSecret,
    };
    const message = { poll: poll };
    const remoteJid = toJID(this.ensureSuffix(request.chatId));
    const options = await this.getMessageOptions(request);
    const result = await this.sock.sendMessage(remoteJid, message, options);
    return this.toWAMessage(result);
  }

  @Activity()
  async reply(request: MessageReplyRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const options = await this.getMessageOptions(request);
    const message = {
      text: request.text,
      mentions: request.mentions?.map(toJID),
    };
    return await this.sock.sendMessage(chatId, message, options);
  }

  /**
   * Convert file data to a Buffer for Baileys.
   * Handles: URL strings, base64 strings, and { mimetype, filename, data } objects.
   */
  private fileToBuffer(file: any): Buffer | string {
    if (typeof file === 'string') {
      // URL or raw base64 string
      return file;
    }
    if (file && typeof file === 'object' && file.data) {
      // { mimetype, filename, data: "data:image/png;base64,..." }
      const base64 = file.data.includes(',') ? file.data.split(',')[1] : file.data;
      return Buffer.from(base64, 'base64');
    }
    return file;
  }

  @Activity()
  async sendImage(request: MessageImageRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const fileData = this.fileToBuffer(request.file);
    const message: any = {
      image: typeof fileData === 'string' ? { url: fileData } : fileData,
      caption: request.caption,
      mentions: request.mentions?.map(toJID),
    };
    const options: any = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, message, options);
  }

  @Activity()
  async sendFile(request: MessageFileRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const fileData = this.fileToBuffer(request.file);
    const message: any = {
      document: typeof fileData === 'string' ? { url: fileData } : fileData,
      caption: request.caption,
      mentions: request.mentions?.map(toJID),
    };
    const options: any = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, message, options);
  }

  @Activity()
  async sendVoice(request: MessageVoiceRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const fileData = this.fileToBuffer(request.file);
    const message: any = {
      audio: typeof fileData === 'string' ? { url: fileData } : fileData,
      ptt: request.convert !== false,
    };
    const options: any = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, message, options);
  }

  @Activity()
  async sendVideo(request: MessageVideoRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const fileData = this.fileToBuffer(request.file);
    const message: any = {
      video: typeof fileData === 'string' ? { url: fileData } : fileData,
      caption: request.caption,
      mentions: request.mentions?.map(toJID),
    };
    const options: any = await this.getMessageOptions(request);
    if (request.asNote) {
      message.notes = true;
    }
    return this.sock.sendMessage(chatId, message, options);
  }

  @Activity()
  async sendButtonsReply(request: MessageButtonReply) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const message = {
      buttonsResponseMessage: {
        selectedButtonId: request.selectedButtonID,
        selectedDisplayText: request.selectedDisplayText,
        type: 1,
        contextInfo: request.replyTo ? {
          stanzaId: request.replyTo,
          participant: chatId,
        } : undefined,
      },
    };
    const options = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, message as any, options);
  }

  @Activity()
  async sendPollVote(request: MessagePollVoteRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const key = parseMessageIdSerialized(request.pollMessageId);
    const pollMessage = await this.store.loadMessage(key.remoteJid, key.id);
    if (!pollMessage) {
      throw new UnprocessableEntityException(
        `Poll message with id '${request.pollMessageId}' not found`,
      );
    }
    const pollUpdate = {
      pollUpdateMessage: {
        pollCreationMessageKey: key,
        selectedOptions: request.votes.map((v) => Buffer.from(v)),
      },
    };
    const options = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, pollUpdate as any, options);
  }

  @Activity()
  async sendEvent(request: EventMessageRequest): Promise<WAMessage> {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const message = {
      eventMessage: {
        name: request.text,
        description: request.text,
        startTime: Date.now(),
        endTime: Date.now() + 3600000, // 1 hour default
        isCanceled: false,
      },
    };
    const options = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, message as any, options);
  }

  @Activity()
  async sendLinkCustomPreview(
    request: MessageLinkCustomPreviewRequest,
  ): Promise<any> {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const text = request.text || (request as any).body || '';
    const msg: any = {
      text: text,
      linkPreview: true,
      linkPreviewHighQuality: request.linkPreviewHighQuality,
    };
    const options: any = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, msg, options);
  }

  protected async uploadMedia(
    file: RemoteFile | BinaryFile,
    type,
  ): Promise<any> {
    if (file && ('url' in file || 'data' in file)) {
      throw new AvailableInPlusVersion('Sending media (image, video, pdf)');
    }
    return;
  }

  @Activity()
  async sendButtons(request: SendButtonsRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const headerImage = await this.uploadMedia(request.headerImage, 'image');
    return await sendButtonMessage(
      this.sock,
      chatId,
      request.buttons,
      request.header,
      headerImage,
      request.body,
      request.footer,
    );
  }

  @Activity()
  async sendList(request: SendListRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const sections = request.sections.map((s) => ({
      title: s.title || '',
      rows: (s.rows || []).map((r) => ({
        title: r.title || '',
        description: r.description || '',
        rowId: r.rowId || randomId(),
      })),
    }));
    const options: any = await this.getMessageOptions(request);
    const data = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            body: { text: request.description || '' },
            header: request.title ? { title: request.title } : undefined,
            nativeFlowMessage: {
              buttons: [
                {
                  name: 'single_select',
                  buttonParamsJson: JSON.stringify({
                    title: request.button || 'Options',
                    sections: sections,
                  }),
                },
              ],
              messageParamsJson: JSON.stringify({}),
            },
          },
        },
      },
    };
    const msg = proto.Message.create(data);
    const fullMessage = generateWAMessageFromContent(chatId, msg, {
      userJid: this.sock?.user?.id,
    });
    await this.sock.relayMessage(chatId, fullMessage.message, {
      messageId: fullMessage.key.id,
    });
    return fullMessage;
  }

  @Activity()
  async sendLocation(request: MessageLocationRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const msg = {
      location: {
        name: request.title || null,
        degreesLatitude: request.latitude,
        degreesLongitude: request.longitude,
      },
    };
    const options = await this.getMessageOptions(request);
    return await this.sock.sendMessage(chatId, msg, options);
  }

  @Activity()
  async forwardMessage(request: MessageForwardRequest): Promise<WAMessage> {
    const key = parseMessageIdSerialized(request.messageId);
    const forwardMessage = await this.store.loadMessage(key.remoteJid, key.id);
    if (!forwardMessage) {
      throw new UnprocessableEntityException(
        `Message with id '${request.messageId}' not found`,
      );
    }
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const message = {
      forward: forwardMessage,
      force: true,
    };
    const options = await this.getMessageOptions(request);
    const result = await this.sock.sendMessage(chatId, message as any, options);
    return this.toWAMessage(result);
  }

  @Activity()
  async sendLinkPreview(request: MessageLinkPreviewRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    const text = request.title ? `${request.title}\n${request.url}` : request.url;
    const msg: any = {
      text: text,
      linkPreview: true,
    };
    const options = await this.getMessageOptions(request);
    return this.sock.sendMessage(chatId, msg, options);
  }

  @Activity()
  async sendSeen(request: SendSeenRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));

    // Build message keys to mark as read
    let messageKeys: any[];
    if (request.messageIds?.length) {
      messageKeys = request.messageIds.map((id) => ({
        key: parseMessageIdSerialized(id),
      }));
    } else if (request.messageId) {
      messageKeys = [{ key: parseMessageIdSerialized(request.messageId) }];
    } else {
      // Fetch recent unread messages from store
      const messages = await this.store.getMessagesByJid(
        chatId,
        { 'filter.fromMe': false },
        { limit: 30, offset: 0, downloadMedia: false, merge: true },
      );
      messageKeys = messages.map((msg) => ({ key: msg.key }));
    }

    if (messageKeys.length === 0) {
      return;
    }

    // Send read
    await this.sock.readMessages(messageKeys);

    // Emit events for our reads
    const updates = messageKeys.map(({ key }) => ({
      key: key,
      update: { status: AckToStatus(WAMessageAck.READ) },
    }));
    this.sock?.ev.emit('messages.update', updates);
  }

  @Activity()
  async startTyping(request: ChatRequest): Promise<void> {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    await this.sock.sendPresenceUpdate('composing', chatId);
  }

  @Activity()
  async stopTyping(request: ChatRequest) {
    const chatId = toJID(this.ensureSuffix(request.chatId));
    return this.sock.sendPresenceUpdate('paused', chatId);
  }

  public async getChatMessages(
    chatId: string,
    query: GetChatMessagesQuery,
    filter: GetChatMessagesFilter,
  ) {
    const downloadMedia = query.downloadMedia;
    const pagination = query as PaginationParams;
    const merge = query.merge ?? true;
    const messages = await this.store.getMessagesByJid(
      toJID(chatId),
      filter,
      pagination,
      merge,
    );

    const promises = [];
    for (const msg of messages) {
      promises.push(this.processIncomingMessage(msg, downloadMedia));
    }
    let result = await Promise.all(promises);
    result = result.filter(Boolean);
    return result;
  }

  @Activity()
  public readChatMessages(
    chatId: string,
    request: ReadChatMessagesQuery,
  ): Promise<ReadChatMessagesResponse> {
    return this.readChatMessagesWSImpl(chatId, request);
  }

  public async getChatMessage(
    chatId: string,
    messageId: string,
    query: GetChatMessageQuery,
  ): Promise<null | WAMessage> {
    const key = parseMessageIdSerialized(messageId, true);
    const merge = query.merge ?? true;
    const message = await this.store.getMessageById(
      toJID(chatId),
      key.id,
      merge,
    );
    if (!message) return null;
    return await this.processIncomingMessage(message, query.downloadMedia);
  }

  @Activity()
  public async pinMessage(
    chatId: string,
    messageId: string,
    duration: PinDuration,
  ): Promise<boolean> {
    const jid = toJID(chatId);
    const key = parseMessageIdSerialized(messageId);
    await this.sock.sendMessage(jid, {
      pin: key,
      type: proto.PinInChat.Type.PIN_FOR_ALL,
      time: duration,
    });
    return true;
  }

  @Activity()
  public async unpinMessage(
    chatId: string,
    messageId: string,
  ): Promise<boolean> {
    const jid = toJID(chatId);
    const key = parseMessageIdSerialized(messageId);
    await this.sock.sendMessage(jid, {
      pin: key,
      type: proto.PinInChat.Type.UNPIN_FOR_ALL,
    });
    return true;
  }

  @Activity()
  async setReaction(request: MessageReactionRequest) {
    const key = parseMessageIdSerialized(request.messageId);
    if (isJidNewsletter(key.remoteJid)) {
      let serverId = Number(key.id);
      if (!serverId) {
        const msg = await this.store.getMessageById(key.remoteJid, key.id);
        if (msg) {
          // @ts-ignore
          serverId = Number(msg.key.server_id);
        }
      }
      if (!serverId) {
        throw new UnprocessableEntityException(
          `Unable to get server id for channel message '${key.id}'`,
        );
      }
      return this.sock.newsletterReactMessage(
        key.remoteJid,
        serverId.toString(),
        request.reaction,
      );
    } else {
      const reactionMessage = {
        react: {
          text: request.reaction,
          key: key,
        },
      };
      return this.sock.sendMessage(key.remoteJid, reactionMessage);
    }
  }

  @Activity()
  async setStar(request: MessageStarRequest) {
    const key = parseMessageIdSerialized(request.messageId);
    await this.sock.chatModify(
      {
        star: {
          messages: [{ id: key.id, fromMe: key.fromMe }],
          star: request.star,
        },
      },
      toJID(request.chatId),
    );
  }

  /**
   * Chats methods
   */

  async getChats(pagination: PaginationParams) {
    const merge = (pagination as GetChatsParams).merge ?? true;
    const chats = await this.store.getChats(pagination, true, undefined, merge);
    // Remove unreadCount, it's not ready yet
    chats.forEach((chat) => delete chat.unreadCount);
    return chats;
  }

  public async getChatsOverview(
    pagination: PaginationParams,
    filter?: OverviewFilter,
  ): Promise<ChatSummary[]> {
    const merge = (pagination as GetChatsOverviewParams).merge ?? true;
    // Convert customer format IDs to JID format if filter is provided
    let jidFilter;
    if (filter?.ids && filter.ids.length > 0) {
      jidFilter = {
        ids: filter.ids.map((id) => toJID(id)),
      };
    }

    const chats = await this.store.getChats(
      pagination,
      false,
      jidFilter,
      merge,
    );
    // Remove unreadCount, it's not ready yet
    chats.forEach((chat) => delete chat.unreadCount);

    // Batch lookup contacts for all chats (fixes N+1)
    const jids = chats.map((chat) => chat.id);
    const contactsMap = await this.store.getContactsByIds(jids);

    const promises = [];
    for (const chat of chats) {
      promises.push(this.fetchChatSummaryBatched(chat, merge, contactsMap));
    }
    const result = await Promise.all(promises);
    return result;
  }

  protected async fetchChatSummaryBatched(
    chat: Chat,
    merge: boolean,
    contactsMap: Map<string, any>,
  ): Promise<ChatSummary> {
    const id = toCusFormat(chat.id);
    let name = chat.name;
    if (!name) {
      // Get name from batch-fetched contacts
      const jid = toJID(chat.id);
      const contact = contactsMap.get(jid);
      name = contact?.name || contact?.notify;
    }
    // Resolve LID to phone number using LID repository
    if (!name && id.endsWith('@lid')) {
      try {
        const pn = await this.store.findPNByLid(chat.id);
        if (pn) name = pn.split('@')[0]; // strip @c.us
      } catch { /* ignore */ }
    }
    const picture = await this.getContactProfilePicture(chat.id, false);
    const lastMessageQuery: GetChatMessagesQuery = {
      limit: 1,
      offset: 0,
      downloadMedia: false,
      merge: merge,
    };
    const messages = await this.getChatMessages(chat.id, lastMessageQuery, {});
    const message = messages.length > 0 ? messages[0] : null;
    return {
      id: id,
      name: name || null,
      picture: picture,
      lastMessage: message,
      _chat: chat,
    };
  }

  @Activity()
  protected async chatsPutArchive(
    chatId: string,
    archive: boolean,
  ): Promise<any> {
    const jid = toJID(chatId);
    const messages = await this.store.getMessagesByJid(jid, {}, { limit: 1 });
    return await this.sock.chatModify(
      { archive: archive, lastMessages: messages },
      jid,
    );
  }

  @Activity()
  public chatsArchiveChat(chatId: string): Promise<any> {
    return this.chatsPutArchive(chatId, true);
  }

  @Activity()
  public chatsUnarchiveChat(chatId: string): Promise<any> {
    return this.chatsPutArchive(chatId, false);
  }

  @Activity()
  public async chatsUnreadChat(chatId: string): Promise<any> {
    const jid = toJID(chatId);
    const messages = await this.store.getMessagesByJid(jid, {}, { limit: 1 });
    return await this.sock.chatModify(
      { markRead: false, lastMessages: messages },
      jid,
    );
  }

  @Activity()
  public async deleteChat(chatId: string): Promise<any> {
    const jid = toJID(chatId);
    const messages = await this.store.getMessagesByJid(jid, {}, { limit: 1 });
    return await this.sock.chatModify(
      { delete: true, lastMessages: messages },
      jid,
    );
  }

  @Activity()
  public async clearMessages(chatId: string): Promise<any> {
    const jid = toJID(chatId);
    return await this.sock.chatModify(
      { clear: 'all' },
      jid,
    );
  }

  /**
   * Labels methods
   */

  public async getLabels(): Promise<Label[]> {
    const labels = await this.store.getLabels();
    return labels.map(this.toLabel);
  }

  @Activity()
  public async createLabel(label: LabelDTO): Promise<Label> {
    const labels = await this.store.getLabels();
    const highestLabelId = lodash.max(
      labels.map((label) => parseInt(label.id)),
    );
    const labelId = highestLabelId ? highestLabelId + 1 : 1;
    const labelAction: LabelActionBody = {
      id: labelId.toString(),
      name: label.name,
      color: label.color,
      deleted: false,
      predefinedId: undefined,
    };
    await this.sock.addLabel(undefined, labelAction);

    return {
      id: labelId.toString(),
      name: label.name,
      color: label.color,
      colorHex:
        typeof label.color === 'number'
          ? `#${label.color.toString(16).padStart(6, '0')}`
          : label.color,
    };
  }

  @Activity()
  public async updateLabel(label: Label): Promise<Label> {
    const labelAction: LabelActionBody = {
      id: label.id,
      name: label.name,
      color: label.color,
      deleted: false,
      predefinedId: undefined,
    };
    await this.sock.addLabel(undefined, labelAction);
    return label;
  }

  @Activity()
  public async deleteLabel(label: Label): Promise<void> {
    const labelAction: LabelActionBody = {
      id: label.id,
      name: label.name,
      color: label.color,
      deleted: true,
      predefinedId: undefined,
    };
    await this.sock.addLabel(undefined, labelAction);
  }

  public async getChatsByLabelId(labelId: string) {
    const chats = await this.store.getChatsByLabelId(labelId);
    // Remove unreadCount, it's not ready yet
    chats.forEach((chat) => delete chat.unreadCount);
    return chats;
  }

  public async getChatLabels(chatId: string): Promise<Label[]> {
    const jid = toJID(chatId);
    const labels = await this.store.getChatLabels(jid);
    return labels.map(this.toLabel);
  }

  @Activity()
  public async putLabelsToChat(chatId: string, labels: LabelID[]) {
    const jid = toJID(chatId);
    const labelsIds = labels.map((label) => label.id);
    const currentLabels = await this.store.getChatLabels(jid);
    const currentLabelsIds = currentLabels.map((label) => label.id);
    const addLabelsIds = lodash.difference(labelsIds, currentLabelsIds);
    const removeLabelsIds = lodash.difference(currentLabelsIds, labelsIds);
    for (const labelId of addLabelsIds) {
      await this.sock.addChatLabel(jid, labelId);
    }
    for (const labelId of removeLabelsIds) {
      await this.sock.removeChatLabel(jid, labelId);
    }
  }

  protected toLabel(label: NOWEBLabel): Label {
    const color = label.color;
    return {
      id: label.id,
      name: label.name,
      color: color,
      colorHex: typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color,
    };
  }

  private async toLabelChatAssociation(
    association: ChatLabelAssociation,
  ): Promise<LabelChatAssociation> {
    const labelData = await this.store.getLabelById(association.labelId);
    const label = labelData ? this.toLabel(labelData) : null;
    return {
      labelId: association.labelId,
      chatId: toCusFormat(association.chatId),
      label: label,
    };
  }

  /**
   * Contacts methods
   */

  @Activity()
  public async upsertContact(chatId: string, body: ContactUpdateBody) {
    const jid = toJID(chatId);
    let fullName = body.firstName;
    if (body.lastName) {
      fullName = `${body.firstName} ${body.lastName}`;
    }
    const action = {
      fullName: fullName,
      firstName: body.firstName,
      saveOnPrimaryAddressbook: true,
    };
    await this.sock.addOrEditContact(jid, action);
    const updates: Partial<Contact>[] = [
      {
        id: jid,
        name: fullName,
      },
    ];
    this.sock.ev.emit('contacts.update', updates);
  }

  async getContact(query: ContactQuery) {
    const jid = toJID(query.contactId);
    const contact = await this.store.getContactById(jid);
    if (!contact) {
      return null;
    }
    return this.toWAContact(contact);
  }

  async getContacts(pagination: PaginationParams) {
    const contacts = await this.store.getContacts(pagination);
    return contacts.map(this.toWAContact);
  }

  @Activity()
  public async fetchContactProfilePicture(id: string) {
    const contact = this.ensureSuffix(id);
    try {
      const url = await this.sock.profilePictureUrl(contact, 'image');
      return url;
    } catch (err) {
      if (err.message == 'item-not-found') {
        return null;
      }
      if (err.message == 'not-authorized') {
        return null;
      }
      throw err;
    }
  }

  public async blockContact(request: ContactRequest) {
    const jid = toJID(this.ensureSuffix(request.contactId));
    await this.sock.updateBlockStatus(jid, 'block');
    return { contact: request.contactId, status: 'blocked' };
  }

  public async unblockContact(request: ContactRequest) {
    const jid = toJID(this.ensureSuffix(request.contactId));
    await this.sock.updateBlockStatus(jid, 'unblock');
    return { contact: request.contactId, status: 'unblocked' };
  }

  @Activity()
  public async getContactAbout(query: ContactQuery): Promise<{ about: string }> {
    const jid = toJID(this.ensureSuffix(query.contactId));
    try {
      const status = await this.sock.fetchStatus(jid);
      return { about: status?.status || '' };
    } catch (err) {
      if (err.message === 'item-not-found' || err.message === 'not-authorized') {
        return { about: '' };
      }
      throw err;
    }
  }

  /**
   * Lid to Phone Number methods
   */
  public async getAllLids(
    pagination: PaginationParams,
  ): Promise<Array<LidToPhoneNumber>> {
    const lids = await this.store.getAllLids(pagination);
    return lids.map((value) => {
      return {
        lid: value.lid,
        pn: toCusFormat(value.pn),
      };
    });
  }

  public async getLidsCount(): Promise<number> {
    return this.store.getLidsCount();
  }

  public async findPNByLid(lid: string): Promise<LidToPhoneNumber> {
    const pn = await this.store.findPNByLid(lid);
    return {
      lid: lid,
      pn: pn ? toCusFormat(pn) : null,
    };
  }

  public async findLIDByPhoneNumber(
    phoneNumber: string,
  ): Promise<LidToPhoneNumber> {
    const pn = toJID(phoneNumber);
    const lid = await this.store.findLidByPN(pn);
    return {
      lid: lid || null,
      pn: toCusFormat(pn),
    };
  }

  /**
   * Group methods
   */
  @Activity()
  public createGroup(request: CreateGroupRequest) {
    const participants = request.participants.map(getId);
    return this.sock.groupCreate(request.name, participants);
  }

  @Activity()
  public joinGroup(code: string) {
    return this.sock.groupAcceptInvite(code);
  }

  @Activity()
  public joinInfoGroup(code: string) {
    return this.sock.groupGetInviteInfo(code);
  }

  public async getGroups(pagination: PaginationParams) {
    const groups = await this.store.getGroups(pagination);
    // return {id: group} mapping for backward compatability
    return lodash.keyBy(groups, 'id');
  }

  protected removeGroupsFieldParticipant(group: any) {
    delete group.participants;
  }

  @Activity()
  public async refreshGroups(): Promise<boolean> {
    this.store.resetGroupsCache();
    await this.store.getGroups({});
    return true;
  }

  public async getGroup(id) {
    // Try direct lookup first (O(1) instead of loading all groups)
    const group = await this.store.getGroupById(id);
    if (group) {
      return group;
    }

    // Fallback to full list for in-memory store
    const groups = await this.getGroups({});
    const groupFromList = groups[id];
    if (!groupFromList) {
      throw new Error(`Group with id '${id}' not found`);
    }
    return groupFromList;
  }

  public async getGroupParticipants(id: string): Promise<GroupParticipant[]> {
    const group = (await this.getGroup(id)) as GroupMetadata;
    if (!group?.participants?.length) {
      return [];
    }
    return group.participants.map(ToGroupParticipant);
  }

  @Activity()
  public async deleteGroup(id: string) {
    const jid = toJID(this.ensureSuffix(id));
    await this.sock.groupLeave(jid);
    await this.store.deleteGroupById(jid);
    return { id: jid, deleted: true };
  }

  @Activity()
  protected async setGroupPicture(id: string, file: any): Promise<boolean> {
    const jid = toJID(this.ensureSuffix(id));
    // Baileys updateProfilePicture works for groups too
    await this.sock.updateProfilePicture(jid, file);
    return true;
  }

  @Activity()
  protected async deleteGroupPicture(id: string): Promise<boolean> {
    const jid = toJID(this.ensureSuffix(id));
    await this.sock.updateProfilePicture(jid, null);
    return true;
  }

  public async getInfoAdminsOnly(id): Promise<SettingsSecurityChangeInfo> {
    const group = await this.getGroup(id);
    return { adminsOnly: group.restrict };
  }

  @Activity()
  public async setInfoAdminsOnly(id, value) {
    const setting = value ? 'locked' : 'unlocked';
    return await this.sock.groupSettingUpdate(id, setting);
  }

  public async getMessagesAdminsOnly(id): Promise<SettingsSecurityChangeInfo> {
    const group = await this.getGroup(id);
    return { adminsOnly: group.announce };
  }

  @Activity()
  public async setMessagesAdminsOnly(id, value) {
    const setting = value ? 'announcement' : 'not_announcement';
    return await this.sock.groupSettingUpdate(id, setting);
  }

  @Activity()
  public async leaveGroup(id) {
    return this.sock.groupLeave(id);
  }

  @Activity()
  public async setDescription(id, description) {
    return this.sock.groupUpdateDescription(id, description);
  }

  @Activity()
  public async setSubject(id, subject) {
    return this.sock.groupUpdateSubject(id, subject);
  }

  @Activity()
  public async getInviteCode(id): Promise<string> {
    return this.sock.groupInviteCode(id);
  }

  @Activity()
  public async revokeInviteCode(id): Promise<string> {
    await this.sock.groupRevokeInvite(id);
    return this.sock.groupInviteCode(id);
  }

  public async getParticipants(id) {
    const groups = await this.sock.groupFetchAllParticipating();
    return groups[id].participants;
  }

  @Activity()
  public async addParticipants(id, request: ParticipantsRequest) {
    const participants = request.participants.map(getId);
    return this.sock.groupParticipantsUpdate(id, participants, 'add');
  }

  @Activity()
  public async removeParticipants(id, request: ParticipantsRequest) {
    const participants = request.participants.map(getId);
    return this.sock.groupParticipantsUpdate(id, participants, 'remove');
  }

  @Activity()
  public async promoteParticipantsToAdmin(id, request: ParticipantsRequest) {
    const participants = request.participants.map(getId);
    return this.sock.groupParticipantsUpdate(id, participants, 'promote');
  }

  @Activity()
  public async demoteParticipantsToUser(id, request: ParticipantsRequest) {
    const participants = request.participants.map(getId);
    return this.sock.groupParticipantsUpdate(id, participants, 'demote');
  }

  public async setPresence(presence: WAHAPresenceStatus, chatId?: string) {
    switch (presence) {
      case WAHAPresenceStatus.TYPING:
      case WAHAPresenceStatus.RECORDING:
      case WAHAPresenceStatus.PAUSED:
        await this.maintainPresenceOnline();
    }
    const enginePresence = ToEnginePresenceStatus[presence];
    if (!enginePresence) {
      throw new NotImplementedByEngineError(
        `NOWEB engine doesn't support '${presence}' presence.`,
      );
    }
    if (chatId) {
      chatId = toJID(this.ensureSuffix(chatId));
    }
    await this.sock.sendPresenceUpdate(enginePresence, chatId);
    this.presence = presence;
  }

  public async getPresences(): Promise<WAHAChatPresences[]> {
    const result: WAHAChatPresences[] = [];
    for (const remoteJid in this.store.presences) {
      const storedPresences = this.store.presences[remoteJid];
      result.push(this.toWahaPresences(remoteJid, storedPresences));
    }
    return result;
  }

  public async getPresence(chatId: string): Promise<WAHAChatPresences> {
    const jid = toJID(chatId);
    await this.subscribePresence(jid);
    if (!(jid in this.store.presences)) {
      this.store.presences[jid] = {};
      await sleep(1000);
    }
    const result = this.store.presences[jid];
    return this.toWahaPresences(jid, result);
  }

  @Activity()
  public subscribePresence(id: string): Promise<void> {
    const jid = toJID(id);
    return this.sock.presenceSubscribe(jid);
  }

  /**
   * Status methods
   */
  @Activity()
  public async sendStatusMessage(
    message: any,
    options: any,
    jids: string[],
    batchSize?: number,
  ) {
    if (!batchSize || batchSize == 0) {
      batchSize = 5_000;
    }
    const chunks = lodash.chunk(jids, batchSize);
    if (chunks.length == 0) {
      throw new UnprocessableEntityException('No participants to send status');
    }

    const logger = this.logger.child({
      'message.id': options.messageId,
      chunks: chunks.length,
      size: batchSize,
    });
    logger.info(`Sending status message to ${jids.length} participants`);
    let result = null;
    for (const [index, participants] of chunks.entries()) {
      const batchOptions = { ...options };
      batchOptions.statusJidList = participants;
      const r = await this.sendStatusMessageOneChunk(
        message,
        batchOptions,
        logger,
        index,
      );
      result = result || r;
    }
    logger.info(
      `Sending status message to ${jids.length} participants - success`,
    );
    return result;
  }

  private async sendStatusMessageOneChunk(
    message: any,
    options: any,
    logger: any,
    index: number,
  ) {
    // https://github.com/IndigoUnited/node-promise-retry
    const retryOptions = {
      retries: 5,
      minTimeout: 1000,
      maxTimeout: 6000,
    };
    try {
      const resp = await promiseRetry((retry, number) => {
        return this.sock
          .sendMessage(BROADCAST_ID, message, options)
          .catch(retry);
      }, retryOptions);
      logger.info(`Sending status message (${index + 1} chunk) - success`);
      return resp;
    } catch (err) {
      logger.error(`Sending status message (${index + 1} chunk - failed`);
      logger.error(err, err.stack);
      throw err;
    }
  }

  @Activity()
  public async sendTextStatus(status: TextStatus) {
    const message = {
      text: status.text,
      linkPreview: this.getLinkPreview(status),
    };
    const jids = await this.prepareJidsForStatus(status.contacts);
    if (!status.id) {
      this.upsertMeInJIDs(jids);
    }
    const messageId = this.prepareMessageIdForStatus(status);
    const options: MiscMessageGenerationOptions = {
      backgroundColor: status.backgroundColor,
      font: status.font,
      linkPreviewHighQuality: status.linkPreviewHighQuality,
      messageId: messageId,
    };
    return await this.sendStatusMessage(
      message,
      options,
      jids,
      status.contacts?.length,
    );
  }

  @Activity()
  public async sendImageStatus(status: ImageStatus) {
    const message = {
      image: { url: status.file },
      caption: status.caption,
    };
    const jids = await this.prepareJidsForStatus(status.contacts);
    if (!status.id) {
      this.upsertMeInJIDs(jids);
    }
    const messageId = this.prepareMessageIdForStatus(status);
    const options: any = {
      messageId: messageId,
    };
    return await this.sendStatusMessage(
      message,
      options,
      jids,
      status.contacts?.length,
    );
  }

  @Activity()
  public async sendVoiceStatus(status: VoiceStatus) {
    const message = {
      audio: { url: status.file },
      ptt: status.convert !== false,
    };
    const jids = await this.prepareJidsForStatus(status.contacts);
    if (!status.id) {
      this.upsertMeInJIDs(jids);
    }
    const messageId = this.prepareMessageIdForStatus(status);
    const options: any = {
      messageId: messageId,
    };
    return await this.sendStatusMessage(
      message,
      options,
      jids,
      status.contacts?.length,
    );
  }

  @Activity()
  public async sendVideoStatus(status: VideoStatus) {
    const message = {
      video: { url: status.file },
      caption: status.caption,
    };
    const jids = await this.prepareJidsForStatus(status.contacts);
    if (!status.id) {
      this.upsertMeInJIDs(jids);
    }
    const messageId = this.prepareMessageIdForStatus(status);
    const options: any = {
      messageId: messageId,
    };
    return await this.sendStatusMessage(
      message,
      options,
      jids,
      status.contacts?.length,
    );
  }

  protected prepareMessageIdForStatus(status: StatusRequest) {
    if (status.id) {
      this.saveSentMessageId(status.id);
      return status.id;
    }
    return this.generateMessageID();
  }

  protected async prepareJidsForStatus(contacts: string[]) {
    let jids: string[];
    if (contacts?.length > 0) {
      jids = contacts.map(toJID);
    } else {
      jids = await this.fetchMyContactsJids();
    }
    return jids;
  }

  protected async fetchMyContactsJids() {
    const contacts = await this.store.getContacts({});
    const jids = contacts.map((contact) => contact.id);
    return jids.filter((jid) => jid.endsWith('@s.whatsapp.net'));
  }

  @Activity()
  public async deleteStatus(request: DeleteStatusRequest) {
    const messageId = request.id;
    const key = parseMessageIdSerialized(messageId, true);
    key.fromMe = true;
    key.remoteJid = BROADCAST_ID;
    const jids = await this.prepareJidsForStatus(request.contacts);
    this.upsertMeInJIDs(jids);
    const newMessageId = this.generateMessageID();
    const options = {
      statusJidList: jids,
      messageId: newMessageId,
    };
    return await this.sendStatusMessage(
      { delete: key },
      options,
      jids,
      request.contacts?.length,
    );
  }

  protected upsertMeInJIDs(jids: string[]) {
    if (!this.sock?.authState?.creds?.me) {
      return;
    }
    const myJID = jidNormalizedUser(this.sock.authState.creds.me.id);
    if (!jids.includes(myJID)) {
      // insert my jid first
      jids.unshift(myJID);
    }
  }

  /**
   * Channels methods
   */
  public searchChannelsByView(
    query: ChannelSearchByView,
  ): Promise<ChannelListResult> {
    throw new AvailableInPlusVersion();
  }

  public searchChannelsByText(
    query: ChannelSearchByText,
  ): Promise<ChannelListResult> {
    throw new AvailableInPlusVersion();
  }

  public async previewChannelMessages(
    inviteCode: string,
    query: PreviewChannelMessages,
  ): Promise<ChannelMessage[]> {
    throw new AvailableInPlusVersion();
  }

  protected toChannel(newsletter: NOWEBNewsletterMetadata): Channel {
    const role =
      newsletter.viewer_metadata?.role ||
      (newsletter.viewer_metadata?.view_role as ChannelRole) ||
      ChannelRole.GUEST;
    const preview = newsletter.preview
      ? getPublicUrlFromDirectPath(newsletter.preview)
      : null;
    const picture = newsletter.picture
      ? getPublicUrlFromDirectPath(newsletter.picture)
      : null;
    return {
      id: newsletter.id,
      name: newsletter.name,
      description: newsletter.description,
      invite: getChannelInviteLink(newsletter.invite),
      preview: preview || picture,
      picture: picture || preview,
      verified: newsletter.verification === 'VERIFIED',
      role: role,
      subscribersCount: newsletter.subscribers,
    };
  }

  public async channelsList(query: ListChannelsQuery): Promise<Channel[]> {
    throw new NotImplementedByEngineError(
      'channelsList',
      this.engine,
      "NOWEB engine doesn't support listing channels. The method is not implemented by 'NOWEB' engine. Check the docs and try another engine: https://waha.devlike.pro/",
    );
  }

  @Activity()
  public async channelsCreateChannel(request: CreateChannelRequest) {
    const newsletter = await this.sock.newsletterCreate(
      request.name,
      request.description,
    );
    return this.toChannel(toNewsletterMetadata(newsletter));
  }

  public async channelsGetChannel(id: string) {
    const newsletter = await this.sock.newsletterMetadata('jid', id);
    return this.toChannel(toNewsletterMetadata(newsletter));
  }

  @Activity()
  public async channelsGetChannelByInviteCode(inviteCode: string) {
    const newsletter = await this.sock.newsletterMetadata('invite', inviteCode);
    return this.toChannel(toNewsletterMetadata(newsletter));
  }

  @Activity()
  public async channelsDeleteChannel(id: string) {
    return await this.sock.newsletterDelete(id);
  }

  @Activity()
  public async channelsFollowChannel(id: string): Promise<any> {
    return await this.sock.newsletterFollow(id);
  }

  @Activity()
  public async channelsUnfollowChannel(id: string): Promise<any> {
    return await this.sock.newsletterUnfollow(id);
  }

  @Activity()
  public async channelsMuteChannel(id: string): Promise<any> {
    return await this.sock.newsletterMute(id);
  }

  @Activity()
  public async channelsUnmuteChannel(id: string): Promise<any> {
    return await this.sock.newsletterUnmute(id);
  }

  subscribeEngineEvents2() {
    //
    // All
    //
    const all$ = new Observable<EnginePayload>((subscriber) => {
      return this.sock.ev.process((events) => {
        // iterate over keys
        for (const event in events) {
          const data = events[event];
          subscriber.next({ event: event, data: data });
        }
      });
    });
    this.events2.get(WAHAEvents.ENGINE_EVENT).switch(all$);

    //
    // Messages
    //
    const messagesUpsert$ = fromEvent(this.sock.ev, 'messages.upsert').pipe(
      map((event: BaileysEventMap['messages.upsert']) => event.messages),
      mergeAll(),
      filter((msg) => this.jids.include(msg.key.remoteJid)),
      share(),
    );
    let [messagesFromMe$, messagesFromOthers$] = partition(
      messagesUpsert$,
      isMine,
    );
    messagesFromMe$ = messagesFromMe$.pipe(
      mergeMap((msg) => this.processIncomingMessage(msg, true)),
      filter(Boolean),
      DistinctMessages(),
      share(), // share it so we don't process twice in message.any
    );
    messagesFromOthers$ = messagesFromOthers$.pipe(
      mergeMap((msg) => this.processIncomingMessage(msg, true)),
      filter(Boolean),
      DistinctMessages(),
      share(), // share it so we don't process twice in message.any
    );
    const messagesFromAll$ = merge(messagesFromMe$, messagesFromOthers$);
    this.events2.get(WAHAEvents.MESSAGE).switch(messagesFromOthers$);
    this.events2.get(WAHAEvents.MESSAGE_ANY).switch(messagesFromAll$);

    const messagesRevoked$ = messagesUpsert$.pipe(
      // @ts-ignore
      filter(
        (message) =>
          message.message?.protocolMessage?.type ===
          proto.Message.ProtocolMessage.Type.REVOKE,
      ),
      mergeMap(async (message): Promise<WAMessageRevokedBody> => {
        const afterMessage = this.toWAMessage(message);
        // Extract the revoked message ID from protocolMessage.key
        const revokedMessageId = message.message.protocolMessage.key?.id;
        return {
          after: afterMessage,
          before: null,
          revokedMessageId: revokedMessageId,
          _data: message,
        };
      }),
    );
    this.events2.get(WAHAEvents.MESSAGE_REVOKED).switch(messagesRevoked$);

    // Handle edited messages
    const messagesEdited$ = messagesUpsert$.pipe(
      filter(
        (message) =>
          IsEditedMessage(message.message) ||
          IsSecretEncryptedMessageEdit(message.message),
      ),
      mergeMap(async (message): Promise<WAMessageEditedBody> => {
        const waMessage = this.toWAMessage(message);
        let body = '';
        let editedMessageId: string | undefined;
        if (IsEditedMessage(message.message)) {
          const content = normalizeMessageContent(message.message);
          body = extractBody(content.protocolMessage.editedMessage) || '';
          editedMessageId = content.protocolMessage.key?.id;
        } else if (IsSecretEncryptedMessageEdit(message.message)) {
          const sem = message.message.secretEncryptedMessage;
          editedMessageId = sem.targetMessageKey?.id;
          body =
            (await this.tryDecryptNOWEBSecretMessageEdit(message, sem)) || '';
        }
        return {
          ...waMessage,
          body: body,
          editedMessageId: editedMessageId,
          _data: message,
        };
      }),
    );
    this.events2.get(WAHAEvents.MESSAGE_EDITED).switch(messagesEdited$);

    //
    // Message Reactions
    //
    const messageReactions$ = messagesUpsert$.pipe(
      map(this.processMessageReaction.bind(this)),
      filter(Boolean),
    );
    this.events2.get(WAHAEvents.MESSAGE_REACTION).switch(messageReactions$);

    //
    // Message Ack
    //
    const messageUpdates$: Observable<WAMessageUpdate> = fromEvent(
      this.sock.ev,
      'messages.update',
    ).pipe(
      // @ts-ignore
      mergeAll(),
      filter((update) => this.jids.include(update.key.remoteJid)),
      share(),
    );
    const messageAckDirect$ = messageUpdates$.pipe(
      filter(isMine), // ack comes only for MY messages
      filter(isAckUpdateMessageEvent),
      map(this.convertMessageUpdateToMessageAck.bind(this)),
    );
    const messageReceiptUpdate$: Observable<MessageUserReceiptUpdate> =
      fromEvent(this.sock.ev, 'message-receipt.update').pipe(
        // @ts-ignore
        mergeAll(),
        filter((update) => this.jids.include(update.key.remoteJid)),
        share(),
      );

    const messageAckGroups$ = messageReceiptUpdate$.pipe(
      filter(isMine), // ack comes only for MY messages
      map(this.convertMessageReceiptUpdateToMessageAck.bind(this)),
    );
    const messageAckDirectFinal$ = messageAckDirect$.pipe(DistinctAck());
    const messageAckGroupsFinal$ = messageAckGroups$.pipe(DistinctAck());

    this.events2.get(WAHAEvents.MESSAGE_ACK).switch(messageAckDirectFinal$);
    this.events2
      .get(WAHAEvents.MESSAGE_ACK_GROUP)
      .switch(messageAckGroupsFinal$);

    //
    // Other
    //
    this.events2
      .get(WAHAEvents.STATE_CHANGE)
      .switch(fromEvent(this.sock.ev, 'connection.update').pipe(share()));

    const groupsUpsert$: Observable<GroupMetadata> = fromEvent(
      this.sock.ev,
      'groups.upsert',
    ).pipe(
      // @ts-ignore
      mergeAll(),
      share(),
    );
    const groupsUpdate$: Observable<Partial<GroupMetadata>> = fromEvent(
      this.sock.ev,
      'groups.update',
    ).pipe(
      // @ts-ignore
      mergeAll(),
      share(),
    );
    const groupsParticipantsUpdate$: Observable<any> = fromEvent(
      this.sock.ev,
      'group-participants.update',
    ).pipe(share());

    this.events2.get(WAHAEvents.GROUP_JOIN).switch(groupsUpsert$);

    const groupV2Join$ = groupsUpsert$.pipe(
      map((group) => ToGroupV2JoinEvent(group)),
    );
    this.events2.get(WAHAEvents.GROUP_V2_JOIN).switch(groupV2Join$);

    const groupV2Update$ = merge(groupsUpdate$).pipe(map(ToGroupV2UpdateEvent));
    this.events2.get(WAHAEvents.GROUP_V2_UPDATE).switch(groupV2Update$);

    const groupV2Participants$ = groupsParticipantsUpdate$.pipe(
      map(ToGroupV2Participants),
    );
    this.events2
      .get(WAHAEvents.GROUP_V2_PARTICIPANTS)
      .switch(groupV2Participants$);

    const groupV2Leave$ = groupsParticipantsUpdate$.pipe(
      map((group) =>
        ToGroupV2LeaveEvent(this.sock?.authState?.creds?.me, group),
      ),
      filter(Boolean),
    );
    this.events2.get(WAHAEvents.GROUP_V2_LEAVE).switch(groupV2Leave$);

    this.events2.get(WAHAEvents.PRESENCE_UPDATE).switch(
      fromEvent(this.sock.ev, 'presence.update').pipe(
        filter((presence: any) => this.jids.include(presence.id)),
        map((data: any) => this.toWahaPresences(data.id, data.presences)),
        share(),
      ),
    );

    //
    // Poll votes
    //
    this.events2
      .get(WAHAEvents.POLL_VOTE)
      .switch(
        messageUpdates$.pipe(
          mergeMap(this.handleMessagesUpdatePollVote.bind(this)),
          filter(Boolean),
        ),
      );
    this.events2
      .get(WAHAEvents.POLL_VOTE_FAILED)
      .switch(
        messagesUpsert$.pipe(
          mergeMap(this.handleMessageUpsertPollVoteFailed.bind(this)),
          filter(Boolean),
        ),
      );

    //
    // Calls
    //
    // @ts-ignore
    const calls$: Observable<WACallEvent[]> = fromEvent(this.sock.ev, 'call');
    const call$ = calls$.pipe(
      mergeMap(identity),
      filter((call: WACallEvent) =>
        this.jids.include(call.groupJid || call.chatId),
      ),
      share(),
    );

    const acceptedCallIds = new Set<string>();
    this.events2.get(WAHAEvents.CALL_RECEIVED).switch(
      call$.pipe(
        filter((call: WACallEvent) => call.status === 'offer'),
        map(this.toCallData.bind(this)),
      ),
    );
    this.events2.get(WAHAEvents.CALL_ACCEPTED).switch(
      call$.pipe(
        filter((call: WACallEvent) => call.status === 'accept'),
        tap((call: WACallEvent) => acceptedCallIds.add(call.id)),
        map(this.toCallData.bind(this)),
      ),
    );
    this.events2.get(WAHAEvents.CALL_REJECTED).switch(
      call$.pipe(
        filter(
          (call: WACallEvent) =>
            call.status === 'reject' || call.status === 'terminate',
        ),
        // Skip rejections when the call was accepted earlier (local or other device)
        exclude((call: WACallEvent) => {
          const shouldSkip = acceptedCallIds.has(call.id);
          if (call.status === 'terminate') {
            acceptedCallIds.delete(call.id);
          }
          return shouldSkip;
        }),
        // We get two "reject" events, one with null isGroup property, ignore it
        exclude((call: WACallEvent) => call.isGroup == null),
        groupBy((call: WACallEvent) => call.id || 'unknown'),
        mergeMap((group$) =>
          group$.pipe(
            debounceTime(1_000),
            tap((call: WACallEvent) => acceptedCallIds.delete(call.id)),
          ),
        ),
        map(this.toCallData.bind(this)),
      ),
    );

    //
    // Labels
    //
    // @ts-ignore
    const labelsEdit$: Observable<NOWEBLabel> = fromEvent(
      this.sock.ev,
      'labels.edit',
    ).pipe(share());
    this.events2.get(WAHAEvents.LABEL_UPSERT).switch(
      labelsEdit$.pipe(
        exclude((data: NOWEBLabel) => data.deleted),
        map(this.toLabel.bind(this)),
      ),
    );
    this.events2.get(WAHAEvents.LABEL_DELETED).switch(
      labelsEdit$.pipe(
        filter((data: NOWEBLabel) => data.deleted),
        map(this.toLabel.bind(this)),
      ),
    );
    const labelsAssociation$ = fromEvent(
      this.sock.ev,
      'labels.association',
    ).pipe(share());
    const labelsAssociationAdd$: Observable<ChatLabelAssociation> =
      labelsAssociation$.pipe(
        filter(({ type }: any) => type === 'add'),
        map((data) => data.association),
        filter(
          (association: any) => association.type === LabelAssociationType.Chat,
        ),
      );

    const labelsAssociationRemove$: Observable<ChatLabelAssociation> =
      labelsAssociation$.pipe(
        filter(({ type }: any) => type === 'remove'),
        map((data) => data.association),
        filter(
          (association: any) => association.type === LabelAssociationType.Chat,
        ),
      );
    this.events2
      .get(WAHAEvents.LABEL_CHAT_ADDED)
      .switch(
        labelsAssociationAdd$.pipe(
          mergeMap(this.toLabelChatAssociation.bind(this)),
        ),
      );
    this.events2
      .get(WAHAEvents.LABEL_CHAT_DELETED)
      .switch(
        labelsAssociationRemove$.pipe(
          mergeMap(this.toLabelChatAssociation.bind(this)),
        ),
      );
  }

  protected listenContactsUpdatePictureProfile() {
    this.sock.ev.on('contacts.update', async (updates) => {
      for (const update of updates) {
        if (update.imgUrl !== 'changed') {
          continue;
        }

        this.logger.debug({ jid: update.id }, 'Profile picture updated');
        const url = await this.refreshProfilePicture(update.id);
        if (isPnUser(update.id) || isLidUser(update.id)) {
          // update 123@c.us and 123 profiles as well
          const cus = toCusFormat(update.id);
          this.profilePictures.set(cus, url);
          const phone = update.id.split('@')[0];
          this.profilePictures.set(phone, url);
        }
      }
    });
  }

  /**
   * END - Methods for API
   */

  private processMessageReaction(message): WAMessageReaction | null {
    if (!message) return null;
    if (!message.message) return null;
    if (!message.message.reactionMessage) return null;

    const id = buildMessageId(message.key);
    const fromToParticipant = getFromToParticipant(message.key);
    const reactionMessage = message.message.reactionMessage;
    const messageId = buildMessageId(reactionMessage.key);
    const source = this.getMessageSource(message.key.id);
    const reaction: WAMessageReaction = {
      id: id,
      timestamp: ensureNumber(message.messageTimestamp),
      from: toCusFormat(fromToParticipant.from),
      fromMe: message.key.fromMe,
      source: source,
      to: toCusFormat(fromToParticipant.to),
      participant: toCusFormat(fromToParticipant.participant),
      reaction: {
        text: reactionMessage.text,
        messageId: messageId,
      },
    };
    return reaction;
  }

  shouldProcessIncomingMessage(message): boolean {
    // if there is no text or media message
    if (!message) return;
    // View-once (self-destructing) messages arrive with key.isViewOnce=true but
    // no message content (burned by sender). Allow them through so a webhook
    // is still fired with key/timestamp metadata.
    if (!message.message && !message.key?.isViewOnce) return;
    // Ignore reactions, we have dedicated handler for that
    if (message.message?.reactionMessage) return;
    // Ignore poll votes, we have dedicated handler for that
    if (message.message?.pollUpdateMessage) return;
    // Ignore calls, we have dedicated handler for that
    if (message.message?.call?.callKey) return;
    // Ignore revoke, we have a dedicated event for that
    if (
      message.message?.protocolMessage?.type ===
      proto.Message.ProtocolMessage.Type.REVOKE
    )
      return;
    // Ignore edit, we have a dedicated event for that
    if (IsEditedMessage(message.message)) return;
    // Ignore secret-encrypted message edits (mobile app format), dedicated handler routes them
    if (IsSecretEncryptedMessageEdit(message.message)) return;

    // Ignore history sync notifications
    if (IsHistorySyncNotification(message.message)) return;

    if (
      message.message?.protocolMessage?.type ===
      proto.Message.ProtocolMessage.Type.EPHEMERAL_SYNC_RESPONSE
    )
      return;
    if (
      message.message?.protocolMessage?.type ===
      proto.Message.ProtocolMessage.Type
        .PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE
    )
      return;

    const normalizedContent = normalizeMessageContent(message.message);
    const contentType = getContentType(normalizedContent);
    // Ignore device sent message
    if (contentType == 'deviceSentMessage') {
      return;
    }
    const hasSomeContent = !!contentType;
    if (!hasSomeContent) {
      // Ignore key distribution messages
      if (message?.message?.senderKeyDistributionMessage) return;
    }
    return true;
  }

  protected async tryDecryptNOWEBSecretMessageEdit(
    editMessage: proto.IWebMessageInfo,
    sem: proto.Message.ISecretEncryptedMessage,
  ): Promise<string> {
    const targetKey = sem.targetMessageKey;
    const origMsgId = targetKey?.id;
    if (!origMsgId) {
      return '';
    }
    const jidsToTry = [targetKey.remoteJid, editMessage.key?.remoteJid].filter(
      Boolean,
    );
    let stored: proto.IWebMessageInfo | undefined;
    for (const jid of jidsToTry) {
      stored = await this.store?.loadMessage(jid, origMsgId);
      if (stored) {
        break;
      }
    }
    if (!stored) {
      this.logger.debug(
        { origMsgId: origMsgId },
        'NOWEB message edit decrypt: original message not found in store',
      );
      return '';
    }
    const secretBytes =
      normalizeMessageContent(stored.message)?.messageContextInfo
        ?.messageSecret ?? stored.message?.messageContextInfo?.messageSecret;
    if (!secretBytes || secretBytes.length !== 32) {
      this.logger.debug(
        { origMsgId: origMsgId },
        'NOWEB message edit decrypt: missing messageSecret on original',
      );
      return '';
    }
    const origSecret = Buffer.from(secretBytes);
    const encPayload = sem.encPayload ? Buffer.from(sem.encPayload) : null;
    const encIv = sem.encIv ? Buffer.from(sem.encIv) : null;
    if (!encPayload || !encIv) {
      return '';
    }
    const editInfo = {
      Chat: editMessage.key?.remoteJid,
      Sender:
        editMessage.key?.participant ||
        (editMessage.key?.fromMe ? undefined : editMessage.key?.remoteJid),
    };
    const modificationSenderJid = jidToNonAD(editInfo.Sender || '');
    const primaryOrig = getOrigSenderJidForMsgSecret(editInfo, {
      fromMe: targetKey.fromMe,
      remoteJID: targetKey.remoteJid,
      participant: targetKey.participant,
    });
    const candidates: string[] = [primaryOrig];
    const remoteNonAD = targetKey.remoteJid
      ? jidToNonAD(targetKey.remoteJid)
      : '';
    if (remoteNonAD && !candidates.includes(remoteNonAD)) {
      candidates.push(remoteNonAD);
    }
    const participantNonAD = targetKey.participant
      ? jidToNonAD(targetKey.participant)
      : '';
    if (participantNonAD && !candidates.includes(participantNonAD)) {
      candidates.push(participantNonAD);
    }
    let lastErr: unknown;
    for (const origSenderJid of candidates) {
      try {
        const decoded = decryptSecretEncryptedMessageEditProto({
          encPayload: encPayload,
          encIv: encIv,
          origMsgId: origMsgId,
          origSenderJid: origSenderJid,
          modificationSenderJid: modificationSenderJid,
          origMsgSecret: origSecret,
        });
        const text = extractBody(decoded) || '';
        if (text) {
          return text;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    this.logger.debug(
      { err: lastErr, origMsgId: origMsgId, candidates: candidates },
      'NOWEB message edit decrypt: AES-GCM or protobuf decode failed',
    );
    return '';
  }

  protected async processIncomingMessage(
    message,
    downloadMedia: boolean,
  ): Promise<WAMessage | null> {
    // Filter
    if (!this.shouldProcessIncomingMessage(message)) {
      return null;
    }
    // Convert
    const wamessage = this.toWAMessageSafe(message);
    if (!wamessage) {
      return null;
    }
    // Media
    if (downloadMedia && wamessage.hasMedia) {
      wamessage.media = await this.downloadMediaSafe(message);
    }

    if (downloadMedia && wamessage.replyTo?.hasMedia) {
      const mediaContent = extractMediaContent(wamessage.replyTo._data);
      const m = {
        message: wamessage.replyTo._data,
        key: {
          id:
            wamessage.replyTo.id ||
            mediaContent.fileSha256 ||
            mediaContent.fileEncSha256 ||
            mediaContent.mediaKeyTimestamp,
          remoteJid: message.key.remoteJid,
        },
      };
      wamessage.replyTo.media = await this.downloadMediaSafe(m);
    }
    return wamessage;
  }

  protected toWAMessageSafe(message): WAMessage | null {
    try {
      return this.toWAMessage(message);
    } catch (error) {
      this.logger.error('Failed to process incoming message');
      this.logger.error(error);
      return null;
    }
  }

  protected toWAMessage(message): WAMessage {
    const fromToParticipant = getFromToParticipant(message.key);
    const id = buildMessageId(message.key);
    const body = extractBody(message.message);
    const replyTo = this.extractReplyTo(message.message);
    const ack = message.ack || StatusToAck(message.status);
    const mediaContent = extractMediaContent(message.message);
    const source = this.getMessageSource(message.key.id);
    const waproto = message.message;
    return {
      id: id,
      timestamp: ensureNumber(message.messageTimestamp),
      from: toCusFormat(fromToParticipant.from),
      fromMe: message.key.fromMe,
      source: source,
      body: body || null,
      to: toCusFormat(fromToParticipant.to),
      participant: toCusFormat(fromToParticipant.participant),
      // Media
      hasMedia: Boolean(mediaContent),
      media: null,
      mediaUrl: message.media?.url,
      // @ts-ignore
      ack: ack,
      // @ts-ignore
      ackName: WAMessageAck[ack] || ACK_UNKNOWN,
      location: extractWALocation(waproto),
      vCards: extractVCards(waproto),
      replyTo: replyTo,
      reactions: message.reactions || [],
      _data: message,
    };
  }

  protected extractReplyTo(message): ReplyToMessage | null {
    if (!message) return null;
    const msgType = getContentType(message);
    const contextInfo = message[msgType]?.contextInfo;
    if (!contextInfo) {
      return null;
    }
    const quotedMessage = contextInfo.quotedMessage;
    if (!quotedMessage) {
      return null;
    }
    const body = extractBody(quotedMessage);
    const mediaContent = extractMediaContent(quotedMessage);
    return {
      id: contextInfo.stanzaId,
      participant: toCusFormat(contextInfo.participant),
      body: body,
      // Media
      hasMedia: Boolean(mediaContent),
      media: null,
      // Data
      _data: quotedMessage,
    };
  }

  protected toWAContact(contact: Contact) {
    contact.id = toCusFormat(contact.id);
    // @ts-ignore
    contact.pushname = contact.notify;
    // @ts-ignore
    delete contact.notify;
    return contact;
  }

  protected convertMessageUpdateToMessageAck(event): WAMessageAckBody {
    const message = event;
    const fromToParticipant = getFromToParticipant(message.key);
    const id = buildMessageId(message.key);
    const ack = StatusToAck(message.update.status);
    const body: WAMessageAckBody = {
      id: id,
      from: toCusFormat(fromToParticipant.from),
      to: toCusFormat(fromToParticipant.to),
      participant: toCusFormat(fromToParticipant.participant),
      fromMe: message.key.fromMe,
      ack: ack,
      ackName: WAMessageAck[ack] || ACK_UNKNOWN,
    };
    return body;
  }

  protected convertMessageReceiptUpdateToMessageAck(event): WAMessageAckBody {
    const fromToParticipant = getFromToParticipant(event.key);

    const receipt = event.receipt;
    let ack;
    if (receipt.receiptTimestamp) {
      ack = WAMessageAck.SERVER;
    } else if (receipt.playedTimestamp) {
      ack = WAMessageAck.PLAYED;
    } else if (receipt.readTimestamp) {
      ack = WAMessageAck.READ;
    }

    const key = { ...event.key };
    if (key.fromMe) {
      key.participant = this.getSessionMeInfo()?.id;
    } else {
      key.participant = event.receipt.userJid;
    }
    const id = buildMessageId(key);

    const body: WAMessageAckBody = {
      id: id,
      from: toCusFormat(fromToParticipant.from),
      to: toCusFormat(fromToParticipant.to),
      participant: toCusFormat(fromToParticipant.participant),
      fromMe: event.key.fromMe,
      ack: ack,
      ackName: WAMessageAck[ack] || ACK_UNKNOWN,
      _data: event,
    };
    return body;
  }

  protected async handleMessagesUpdatePollVote(event) {
    const { key, update } = event;
    const pollUpdates = update?.pollUpdates;
    if (!pollUpdates) {
      return;
    }

    const pollCreationMessageKey = key;
    const pkey = { ...key };
    pkey.remoteJid = null; // try to find message creation by id only
    const pollCreationMessage = await this.getMessage(pkey);
    if (!pollCreationMessage) {
      this.logger.warn(
        { pollCreationMessageKey },
        'poll creation message not found, cannot aggregate votes',
      );
      return;
    }
    // Handle updates one by one, so we can get Vote Message for the specific vote
    for (const pollUpdate of pollUpdates) {
      const votes = getAggregateVotesInPollMessage({
        message: pollCreationMessage,
        pollUpdates: [pollUpdate],
      });

      // Get selected options for the author
      const selectedOptions = [];
      for (const voteAggregation of votes) {
        for (const voter of voteAggregation.voters) {
          if (voter === getKeyAuthor(pollUpdate.pollUpdateMessageKey)) {
            selectedOptions.push(voteAggregation.name);
          }
        }
      }

      // Build payload and call the handler
      const voteDestination = getDestination(pollUpdate.pollUpdateMessageKey);
      const pollVote: PollVote = {
        ...voteDestination,
        selectedOptions: selectedOptions,
        timestamp: ensureNumber(pollUpdate.senderTimestampMs),
      };
      const payload: PollVotePayload = {
        vote: pollVote,
        poll: getDestination(pollCreationMessageKey),
      };
      return payload;
    }
  }

  protected async handleMessageUpsertPollVoteFailed(message) {
    const pollUpdateMessage = message.message?.pollUpdateMessage;
    if (!pollUpdateMessage) {
      return;
    }
    const pollCreationMessageKey = pollUpdateMessage.pollCreationMessageKey;
    const pkey = { ...pollCreationMessageKey };
    pkey.remoteJid = null; // try to find message creation by id only
    const pollCreationMessage = await this.getMessage(pkey);
    if (pollCreationMessage) {
      // We found message, so later the engine will issue a message.update message
      return;
    }

    // We didn't find the creation message, so send failed one
    const pollUpdateMessageKey = message.key;
    const voteDestination = getDestination(pollUpdateMessageKey);
    const pollVote: PollVote = {
      ...voteDestination,
      selectedOptions: [],
      // change to below line when the PR merged, so we have the same timestamps
      // https://github.com/WhiskeySockets/Baileys/pull/348
      // Or without toNumber() - it depends on the PR above
      // timestamp: pollUpdateMessage.senderTimestampMs.toNumber()
      timestamp: ensureNumber(message.messageTimestamp),
    };
    const payload: PollVotePayload = {
      vote: pollVote,
      poll: getDestination(pollCreationMessageKey),
    };
    return payload;
  }

  private toCallData(call: WACallEvent): CallData {
    // call.date can be either string 2024-07-18T09:45:55.000Z or Date
    const date = new Date(call.date);
    // convert to timestamp in seconds
    const timestamp: number = date.getTime() / 1000;
    return {
      id: call.id,
      from: toCusFormat(call.from),
      timestamp: timestamp,
      isVideo: call.isVideo,
      isGroup: call.isGroup,
      _data: call,
    };
  }

  private toWahaPresences(
    remoteJid: string,
    storedPresences: { [participant: string]: PresenceData },
  ): WAHAChatPresences {
    const presences: WAHAPresenceData[] = [];
    for (const participant in storedPresences) {
      const data: PresenceData = storedPresences[participant];
      const lastKnownPresence = lodash.get(
        PresenceStatuses,
        data.lastKnownPresence,
        data.lastKnownPresence,
      );
      const presence: WAHAPresenceData = {
        participant: toCusFormat(participant),
        // @ts-ignore
        lastKnownPresence: lastKnownPresence,
        lastSeen: data.lastSeen || null,
      };
      presences.push(presence);
    }
    const chatId = toCusFormat(remoteJid);
    return { id: chatId, presences: presences };
  }

  protected async downloadMediaSafe(message): Promise<WAMedia | null> {
    try {
      return await this.downloadMedia(message);
    } catch (e) {
      this.logger.error('Failed when tried to download media for a message');
      this.logger.error(e, e.stack);
    }
    return null;
  }

  protected async downloadMedia(message): Promise<WAMedia | null> {
    let processor: IMediaEngineProcessor<any> = new NOWEBEngineMediaProcessor(
      this,
      this.loggerBuilder,
    );
    processor = new LottieMediaProcessorWrapper(processor, this.logger);
    return this.mediaManager.processMedia(processor, message, this.name);
  }

  protected async getMessageOptions(request: {
    id?: string;
    chatId: string;
    reply_to?: string;
  }) {
    const jid = toJID(request.chatId);

    let quoted;
    if (request.reply_to) {
      const key = parseMessageIdSerialized(request.reply_to, true);
      quoted = await this.store.loadMessage(jid, key.id);
    }
    const chat = await this.store.getChat(jid);
    const messageId = request.id ? request.id : this.generateMessageID();
    this.saveSentMessageId(messageId);
    return {
      quoted: quoted,
      ephemeralExpiration: chat?.ephemeralExpiration,
      messageId: messageId,
    };
  }

  protected getLinkPreview(request): any {
    // NOWEB works this way
    // If it's undefined - it'll generate it
    // If it's false - it will not generate it
    let linkPreview: boolean | undefined;
    switch (request.linkPreview) {
      case false:
        linkPreview = false;
        break;
      case true:
      default:
        linkPreview = undefined;
    }
    return linkPreview;
  }

  protected generateMessageID() {
    const id = generateMessageIDV2(this.sock.user?.id);
    this.saveSentMessageId(id);
    return id;
  }
}

function hasPath(url: string) {
  if (!url) {
    return false;
  }
  try {
    const urlObj = new URL(url);
    return urlObj.pathname !== '/';
  } catch (error) {
    return false;
  }
}

export class NOWEBEngineMediaProcessor implements IMediaEngineProcessor<any> {
  private readonly logger: ILogger;

  constructor(
    public session: WhatsappSessionNoWebCore,
    loggerBuilder: LoggerBuilder,
  ) {
    this.logger = loggerBuilder.child({
      name: NOWEBEngineMediaProcessor.name,
    }) as unknown as ILogger;
  }

  hasMedia(message: any): boolean {
    return Boolean(extractMediaContent(message.message));
  }

  getMessageId(message: any): string {
    return message.key.id;
  }

  getChatId(message: any): string {
    return toCusFormat(message.key.remoteJid);
  }

  getMimetype(message: any): string {
    const content = extractMediaContent(message.message);
    return content.mimetype;
  }

  async getMediaBuffer(message: any): Promise<Buffer | null> {
    const content = extractMediaContent(message.message);
    const url = content.url;
    // Fix Stickers
    // https://github.com/devlikeapro/waha/issues/504
    // Set it to null so the engine handles it right
    if (!hasPath(url)) {
      content.url = null;
    }
    // Fix Newsletter
    // directPath has the unencrypted path
    if (isJidNewsletter(message.key.remoteJid) && content.directPath) {
      content.url = null;
    }

    // Use 'stream' mode instead of 'buffer' to fix 0-byte audio files
    // 'buffer' mode silently returns empty buffer for audio/voice messages
    // See: https://github.com/devlikeapro/waha/issues/1996
    const stream = await downloadMediaMessage(
      message,
      'stream',
      {},
      {
        logger: this.logger,
        reuploadRequest: this.session.sock.updateMediaMessage,
      },
    ).finally(() => {
      // Set url back in case we removed it
      content.url = url;
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  getFilename(message: any): string | null {
    const content = extractMessageContent(message.message);
    return content?.documentMessage?.fileName || null;
  }
}

export const ALL_JID = 'all@s.whatsapp.net';

/**
 * Build WAHA message id from engine one
 * {id: "AAA", remoteJid: "11111111111@s.whatsapp.net", "fromMe": false}
 * false_11111111111@c.us_AA
 */
export function buildMessageId({
  id,
  remoteJid,
  fromMe,
  participant,
}: WAMessageKey) {
  const chatId = toCusFormat(remoteJid);
  const parts = [fromMe || false, chatId, id];
  if (participant) {
    parts.push(toCusFormat(participant));
  }
  return parts.join('_');
}

function getId(object) {
  return object.id;
}

function isMine(message) {
  return message?.key?.fromMe;
}

function isNotMine(message) {
  return !message?.key?.fromMe;
}

function isAckUpdateMessageEvent(event) {
  return event?.update.status != null;
}

export function getFromToParticipant(key) {
  const isGroupMessage = Boolean(key.participant);
  let participant: string;
  let to: string;
  if (isGroupMessage) {
    participant = key.participant;
    to = key.remoteJid;
  }
  const from = key.remoteJid;
  return {
    from: from,
    to: to,
    participant: participant,
  };
}

function getTo(key, meId = undefined) {
  // For group - always to group JID
  const isGroupMessage = Boolean(key.participant);
  if (isGroupMessage) {
    return key.remoteJid;
  }
  if (key.fromMe) {
    return key.remoteJid;
  }
  return meId || 'me';
}

function getFrom(key, meId) {
  // For group - always from participant
  const isGroupMessage = Boolean(key.participant);
  if (isGroupMessage) {
    return key.participant;
  }
  if (key.fromMe) {
    return meId || 'me';
  }
  return key.remoteJid;
}

export function getDestination(key, meId = undefined): MessageDestination {
  return {
    id: buildMessageId(key),
    to: toCusFormat(getTo(key, meId)),
    from: toCusFormat(getFrom(key, meId)),
    fromMe: key.fromMe,
  };
}

export function extractBody(message): string | null {
  if (!message) {
    return null;
  }
  const content = extractMessageContent(message);
  if (!content) {
    return null;
  }
  let body = content.conversation || null;
  if (!body) {
    // Some of the messages have no conversation, but instead have text in extendedTextMessage
    // https://github.com/devlikeapro/waha/issues/90
    body = content.extendedTextMessage?.text;
  }
  if (!body) {
    // Populate from caption
    const mediaContent = extractMediaContent(content);
    // @ts-ignore - AudioMessage doesn't have caption field
    body = mediaContent?.caption;
  }
  if (!body && content.protocolMessage?.editedMessage) {
    body = extractBody(content.protocolMessage.editedMessage);
  }
  if (!body && content.associatedChildMessage?.message) {
    body = extractBody(content.associatedChildMessage.message);
  }
  // Response for buttons
  if (!body) {
    body = content.templateButtonReplyMessage?.selectedDisplayText;
  }
  if (!body) {
    body = content.buttonsResponseMessage?.selectedDisplayText;
  }

  // List message
  if (!body) {
    const type = getContentType(content);
    if (type == 'listMessage') {
      const list = content.listMessage;
      const parts = [list.title, list.description, list.footerText];
      body = parts.filter(Boolean).join('\n');
    } else if (type === 'listResponseMessage') {
      const response = content.listResponseMessage;
      const parts = [response.title, response.description];
      body = parts.filter(Boolean).join('\n');
    }
  }

  return body;
}

import { VERSION } from './version';
import { WAHA_WEBHOOKS } from './structures/webhooks';

export function buildOpenApiSpec(): any {
  const webhooks: Record<string, any> = {};

  for (const [event, description] of Object.entries(WAHA_WEBHOOKS)) {
    webhooks[event] = {
      post: {
        summary: description,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  timestamp: { type: 'number' },
                  event: { type: 'string' },
                  session: { type: 'string' },
                  payload: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Return a 200 status to indicate that the data was received successfully',
          },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'BUNWA - WhatsApp HTTP API',
      description:
        '<b>WhatsApp HTTP API</b> powered by Bun with native high-performance SQLite.<br/>' +
        '<a href="/dashboard"><b>📊 Dashboard</b></a><br/>' +
        '<br/>' +
        '<b>Security:</b> API key authentication via header only (timing-safe comparison). ' +
        'Session-level ownership enforcement. Rate limiting. Configurable CORS.<br/>' +
        '<br/>' +
        'Learn more:' +
        '<ul>' +
        '<li><a href="https://bunwa.ekosystems.dev/" target="_blank">Documentation</a></li>' +
        '<li><a href="https://github.com/LoopyOratory/BunWa" target="_blank">GitHub - BUNWA</a></li>' +
        '</ul>',
      version: VERSION.version,
    },
    servers: [
      {
        url: '',
        description: 'BUNWA Server',
      },
    ],
    security: [{ apiKey: [] }],
    tags: [
      { name: '🖥️ Sessions', description: 'Control WhatsApp sessions (accounts)' },
      { name: '📱 Pairing', description: 'Pair a session with WhatsApp on your phone.' },
      { name: '🆔 Profile', description: 'Your profile information' },
      { name: '📤 Chatting', description: 'Chatting methods' },
      { name: '✅ Presence', description: 'Presence information' },
      { name: '📢 Channels', description: 'Channels (newsletters) methods' },
      { name: '🟢 Status', description: 'Status (aka stories) methods' },
      { name: '💬 Chats', description: 'Chats methods' },
      { name: '👤 Contacts', description: 'Contacts methods' },
      { name: '👥 Groups', description: 'Groups methods' },
      { name: '📞 Calls', description: 'Call handling methods' },
      { name: '📅 Events', description: 'Event Message' },
      { name: '🏷️ Labels', description: 'Labels - available only for WhatsApp Business accounts' },
      { name: '🖼️ Media', description: 'Media methods' },
      { name: '🔗 LIDs', description: 'LID to Phone Number mapping' },
      { name: '🧩 Apps', description: 'App integrations (Chatwoot, etc.)' },
      { name: '🔍 Observability', description: 'Other methods' },
    ],
    paths: {
      '/ping': {
        get: {
          tags: ['🔍 Observability'],
          summary: 'Ping server',
          operationId: 'ping',
          responses: {
            '200': {
              description: 'Pong',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'pong' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['🔍 Observability'],
          summary: 'Health check',
          operationId: 'health',
          responses: {
            '200': {
              description: 'Health status',
            },
          },
        },
      },
      '/api/version': {
        get: {
          tags: ['🔍 Observability'],
          summary: 'Get BUNWA version',
          operationId: 'getVersion',
          responses: {
            '200': {
              description: 'Version information',
            },
          },
        },
      },
      '/api/sessions': {
        get: {
          tags: ['🖥️ Sessions'],
          summary: 'Get all Sessions',
          operationId: 'getSessions',
          security: [{ apiKey: [] }],
          responses: {
            '200': {
              description: 'List of sessions',
            },
          },
        },
        post: {
          tags: ['🖥️ Sessions'],
          summary: 'Create a Session',
          operationId: 'createSession',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'default' },
                    start: { type: 'boolean', example: false },
                    config: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Session created',
            },
          },
        },
      },
      '/api/sessions/{session}': {
        get: {
          tags: ['🖥️ Sessions'],
          summary: 'Get Session Info',
          operationId: 'getSession',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Session info',
            },
          },
        },
        put: {
          tags: ['🖥️ Sessions'],
          summary: 'Update Session',
          operationId: 'updateSession',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Session updated',
            },
          },
        },
        delete: {
          tags: ['🖥️ Sessions'],
          summary: 'Delete Session',
          operationId: 'deleteSession',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Session deleted',
            },
          },
        },
      },
      '/api/sessions/{session}/start': {
        post: {
          tags: ['🖥️ Sessions'],
          summary: 'Start Session',
          operationId: 'startSession',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Session started',
            },
          },
        },
      },
      '/api/sessions/{session}/stop': {
        post: {
          tags: ['🖥️ Sessions'],
          summary: 'Stop Session',
          operationId: 'stopSession',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Session stopped',
            },
          },
        },
      },
      '/api/sessions/{session}/logout': {
        post: {
          tags: ['🖥️ Sessions'],
          summary: 'Logout Session',
          operationId: 'logoutSession',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Session logged out',
            },
          },
        },
      },
      '/api/sessions/{session}/restart': {
        post: {
          tags: ['🖥️ Sessions'],
          summary: 'Restart Session',
          operationId: 'restartSession',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Session restarted',
            },
          },
        },
      },
      '/api/{session}/auth/qr': {
        get: {
          tags: ['📱 Pairing'],
          summary: 'Get QR Code',
          operationId: 'getQR',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'QR code',
            },
          },
        },
      },
      '/api/{session}/auth/request-code': {
        post: {
          tags: ['📱 Pairing'],
          summary: 'Request Pairing Code',
          operationId: 'requestPairingCode',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Pairing code',
            },
          },
        },
      },
      '/api/sendText': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a text message',
          operationId: 'sendText',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'text'],
                  properties: {
                    session: { type: 'string', example: 'default' },
                    chatId: { type: 'string', example: '1234567890@c.us' },
                    text: { type: 'string', example: 'Hello World!' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Message sent',
            },
          },
        },
      },
      '/api/sendImage': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send an image message',
          operationId: 'sendImage',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'file'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    file: {
                      type: 'object',
                      properties: {
                        mimetype: { type: 'string' },
                        url: { type: 'string' },
                      },
                    },
                    caption: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Image sent',
            },
          },
        },
      },
      '/api/sendLocation': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a location',
          operationId: 'sendLocation',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'latitude', 'longitude'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    latitude: { type: 'number' },
                    longitude: { type: 'number' },
                    title: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Location sent',
            },
          },
        },
      },
      '/api/sendContactVcard': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a contact vCard',
          operationId: 'sendContactVcard',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'contacts'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    contacts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          phone: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Contact sent',
            },
          },
        },
      },
      '/api/sendLinkPreview': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a link preview',
          operationId: 'sendLinkPreview',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'url'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    url: { type: 'string' },
                    title: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Link preview sent',
            },
          },
        },
      },
      '/api/reply': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Reply to a message',
          operationId: 'reply',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'text', 'messageId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    text: { type: 'string' },
                    messageId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Reply sent',
            },
          },
        },
      },
      '/api/forwardMessage': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Forward a message',
          operationId: 'forwardMessage',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'messageId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    messageId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Message forwarded',
            },
          },
        },
      },
      '/api/sendSeen': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Mark messages as seen',
          operationId: 'sendSeen',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Messages marked as seen',
            },
          },
        },
      },
      '/api/startTyping': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Start typing indicator',
          operationId: 'startTyping',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Typing started',
            },
          },
        },
      },
      '/api/stopTyping': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Stop typing indicator',
          operationId: 'stopTyping',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Typing stopped',
            },
          },
        },
      },
      '/api/reaction': {
        put: {
          tags: ['📤 Chatting'],
          summary: 'Add reaction to message',
          operationId: 'setReaction',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'messageId', 'reaction'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    messageId: { type: 'string' },
                    reaction: { type: 'string', example: '👍' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Reaction added',
            },
          },
        },
      },
      '/api/star': {
        put: {
          tags: ['📤 Chatting'],
          summary: 'Star or unstar a message',
          operationId: 'setStar',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'messageId', 'star'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    messageId: { type: 'string' },
                    star: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Message starred/unstarred',
            },
          },
        },
      },
      '/api/{session}/profile': {
        get: {
          tags: ['🆔 Profile'],
          summary: 'Get Profile Info',
          operationId: 'getProfile',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Profile info',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      pushName: { type: 'string' },
                      lid: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/{session}/profile/name': {
        put: {
          tags: ['🆔 Profile'],
          summary: 'Set profile name',
          operationId: 'setProfileName',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: 'My Name' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Profile name updated',
            },
          },
        },
      },
      '/api/{session}/profile/status': {
        put: {
          tags: ['🆔 Profile'],
          summary: 'Set profile status',
          operationId: 'setProfileStatus',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', example: 'Available' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Profile status updated',
            },
          },
        },
      },
      '/api/{session}/chats': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get all chats',
          operationId: 'getChats',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'List of chats',
            },
          },
        },
      },
      '/api/{session}/chats/overview': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get chats overview with last messages',
          operationId: 'getChatsOverview',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'List of chats with last messages',
            },
          },
        },
      },
      '/api/{session}/chats/{chatId}/messages': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get messages from chat',
          operationId: 'getChatMessages',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'chatId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
            {
              name: 'downloadMedia',
              in: 'query',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            '200': {
              description: 'List of messages',
            },
          },
        },
      },
      '/api/contacts/': {
        get: {
          tags: ['👤 Contacts'],
          summary: 'Get all contacts',
          operationId: 'getContacts',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of contacts',
            },
          },
        },
      },
      '/api/contacts/all': {
        get: {
          tags: ['👤 Contacts'],
          summary: 'Get all contacts for session',
          operationId: 'getAllContacts',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of contacts',
            },
          },
        },
      },
      '/api/{session}/groups': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get all groups',
          operationId: 'getGroups',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of groups',
            },
          },
        },
        post: {
          tags: ['👥 Groups'],
          summary: 'Create a group',
          operationId: 'createGroup',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: 'My Group' },
                    participants: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['1234567890@c.us'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Group created',
            },
          },
        },
      },
      '/api/{session}/groups/{id}': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get group info',
          operationId: 'getGroup',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Group info',
            },
          },
        },
      },
      '/api/{session}/groups/{id}/leave': {
        post: {
          tags: ['👥 Groups'],
          summary: 'Leave a group',
          operationId: 'leaveGroup',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Left group',
            },
          },
        },
      },
      '/api/{session}/groups/{id}/participants': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get group participants',
          operationId: 'getGroupParticipants',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of participants',
            },
          },
        },
      },
      '/api/{session}/groups/{id}/participants/add': {
        post: {
          tags: ['👥 Groups'],
          summary: 'Add participants to group',
          operationId: 'addParticipants',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['participants'],
                  properties: {
                    participants: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Participants added',
            },
          },
        },
      },
      '/api/{session}/groups/{id}/participants/remove': {
        post: {
          tags: ['👥 Groups'],
          summary: 'Remove participants from group',
          operationId: 'removeParticipants',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['participants'],
                  properties: {
                    participants: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Participants removed',
            },
          },
        },
      },
      '/api/{session}/groups/{id}/invite-code': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get group invite code',
          operationId: 'getInviteCode',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Invite code',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/{session}/groups/{id}/description': {
        put: {
          tags: ['👥 Groups'],
          summary: 'Set group description',
          operationId: 'setDescription',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['description'],
                  properties: {
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Description updated',
            },
          },
        },
      },
      '/api/{session}/groups/{id}/subject': {
        put: {
          tags: ['👥 Groups'],
          summary: 'Set group subject (name)',
          operationId: 'setSubject',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['subject'],
                  properties: {
                    subject: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Subject updated',
            },
          },
        },
      },
      '/api/{session}/channels': {
        get: {
          tags: ['📢 Channels'],
          summary: 'Get all channels',
          operationId: 'getChannels',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of channels',
            },
          },
        },
        post: {
          tags: ['📢 Channels'],
          summary: 'Create a channel',
          operationId: 'createChannel',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Channel created',
            },
          },
        },
      },
      '/api/{session}/channels/{id}': {
        get: {
          tags: ['📢 Channels'],
          summary: 'Get channel info',
          operationId: 'getChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel info' } },
        },
        delete: {
          tags: ['📢 Channels'],
          summary: 'Delete a channel',
          operationId: 'deleteChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel deleted' } },
        },
      },
      '/api/{session}/channels/{id}/follow': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Follow a channel',
          operationId: 'followChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel followed' } },
        },
      },
      '/api/{session}/channels/{id}/unfollow': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Unfollow a channel',
          operationId: 'unfollowChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel unfollowed' } },
        },
      },
      '/api/{session}/channels/{id}/mute': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Mute a channel',
          operationId: 'muteChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel muted' } },
        },
      },
      '/api/{session}/channels/{id}/unmute': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Unmute a channel',
          operationId: 'unmuteChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel unmuted' } },
        },
      },
      '/api/{session}/labels': {
        get: {
          tags: ['🏷️ Labels'],
          summary: 'Get all labels',
          operationId: 'getLabels',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of labels',
            },
          },
        },
        post: {
          tags: ['🏷️ Labels'],
          summary: 'Create a label',
          operationId: 'createLabel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Label created' } },
        },
      },
      '/api/{session}/labels/{labelId}': {
        put: {
          tags: ['🏷️ Labels'],
          summary: 'Update a label',
          operationId: 'updateLabel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'labelId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Label updated' } },
        },
        delete: {
          tags: ['🏷️ Labels'],
          summary: 'Delete a label',
          operationId: 'deleteLabel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'labelId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Label deleted' } },
        },
      },
      '/api/{session}/labels/chats/{chatId}': {
        get: {
          tags: ['🏷️ Labels'],
          summary: 'Get labels for a chat',
          operationId: 'getChatLabels',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of labels' } },
        },
        put: {
          tags: ['🏷️ Labels'],
          summary: 'Set labels for a chat',
          operationId: 'putLabelsToChat',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    labels: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Labels updated' } },
        },
      },
      '/api/{session}/labels/{labelId}/chats': {
        get: {
          tags: ['🏷️ Labels'],
          summary: 'Get chats for a label',
          operationId: 'getChatsByLabelId',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'labelId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of chats' } },
        },
      },
      '/api/{session}/status/text': {
        post: {
          tags: ['🟢 Status'],
          summary: 'Send text status',
          operationId: 'sendTextStatus',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Status sent' } },
        },
      },
      '/api/{session}/status/image': {
        post: {
          tags: ['🟢 Status'],
          summary: 'Send image status',
          operationId: 'sendImageStatus',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: {
                      type: 'object',
                      properties: {
                        mimetype: { type: 'string' },
                        url: { type: 'string' },
                        data: { type: 'string' },
                      },
                    },
                    caption: { type: 'string' },
                    backgroundColor: { type: 'string' },
                    contacts: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Status sent' } },
        },
      },
      '/api/{session}/status/voice': {
        post: {
          tags: ['🟢 Status'],
          summary: 'Send voice status',
          operationId: 'sendVoiceStatus',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: {
                      type: 'object',
                      properties: {
                        mimetype: { type: 'string' },
                        url: { type: 'string' },
                        data: { type: 'string' },
                      },
                    },
                    backgroundColor: { type: 'string' },
                    contacts: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Status sent' } },
        },
      },
      '/api/{session}/status/video': {
        post: {
          tags: ['🟢 Status'],
          summary: 'Send video status',
          operationId: 'sendVideoStatus',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: {
                      type: 'object',
                      properties: {
                        mimetype: { type: 'string' },
                        url: { type: 'string' },
                        data: { type: 'string' },
                      },
                    },
                    caption: { type: 'string' },
                    backgroundColor: { type: 'string' },
                    convert: { type: 'boolean', description: 'Convert video to mp4 (libx264) if needed' },
                    contacts: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Status sent' } },
        },
      },
      '/api/{session}/status/delete': {
        post: {
          tags: ['🟢 Status'],
          summary: 'Delete a status',
          operationId: 'deleteStatus',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Status deleted' } },
        },
      },
      '/api/{session}/status/new-message-id': {
        get: {
          tags: ['🟢 Status'],
          summary: 'Get new message ID for status',
          operationId: 'getStatusNewMessageId',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'New message ID' } },
        },
      },
      '/api/{session}/presence': {
        get: {
          tags: ['✅ Presence'],
          summary: 'Get all presences',
          operationId: 'getPresences',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of presences' } },
        },
        post: {
          tags: ['✅ Presence'],
          summary: 'Set presence',
          operationId: 'setPresence',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['presence'],
                  properties: {
                    presence: { type: 'string', enum: ['ONLINE', 'OFFLINE', 'TYPING', 'RECORDING', 'PAUSED'] },
                    chatId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Presence set' } },
        },
      },
      '/api/{session}/presence/{chatId}': {
        get: {
          tags: ['✅ Presence'],
          summary: 'Get presence for a chat',
          operationId: 'getPresence',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Presence info' } },
        },
      },
      '/api/{session}/presence/{chatId}/subscribe': {
        post: {
          tags: ['✅ Presence'],
          summary: 'Subscribe to presence updates',
          operationId: 'subscribePresence',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Subscribed' } },
        },
      },
      '/api/{session}/calls/reject': {
        post: {
          tags: ['📞 Calls'],
          summary: 'Reject a call',
          operationId: 'rejectCall',
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: 'session',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['from', 'id'],
                  properties: {
                    from: { type: 'string' },
                    id: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Call rejected',
            },
          },
        },
      },
      '/api/{session}/lids': {
        get: {
          tags: ['🔗 LIDs'],
          summary: 'Get all LID mappings',
          operationId: 'getAllLids',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'List of LID mappings' } },
        },
      },
      '/api/{session}/lids/count': {
        get: {
          tags: ['🔗 LIDs'],
          summary: 'Get LID count',
          operationId: 'getLidsCount',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'LID count' } },
        },
      },
      '/api/{session}/lids/{lid}': {
        get: {
          tags: ['🔗 LIDs'],
          summary: 'Find phone number by LID',
          operationId: 'findPNByLid',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'lid', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Phone number' } },
        },
      },
      '/api/{session}/lids/pn/{phoneNumber}': {
        get: {
          tags: ['🔗 LIDs'],
          summary: 'Find LID by phone number',
          operationId: 'findLIDByPhoneNumber',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'phoneNumber', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'LID' } },
        },
      },
      // ==================== MISSING ENDPOINTS ====================
      // Chatting endpoints
      '/api/sendFile': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a file/document',
          operationId: 'sendFile',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'file'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    file: { type: 'object' },
                    caption: { type: 'string' },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'File sent' } },
        },
      },
      '/api/sendVoice': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a voice message',
          operationId: 'sendVoice',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'file'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    file: { type: 'object' },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Voice sent' } },
        },
      },
      '/api/sendVideo': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a video message',
          operationId: 'sendVideo',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'file'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    file: { type: 'object' },
                    caption: { type: 'string' },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Video sent' } },
        },
      },
      '/api/sendLocation': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a location',
          operationId: 'sendLocation',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'latitude', 'longitude'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    latitude: { type: 'number' },
                    longitude: { type: 'number' },
                    title: { type: 'string' },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Location sent' } },
        },
      },
      '/api/sendPoll': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a poll',
          operationId: 'sendPoll',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'poll'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    poll: {
                      type: 'object',
                      required: ['name', 'options'],
                      properties: {
                        name: { type: 'string', description: 'Poll question' },
                        options: { type: 'array', items: { type: 'string' }, description: 'Poll choices (at least one)' },
                        multipleAnswers: { type: 'boolean', description: 'Allow selecting more than one option' },
                      },
                    },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Poll sent' } },
        },
      },
      '/api/sendPollVote': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Vote on a poll',
          operationId: 'sendPollVote',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'pollMessageId', 'votes'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    pollMessageId: { type: 'string' },
                    votes: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Vote sent' } },
        },
      },
      '/api/sendContactVcard': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a contact vcard',
          operationId: 'sendContactVcard',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'contacts'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    contacts: { type: 'array' },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Contact sent' } },
        },
      },
      '/api/sendLinkPreview': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send a link preview',
          operationId: 'sendLinkPreview',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'url'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    url: { type: 'string' },
                    title: { type: 'string' },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Link preview sent' } },
        },
      },
      '/api/sendButtons': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send interactive buttons',
          operationId: 'sendButtons',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'buttons'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    buttons: {
                      type: 'array',
                      description: 'WhatsApp allows at most 3 quick-reply buttons per message',
                      items: {
                        type: 'object',
                        required: ['type', 'text'],
                        properties: {
                          type: { type: 'string', enum: ['reply', 'url', 'call', 'copy'] },
                          text: { type: 'string', description: 'Button label' },
                          id: { type: 'string', description: 'Reply button id (type=reply); auto-generated if omitted' },
                          url: { type: 'string', description: 'Target URL (type=url)' },
                          phoneNumber: { type: 'string', description: 'Phone number to dial (type=call)' },
                          copyCode: { type: 'string', description: 'Text copied to clipboard (type=copy)' },
                        },
                      },
                    },
                    header: { type: 'string' },
                    headerImage: { type: 'object', description: 'Image file object shown in the header (mimetype/filename/data or url)' },
                    body: { type: 'string' },
                    footer: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Buttons sent' } },
        },
      },
      '/api/sendList': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Send an interactive list message',
          operationId: 'sendList',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'title', 'description', 'button', 'sections'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    title: { type: 'string', description: 'List header title' },
                    description: { type: 'string', description: 'Body text shown above the list button' },
                    button: { type: 'string', description: 'Label of the button that opens the list' },
                    sections: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          rows: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                title: { type: 'string' },
                                description: { type: 'string' },
                                rowId: { type: 'string', description: 'Auto-generated if omitted' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'List sent' } },
        },
      },
      '/api/startTyping': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Start typing indicator',
          operationId: 'startTyping',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Typing started' } },
        },
      },
      '/api/stopTyping': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Stop typing indicator',
          operationId: 'stopTyping',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Typing stopped' } },
        },
      },
      '/api/reaction': {
        put: {
          tags: ['📤 Chatting'],
          summary: 'Set message reaction',
          operationId: 'setReaction',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'messageId', 'reaction'],
                  properties: {
                    session: { type: 'string' },
                    messageId: { type: 'string' },
                    reaction: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Reaction set' } },
        },
      },
      '/api/star': {
        put: {
          tags: ['📤 Chatting'],
          summary: 'Star/unstar a message',
          operationId: 'setStar',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'messageId', 'star'],
                  properties: {
                    session: { type: 'string' },
                    messageId: { type: 'string' },
                    star: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Star set' } },
        },
      },
      '/api/forwardMessage': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Forward a message',
          operationId: 'forwardMessage',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'messageId'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    messageId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Message forwarded' } },
        },
      },
      '/api/reply': {
        post: {
          tags: ['📤 Chatting'],
          summary: 'Reply to a message',
          operationId: 'reply',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'chatId', 'text', 'reply_to'],
                  properties: {
                    session: { type: 'string' },
                    chatId: { type: 'string' },
                    text: { type: 'string' },
                    reply_to: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Reply sent' } },
        },
      },
      '/api/checkNumberStatus': {
        get: {
          tags: ['📤 Chatting'],
          summary: 'Check if number is on WhatsApp',
          operationId: 'checkNumberStatus',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'phone', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Number status' } },
        },
      },
      '/api/{session}/new-message-id': {
        get: {
          tags: ['📤 Chatting'],
          summary: 'Generate new message ID',
          operationId: 'generateNewMessageId',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'New message ID' } },
        },
      },
      // Chats endpoints
      '/api/{session}/chats': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get all chats',
          operationId: 'getChats',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'List of chats' } },
        },
      },
      '/api/{session}/chats/overview': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get chats overview with last message',
          operationId: 'getChatsOverview',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'Chat overview list' } },
        },
      },
      '/api/{session}/chats/{chatId}': {
        delete: {
          tags: ['💬 Chats'],
          summary: 'Delete a chat',
          operationId: 'deleteChat',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Chat deleted' } },
        },
      },
      '/api/{session}/chats/{chatId}/picture': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get chat profile picture',
          operationId: 'getChatPicture',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Picture URL' } },
        },
      },
      '/api/{session}/chats/{chatId}/messages': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get chat messages',
          operationId: 'getChatMessages',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'List of messages' } },
        },
        delete: {
          tags: ['💬 Chats'],
          summary: 'Clear all messages in chat',
          operationId: 'clearMessages',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Messages cleared' } },
        },
      },
      '/api/{session}/chats/{chatId}/messages/read': {
        post: {
          tags: ['💬 Chats'],
          summary: 'Mark messages as read',
          operationId: 'readChatMessages',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Messages marked as read' } },
        },
      },
      '/api/{session}/chats/{chatId}/messages/{messageId}': {
        get: {
          tags: ['💬 Chats'],
          summary: 'Get single message',
          operationId: 'getChatMessage',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'messageId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Message details' } },
        },
        put: {
          tags: ['💬 Chats'],
          summary: 'Edit a message',
          operationId: 'editMessage',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'messageId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: { type: 'string' },
                    mentions: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Message edited' } },
        },
        delete: {
          tags: ['💬 Chats'],
          summary: 'Delete a message',
          operationId: 'deleteMessage',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'messageId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Message deleted' } },
        },
      },
      '/api/{session}/chats/{chatId}/messages/{messageId}/pin': {
        post: {
          tags: ['💬 Chats'],
          summary: 'Pin a message',
          operationId: 'pinMessage',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'messageId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Message pinned' } },
        },
      },
      '/api/{session}/chats/{chatId}/messages/{messageId}/unpin': {
        post: {
          tags: ['💬 Chats'],
          summary: 'Unpin a message',
          operationId: 'unpinMessage',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'messageId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Message unpinned' } },
        },
      },
      '/api/{session}/chats/{chatId}/archive': {
        post: {
          tags: ['💬 Chats'],
          summary: 'Archive a chat',
          operationId: 'archiveChat',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Chat archived' } },
        },
      },
      '/api/{session}/chats/{chatId}/unarchive': {
        post: {
          tags: ['💬 Chats'],
          summary: 'Unarchive a chat',
          operationId: 'unarchiveChat',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Chat unarchived' } },
        },
      },
      '/api/{session}/chats/{chatId}/unread': {
        post: {
          tags: ['💬 Chats'],
          summary: 'Mark chat as unread',
          operationId: 'unreadChat',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Chat marked as unread' } },
        },
      },
      // Contacts endpoints
      '/api/contacts/all': {
        get: {
          tags: ['👤 Contacts'],
          summary: 'Get all contacts',
          operationId: 'getContacts',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'List of contacts' } },
        },
      },
      '/api/contacts': {
        get: {
          tags: ['👤 Contacts'],
          summary: 'Get contact by ID',
          operationId: 'getContact',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'contactId', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Contact details' } },
        },
      },
      '/api/contacts/check-exists': {
        get: {
          tags: ['👤 Contacts'],
          summary: 'Check if number exists on WhatsApp',
          operationId: 'checkContactExists',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'phone', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Contact existence status' } },
        },
      },
      '/api/contacts/about': {
        get: {
          tags: ['👤 Contacts'],
          summary: 'Get contact about/status',
          operationId: 'getContactAbout',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'contactId', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Contact about' } },
        },
      },
      '/api/contacts/profile-picture': {
        get: {
          tags: ['👤 Contacts'],
          summary: 'Get contact profile picture',
          operationId: 'getContactProfilePicture',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'contactId', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Profile picture URL' } },
        },
      },
      '/api/contacts/block': {
        post: {
          tags: ['👤 Contacts'],
          summary: 'Block a contact',
          operationId: 'blockContact',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'contactId'],
                  properties: {
                    session: { type: 'string' },
                    contactId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Contact blocked' } },
        },
      },
      '/api/contacts/unblock': {
        post: {
          tags: ['👤 Contacts'],
          summary: 'Unblock a contact',
          operationId: 'unblockContact',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'contactId'],
                  properties: {
                    session: { type: 'string' },
                    contactId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Contact unblocked' } },
        },
      },
      // Groups endpoints
      '/api/{session}/groups': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get all groups',
          operationId: 'getGroups',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of groups' } },
        },
        post: {
          tags: ['👥 Groups'],
          summary: 'Create a group',
          operationId: 'createGroup',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'participants'],
                  properties: {
                    name: { type: 'string' },
                    participants: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Group created' } },
        },
      },
      '/api/{session}/groups/{id}': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get group by ID',
          operationId: 'getGroup',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Group details' } },
        },
      },
      '/api/{session}/groups/{id}/leave': {
        post: {
          tags: ['👥 Groups'],
          summary: 'Leave a group',
          operationId: 'leaveGroup',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Left group' } },
        },
      },
      '/api/{session}/groups/{id}/participants': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get group participants',
          operationId: 'getGroupParticipants',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of participants' } },
        },
      },
      '/api/{session}/groups/{id}/participants/add': {
        post: {
          tags: ['👥 Groups'],
          summary: 'Add participants to group',
          operationId: 'addParticipants',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['participants'],
                  properties: {
                    participants: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Participants added' } },
        },
      },
      '/api/{session}/groups/{id}/participants/remove': {
        post: {
          tags: ['👥 Groups'],
          summary: 'Remove participants from group',
          operationId: 'removeParticipants',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['participants'],
                  properties: {
                    participants: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Participants removed' } },
        },
      },
      '/api/{session}/groups/{id}/description': {
        put: {
          tags: ['👥 Groups'],
          summary: 'Set group description',
          operationId: 'setGroupDescription',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['description'],
                  properties: {
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Description set' } },
        },
      },
      '/api/{session}/groups/{id}/subject': {
        put: {
          tags: ['👥 Groups'],
          summary: 'Set group name',
          operationId: 'setGroupSubject',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['subject'],
                  properties: {
                    subject: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Subject set' } },
        },
      },
      '/api/{session}/groups/{id}/invite-code': {
        get: {
          tags: ['👥 Groups'],
          summary: 'Get group invite code',
          operationId: 'getInviteCode',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Invite code' } },
        },
      },
      // Channels endpoints
      '/api/{session}/channels': {
        get: {
          tags: ['📢 Channels'],
          summary: 'Get all channels',
          operationId: 'getChannels',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of channels' } },
        },
      },
      '/api/{session}/channels/{id}': {
        get: {
          tags: ['📢 Channels'],
          summary: 'Get channel by ID',
          operationId: 'getChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel details' } },
        },
      },
      '/api/{session}/channels/{id}/follow': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Follow a channel',
          operationId: 'followChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel followed' } },
        },
      },
      '/api/{session}/channels/{id}/unfollow': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Unfollow a channel',
          operationId: 'unfollowChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel unfollowed' } },
        },
      },
      '/api/{session}/channels/{id}/mute': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Mute a channel',
          operationId: 'muteChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel muted' } },
        },
      },
      '/api/{session}/channels/{id}/unmute': {
        post: {
          tags: ['📢 Channels'],
          summary: 'Unmute a channel',
          operationId: 'unmuteChannel',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Channel unmuted' } },
        },
      },
      // Labels endpoints
      '/api/{session}/labels': {
        get: {
          tags: ['🏷️ Labels'],
          summary: 'Get all labels',
          operationId: 'getLabels',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of labels' } },
        },
      },
      '/api/{session}/labels/chats/{chatId}': {
        put: {
          tags: ['🏷️ Labels'],
          summary: 'Set labels on a chat',
          operationId: 'putLabelsToChat',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Labels set' } },
        },
      },
      '/api/{session}/labels/{labelId}/chats': {
        get: {
          tags: ['🏷️ Labels'],
          summary: 'Get chats by label',
          operationId: 'getChatsByLabelId',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'labelId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of chats' } },
        },
      },
      // Profile endpoints
      '/api/{session}/profile': {
        get: {
          tags: ['🆔 Profile'],
          summary: 'Get my profile',
          operationId: 'getProfile',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Profile info' } },
        },
      },
      '/api/{session}/profile/name': {
        put: {
          tags: ['🆔 Profile'],
          summary: 'Set profile name',
          operationId: 'setProfileName',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Name set' } },
        },
      },
      '/api/{session}/profile/status': {
        put: {
          tags: ['🆔 Profile'],
          summary: 'Set profile status',
          operationId: 'setProfileStatus',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Status set' } },
        },
      },
      // Presence endpoints
      '/api/{session}/presence': {
        get: {
          tags: ['✅ Presence'],
          summary: 'Get all presences',
          operationId: 'getPresences',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of presences' } },
        },
        post: {
          tags: ['✅ Presence'],
          summary: 'Set presence',
          operationId: 'setPresence',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['presence'],
                  properties: {
                    presence: { type: 'string', enum: ['ONLINE', 'OFFLINE', 'TYPING', 'RECORDING', 'PAUSED'] },
                    chatId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Presence set' } },
        },
      },
      '/api/{session}/presence/{chatId}': {
        get: {
          tags: ['✅ Presence'],
          summary: 'Get presence for chat',
          operationId: 'getPresence',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Presence info' } },
        },
      },
      '/api/{session}/presence/{chatId}/subscribe': {
        post: {
          tags: ['✅ Presence'],
          summary: 'Subscribe to presence events',
          operationId: 'subscribePresence',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'session', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'chatId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Subscribed' } },
        },
      },
      // Workers endpoint
      '/api/workers': {
        get: {
          tags: ['🔍 Observability'],
          summary: 'List workers',
          operationId: 'getWorkers',
          security: [{ apiKey: [] }],
          responses: { '200': { description: 'List of workers' } },
        },
      },
      // Apps endpoints
      '/api/apps': {
        get: {
          tags: ['🧩 Apps'],
          summary: 'List all apps',
          operationId: 'listApps',
          security: [{ apiKey: [] }],
          responses: { '200': { description: 'List of app configurations' } },
        },
        post: {
          tags: ['🧩 Apps'],
          summary: 'Create an app (Chatwoot)',
          operationId: 'createApp',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['session', 'app', 'config'],
                  properties: {
                    session: { type: 'string', example: 'default' },
                    app: { type: 'string', enum: ['chatwoot'], example: 'chatwoot' },
                    enabled: { type: 'boolean', default: true },
                    config: {
                      type: 'object',
                      properties: {
                        url: { type: 'string', example: 'http://chatwoot:3000' },
                        accountId: { type: 'integer', example: 1 },
                        accountToken: { type: 'string' },
                        inboxId: { type: 'integer', example: 1 },
                      },
                      required: ['url', 'accountId', 'accountToken', 'inboxId'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'App created' },
            '400': { description: 'Validation error' },
          },
        },
      },
      '/api/apps/{id}': {
        get: {
          tags: ['🧩 Apps'],
          summary: 'Get app by ID',
          operationId: 'getApp',
          security: [{ apiKey: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'App configuration' }, '404': { description: 'Not found' } },
        },
        put: {
          tags: ['🧩 Apps'],
          summary: 'Update app',
          operationId: 'updateApp',
          security: [{ apiKey: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'App updated' }, '404': { description: 'Not found' } },
        },
        delete: {
          tags: ['🧩 Apps'],
          summary: 'Delete app',
          operationId: 'deleteApp',
          security: [{ apiKey: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'App deleted' }, '404': { description: 'Not found' } },
        },
      },
      // Chatwoot webhook (no auth — verified by account_id)
      '/webhook/chatwoot/{session}': {
        post: {
          tags: ['🧩 Apps'],
          summary: 'Chatwoot webhook endpoint',
          description: 'Receives message_created events from Chatwoot and forwards agent replies to WhatsApp',
          operationId: 'chatwootWebhook',
          parameters: [{ name: 'session', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    event: { type: 'string', example: 'message_created' },
                    message_type: { type: 'string', example: 'outgoing' },
                    content: { type: 'string' },
                    conversation: {
                      type: 'object',
                      properties: {
                        contact_inbox: {
                          type: 'object',
                          properties: { source_id: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Webhook processed' },
            '404': { description: 'No app configured for this session' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key for authentication (header only, timing-safe comparison)',
        },
      },
    },
    webhooks,
  };
}

import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	bunwaApiRequest,
	chatIdField,
	forOperations,
	messageIdField,
	optional,
	sessionField,
	splitList,
	type ResourceModule,
} from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{ name: 'Archive Chat', value: 'archiveChat', action: 'Archive a chat' },
	{ name: 'Delete Chat', value: 'deleteChat', action: 'Delete a chat' },
	{ name: 'Delete Message', value: 'deleteMessage', action: 'Delete a message' },
	{ name: 'Edit Message', value: 'editMessage', action: 'Edit the text of a message' },
	{ name: 'Get Chat', value: 'get', action: 'Get a chat' },
	{ name: 'Get Chat Picture', value: 'getPicture', action: 'Get the profile picture of a chat' },
	{ name: 'Get Message', value: 'getMessage', action: 'Get a single message' },
	{ name: 'Get Messages', value: 'getMessages', action: 'Get the messages of a chat' },
	{ name: 'Get Overview', value: 'getOverview', action: 'Get chats with their last message' },
	{ name: 'Get Reactions', value: 'getReactions', action: 'Get the reactions of a message' },
	{ name: 'List Chats', value: 'list', action: 'List chats' },
	{ name: 'Mark Chat Read', value: 'markChatRead', action: 'Mark a chat as read' },
	{ name: 'Mark Chat Unread', value: 'markChatUnread', action: 'Mark a chat as unread' },
	{ name: 'Mark Messages Read', value: 'markMessagesRead', action: 'Mark messages of a chat as read' },
	{ name: 'Pin Message', value: 'pinMessage', action: 'Pin a message in a chat' },
	{ name: 'Unarchive Chat', value: 'unarchiveChat', action: 'Unarchive a chat' },
	{ name: 'Unpin Message', value: 'unpinMessage', action: 'Unpin a message in a chat' },
];

/** Operations that address one chat. */
const chatOperations = [
	'archiveChat',
	'deleteChat',
	'deleteMessage',
	'editMessage',
	'get',
	'getMessage',
	'getMessages',
	'getPicture',
	'getReactions',
	'markChatRead',
	'markChatUnread',
	'markMessagesRead',
	'pinMessage',
	'unarchiveChat',
	'unpinMessage',
];

/** Operations that address one message. */
const messageIdOperations = [
	'deleteMessage',
	'editMessage',
	'getMessage',
	'getReactions',
	'pinMessage',
	'unpinMessage',
];

const properties: INodeProperties[] = [
	sessionField('Session that owns the chats'),
	...forOperations([chatIdField()], chatOperations),
	...forOperations([messageIdField()], messageIdOperations),
	...forOperations(
		[
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				required: true,
				description: 'New text of the message',
			},
		],
		['editMessage'],
	),
	...forOperations(
		[
			{
				displayName: 'Duration',
				name: 'duration',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 7,
				description: 'How long the message stays pinned, in days',
			},
		],
		['pinMessage'],
	),
	...forOperations(
		[
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of messages to return',
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of messages to skip',
			},
		],
		['getMessages'],
	),
	...forOperations(
		[
			{
				displayName: 'Message IDs',
				name: 'messageIds',
				type: 'string',
				default: '',
				placeholder: 'false_15551234567@c.us_3EB0..., true_15551234567@c.us_3EB0...',
				description:
					'Comma-separated IDs of the messages to mark as read. Leave empty to mark the most recent messages instead.',
			},
			{
				displayName: 'Days',
				name: 'days',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 1,
				description: 'How many days back to look for messages to mark as read',
			},
		],
		['markMessagesRead'],
	),
];

export const chatResource: ResourceModule = {
	value: 'chat',
	name: 'Chat',
	defaultOperation: 'list',
	description: 'Inspect chats and manage their messages',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;
		const chatId = optional(ctx.getNodeParameter('chatId', itemIndex, '')) as string | undefined;
		const messageId = optional(ctx.getNodeParameter('messageId', itemIndex, '')) as string | undefined;
		const base = `/api/${session}/chats`;

		switch (operation) {
			case 'archiveChat':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${chatId}/archive`);
			case 'deleteChat':
				return bunwaApiRequest.call(ctx, 'DELETE', `${base}/${chatId}`);
			case 'deleteMessage':
				return bunwaApiRequest.call(ctx, 'DELETE', `${base}/${chatId}/messages/${messageId}`);
			case 'editMessage': {
				const text = ctx.getNodeParameter('text', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'PUT', `${base}/${chatId}/messages/${messageId}`, { text });
			}
			case 'get':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${chatId}`);
			case 'getMessage':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${chatId}/messages/${messageId}`);
			case 'getMessages': {
				const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
				const offset = ctx.getNodeParameter('offset', itemIndex, 0) as number;
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${chatId}/messages`, undefined, { limit, offset });
			}
			case 'getOverview':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/overview`);
			case 'getPicture':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${chatId}/picture`);
			case 'getReactions':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${chatId}/messages/${messageId}/reactions`);
			case 'list':
				return bunwaApiRequest.call(ctx, 'GET', base);
			case 'markChatRead':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${chatId}/read`);
			case 'markChatUnread':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${chatId}/unread`);
			case 'markMessagesRead': {
				const messageIds = splitList(ctx.getNodeParameter('messageIds', itemIndex, ''));
				const days = ctx.getNodeParameter('days', itemIndex, 1) as number;
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${chatId}/messages/read`, {
					messages: messageIds.length > 0 ? messageIds : undefined,
					days,
				});
			}
			case 'pinMessage': {
				const duration = ctx.getNodeParameter('duration', itemIndex, 7) as number;
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${chatId}/messages/${messageId}/pin`, { duration });
			}
			case 'unarchiveChat':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${chatId}/unarchive`);
			case 'unpinMessage':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${chatId}/messages/${messageId}/unpin`);
			default:
				throw new Error(`Unsupported chat operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const chatRoutes: Record<string, string> = {
	list: 'GET /api/{session}/chats',
	getOverview: 'GET /api/{session}/chats/overview',
	get: 'GET /api/{session}/chats/{chatId}',
	deleteChat: 'DELETE /api/{session}/chats/{chatId}',
	getMessages: 'GET /api/{session}/chats/{chatId}/messages',
	getMessage: 'GET /api/{session}/chats/{chatId}/messages/{messageId}',
	deleteMessage: 'DELETE /api/{session}/chats/{chatId}/messages/{messageId}',
	editMessage: 'PUT /api/{session}/chats/{chatId}/messages/{messageId}',
	pinMessage: 'POST /api/{session}/chats/{chatId}/messages/{messageId}/pin',
	unpinMessage: 'POST /api/{session}/chats/{chatId}/messages/{messageId}/unpin',
	markMessagesRead: 'POST /api/{session}/chats/{chatId}/messages/read',
	getReactions: 'GET /api/{session}/chats/{chatId}/messages/{messageId}/reactions',
	markChatRead: 'POST /api/{session}/chats/{chatId}/read',
	markChatUnread: 'POST /api/{session}/chats/{chatId}/unread',
	archiveChat: 'POST /api/{session}/chats/{chatId}/archive',
	unarchiveChat: 'POST /api/{session}/chats/{chatId}/unarchive',
	getPicture: 'GET /api/{session}/chats/{chatId}/picture',
};

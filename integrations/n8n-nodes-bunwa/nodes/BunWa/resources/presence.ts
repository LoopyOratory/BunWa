import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	bunwaApiRequest,
	chatIdField,
	forOperations,
	optional,
	sessionField,
	type ResourceModule,
} from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{ name: 'Get All', value: 'getAll', action: 'Get the known presence of all chats' },
	{ name: 'Get for Chat', value: 'getForChat', action: 'Get the last known presence of a chat' },
	{ name: 'Set Own', value: 'setOwn', action: 'Set the presence of the account' },
	{ name: 'Subscribe', value: 'subscribe', action: 'Subscribe to the presence updates of a chat' },
];

const properties: INodeProperties[] = [
	sessionField('Session to read or set the presence on'),
	...forOperations(
		[chatIdField('Chat to read the last known presence of, for example 15551234567@c.us')],
		['getForChat', 'subscribe'],
	),
	...forOperations(
		[
			{
				displayName: 'Presence',
				name: 'presence',
				type: 'options',
				default: 'online',
				description:
					'Presence to set for the account. online and offline are sent to WhatsApp as available and unavailable.',
				options: [
					{ name: 'Offline', value: 'offline' },
					{ name: 'Online', value: 'online' },
					{ name: 'Paused', value: 'paused' },
					{ name: 'Recording', value: 'recording' },
					{ name: 'Typing', value: 'typing' },
				],
			},
			{
				displayName: 'Chat ID',
				name: 'chatId',
				type: 'string',
				default: '',
				placeholder: '15551234567@c.us',
				description: 'Optional chat to target the presence at; leave empty to set it for the whole account',
			},
		],
		['setOwn'],
	),
];

export const presenceResource: ResourceModule = {
	value: 'presence',
	name: 'Presence',
	defaultOperation: 'getAll',
	description: 'Read and set WhatsApp presence',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;

		switch (operation) {
			case 'getAll':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/presence`);
			case 'getForChat': {
				const chatId = ctx.getNodeParameter('chatId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/presence/${chatId}`);
			}
			case 'setOwn': {
				const presence = ctx.getNodeParameter('presence', itemIndex) as string;
				const chatId = optional(ctx.getNodeParameter('chatId', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/presence`, { presence, chatId });
			}
			case 'subscribe': {
				const chatId = ctx.getNodeParameter('chatId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/presence/${chatId}/subscribe`);
			}
			default:
				throw new Error(`Unsupported presence operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const presenceRoutes: Record<string, string> = {
	getAll: 'GET /api/{session}/presence',
	getForChat: 'GET /api/{session}/presence/{chatId}',
	setOwn: 'POST /api/{session}/presence',
	subscribe: 'POST /api/{session}/presence/{chatId}/subscribe',
};

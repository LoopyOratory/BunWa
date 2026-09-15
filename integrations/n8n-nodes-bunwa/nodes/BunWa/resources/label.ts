import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	bunwaApiRequest,
	chatIdField,
	forOperations,
	optional,
	sessionField,
	splitList,
	type ResourceModule,
} from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{ name: 'Create', value: 'create', action: 'Create a label' },
	{ name: 'Delete', value: 'delete', action: 'Delete a label' },
	{ name: 'Get Chats for Label', value: 'getChatsForLabel', action: 'List the chats a label is on' },
	{ name: 'Get Labels for Chat', value: 'getLabelsForChat', action: 'List the labels of a chat' },
	{ name: 'List', value: 'list', action: 'List all labels' },
	{ name: 'Set Labels for Chat', value: 'setLabelsForChat', action: 'Replace the labels of a chat' },
	{ name: 'Update', value: 'update', action: 'Update a label' },
];

/** Operations that address one label. */
const labelOperations = ['delete', 'getChatsForLabel', 'update'];

/** Operations that address one chat. */
const chatOperations = ['getLabelsForChat', 'setLabelsForChat'];

const labelIdField: INodeProperties = {
	displayName: 'Label ID',
	name: 'labelId',
	type: 'string',
	default: '',
	required: true,
	placeholder: '1',
	description: 'ID of the label, as returned by the list operation',
};

const properties: INodeProperties[] = [
	sessionField('Session that owns the labels'),
	...forOperations([labelIdField], labelOperations),
	...forOperations([chatIdField('Chat to read or change the labels of')], chatOperations),
	...forOperations(
		[
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description:
					'Name of the label. Required when creating one; when updating, leave it empty to keep the current name.',
			},
			{
				displayName: 'Colour',
				name: 'color',
				type: 'string',
				default: '',
				placeholder: '3',
				description:
					"Label colour: WhatsApp's numeric colour index (0 to 19) or a hex string such as #FF5733. The server does not convert between the two formats and the WhatsApp colour mapping is not round-tripped, so the colour reported back may differ from the one sent.",
			},
		],
		['create', 'update'],
	),
	...forOperations(
		[
			{
				displayName: 'Labels',
				name: 'labels',
				type: 'string',
				default: '',
				required: true,
				placeholder: '1, 4, 7',
				description: 'Comma-separated label IDs to apply; this replaces the labels currently on the chat',
			},
		],
		['setLabelsForChat'],
	),
];

export const labelResource: ResourceModule = {
	value: 'label',
	name: 'Label',
	defaultOperation: 'list',
	description: 'Manage WhatsApp labels and the chats they are applied to',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;

		switch (operation) {
			case 'list':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/labels`);
			case 'create': {
				const name = optional(ctx.getNodeParameter('name', itemIndex, '')) as string | undefined;
				const color = optional(ctx.getNodeParameter('color', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/labels`, { name, color });
			}
			case 'update': {
				const labelId = ctx.getNodeParameter('labelId', itemIndex) as string;
				const name = optional(ctx.getNodeParameter('name', itemIndex, '')) as string | undefined;
				const color = optional(ctx.getNodeParameter('color', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'PUT', `/api/${session}/labels/${labelId}`, { name, color });
			}
			case 'delete': {
				const labelId = ctx.getNodeParameter('labelId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'DELETE', `/api/${session}/labels/${labelId}`);
			}
			case 'getChatsForLabel': {
				const labelId = ctx.getNodeParameter('labelId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/labels/${labelId}/chats`);
			}
			case 'getLabelsForChat': {
				const chatId = ctx.getNodeParameter('chatId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/labels/chats/${chatId}`);
			}
			case 'setLabelsForChat': {
				const chatId = ctx.getNodeParameter('chatId', itemIndex) as string;
				const labels = splitList(ctx.getNodeParameter('labels', itemIndex, ''));
				return bunwaApiRequest.call(ctx, 'PUT', `/api/${session}/labels/chats/${chatId}`, { labels });
			}
			default:
				throw new Error(`Unsupported label operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const labelRoutes: Record<string, string> = {
	list: 'GET /api/{session}/labels',
	create: 'POST /api/{session}/labels',
	update: 'PUT /api/{session}/labels/{labelId}',
	delete: 'DELETE /api/{session}/labels/{labelId}',
	getChatsForLabel: 'GET /api/{session}/labels/{labelId}/chats',
	getLabelsForChat: 'GET /api/{session}/labels/chats/{chatId}',
	setLabelsForChat: 'PUT /api/{session}/labels/chats/{chatId}',
};

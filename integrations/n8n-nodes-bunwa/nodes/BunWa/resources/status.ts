import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	bunwaApiRequest,
	forOperations,
	messageIdField,
	optional,
	sessionField,
	type ResourceModule,
} from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{ name: 'Delete', value: 'delete', action: 'Delete a status' },
	{ name: 'Generate Message ID', value: 'generateId', action: 'Generate a message ID for a status' },
	{ name: 'Send Image', value: 'sendImage', action: 'Post an image status' },
	{ name: 'Send Text', value: 'sendText', action: 'Post a text status' },
	{ name: 'Send Video', value: 'sendVideo', action: 'Post a video status' },
	{ name: 'Send Voice', value: 'sendVoice', action: 'Post a voice status' },
];

/** Operations that upload a file. */
const fileOperations = ['sendImage', 'sendVoice', 'sendVideo'];

const properties: INodeProperties[] = [
	sessionField('Session that posts the status'),
	...forOperations(
		[
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				required: true,
				description: 'Text shown on the status',
			},
			{
				displayName: 'Background Colour',
				name: 'backgroundColor',
				type: 'string',
				default: '',
				placeholder: '#008000',
				description: 'Background colour of the text status as a hex colour',
			},
			{
				displayName: 'Font',
				name: 'font',
				type: 'string',
				default: '',
				placeholder: '3',
				description: 'Font index of the text status, as accepted by WhatsApp (0 to 5)',
			},
		],
		['sendText'],
	),
	...forOperations(
		[
			{
				displayName: 'File',
				name: 'file',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com/photo.png',
				description: 'File to post as the status. BunWa accepts an HTTP URL, a base64 string or a data URL.',
			},
		],
		fileOperations,
	),
	...forOperations(
		[
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'Caption shown with the image or video status',
			},
		],
		['sendImage', 'sendVideo'],
	),
	...forOperations(
		[
			{
				displayName: 'Convert',
				name: 'convert',
				type: 'boolean',
				default: true,
				description:
					'Whether to transcode the audio before posting. Voice statuses are converted to OGG/Opus; disable it when the file already is OGG/Opus.',
			},
		],
		['sendVoice'],
	),
	...forOperations(
		[
			{
				...messageIdField(),
				description: 'ID of the status to delete, as returned when the status was posted or by Generate Message ID',
			},
		],
		['delete'],
	),
];

export const statusResource: ResourceModule = {
	value: 'status',
	name: 'Status',
	defaultOperation: 'sendText',
	description: 'Post and delete WhatsApp statuses (stories)',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;

		switch (operation) {
			case 'sendText': {
				const text = ctx.getNodeParameter('text', itemIndex) as string;
				const backgroundColor = optional(ctx.getNodeParameter('backgroundColor', itemIndex, '')) as string | undefined;
				const font = optional(ctx.getNodeParameter('font', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/status/text`, {
					text,
					backgroundColor,
					font,
				});
			}
			case 'sendImage': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				const caption = optional(ctx.getNodeParameter('caption', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/status/image`, { file, caption });
			}
			case 'sendVoice': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				const convert = ctx.getNodeParameter('convert', itemIndex, true) as boolean;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/status/voice`, { file, convert });
			}
			case 'sendVideo': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				const caption = optional(ctx.getNodeParameter('caption', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/status/video`, { file, caption });
			}
			case 'delete': {
				const messageId = ctx.getNodeParameter('messageId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/status/delete`, { id: messageId });
			}
			case 'generateId':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/status/new-message-id`);
			default:
				throw new Error(`Unsupported status operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const statusRoutes: Record<string, string> = {
	sendText: 'POST /api/{session}/status/text',
	sendImage: 'POST /api/{session}/status/image',
	sendVoice: 'POST /api/{session}/status/voice',
	sendVideo: 'POST /api/{session}/status/video',
	delete: 'POST /api/{session}/status/delete',
	generateId: 'GET /api/{session}/status/new-message-id',
};

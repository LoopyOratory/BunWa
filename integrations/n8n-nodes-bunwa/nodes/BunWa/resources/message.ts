import type { IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	bunwaApiRequest,
	chatIdField,
	forOperations,
	messageIdField,
	optional,
	sessionField,
	type ResourceModule,
} from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{ name: 'Cancel Batch', value: 'cancelBatch', action: 'Cancel a bulk message batch' },
	{ name: 'Check Number', value: 'checkNumber', action: 'Check whether a number is on WhatsApp' },
	{ name: 'Forward', value: 'forward', action: 'Forward a message to a chat' },
	{ name: 'Generate Message ID', value: 'generateMessageId', action: 'Generate a new message ID' },
	{ name: 'Get Batch Status', value: 'getBatchStatus', action: 'Get the status of a bulk message batch' },
	{ name: 'Mark as Read', value: 'markAsRead', action: 'Mark the messages of a chat as seen' },
	{ name: 'React', value: 'react', action: 'React to a message' },
	{ name: 'Reply', value: 'reply', action: 'Reply to a message' },
	{ name: 'Send Bulk', value: 'sendBulk', action: 'Send a message to many recipients' },
	{ name: 'Send Buttons', value: 'sendButtons', action: 'Send interactive buttons' },
	{ name: 'Send Contact VCard', value: 'sendContactVcard', action: 'Send one or more contact cards' },
	{ name: 'Send File', value: 'sendFile', action: 'Send a document' },
	{ name: 'Send Image', value: 'sendImage', action: 'Send an image' },
	{ name: 'Send Link Preview', value: 'sendLinkPreview', action: 'Send a link with a preview card' },
	{ name: 'Send List', value: 'sendList', action: 'Send an interactive list message' },
	{ name: 'Send Location', value: 'sendLocation', action: 'Send a location' },
	{ name: 'Send Poll', value: 'sendPoll', action: 'Send a poll' },
	{ name: 'Send Text', value: 'sendText', action: 'Send a text message' },
	{ name: 'Send Video', value: 'sendVideo', action: 'Send a video' },
	{ name: 'Send Voice', value: 'sendVoice', action: 'Send a voice note' },
	{ name: 'Star', value: 'star', action: 'Star or unstar a message' },
	{ name: 'Start Typing', value: 'startTyping', action: 'Show a typing indicator in a chat' },
	{ name: 'Stop Typing', value: 'stopTyping', action: 'Stop the typing indicator in a chat' },
];

/** Operations whose request body addresses one chat. */
const chatOperations = [
	'forward',
	'markAsRead',
	'react',
	'reply',
	'sendButtons',
	'sendContactVcard',
	'sendFile',
	'sendImage',
	'sendLinkPreview',
	'sendList',
	'sendLocation',
	'sendPoll',
	'sendText',
	'sendVideo',
	'sendVoice',
	'star',
	'startTyping',
	'stopTyping',
];

/** Operations that upload a file or media. */
const fileOperations = ['sendFile', 'sendImage', 'sendVideo', 'sendVoice'];

/** Operations that quote an existing message. */
const messageIdOperations = ['forward', 'react', 'reply', 'star'];

/** Parses a JSON node parameter, tolerating objects passed through expressions. */
function parseJson<T>(value: unknown, fallback: T): T {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value === 'string') return JSON.parse(value) as T;
	return value as T;
}

const properties: INodeProperties[] = [
	sessionField('Session to operate on'),
	...forOperations(
		[
			chatIdField(
				'Chat ID, for example 15551234567@c.us or a group ID ending in @g.us. The chat must exist on the account.',
			),
		],
		chatOperations,
	),
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
				description: 'Text of the message',
			},
		],
		['reply', 'sendText'],
	),
	...forOperations(
		[
			{
				displayName: 'Link Preview',
				name: 'linkPreview',
				type: 'boolean',
				default: true,
				description: 'Whether to render a preview card for links found in the text',
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
				description:
					'File to send. BunWa accepts an HTTP URL, a base64 string or a data URL; stickers must be base64-encoded WebP or PNG',
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
				description: 'Caption shown under the image, file or video',
			},
		],
		['sendFile', 'sendImage', 'sendVideo'],
	),
	...forOperations(
		[
			{
				displayName: 'Convert',
				name: 'convert',
				type: 'boolean',
				default: true,
				description:
					'Whether to transcode the media before sending. Voice notes are converted to OGG/Opus; disable it when the file already is OGG/Opus.',
			},
		],
		['sendVideo', 'sendVoice'],
	),
	...forOperations(
		[
			{
				displayName: 'Latitude',
				name: 'latitude',
				type: 'number',
				default: 0,
				required: true,
				description: 'Latitude of the location',
			},
			{
				displayName: 'Longitude',
				name: 'longitude',
				type: 'number',
				default: 0,
				required: true,
				description: 'Longitude of the location',
			},
		],
		['sendLocation'],
	),
	...forOperations(
		[
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Optional title shown with the location or link preview',
			},
		],
		['sendLinkPreview', 'sendLocation'],
	),
	...forOperations(
		[
			{
				displayName: 'Poll Question',
				name: 'pollName',
				type: 'string',
				default: '',
				required: true,
				description: 'Question shown at the top of the poll',
			},
			{
				displayName: 'Options',
				name: 'pollOptions',
				type: 'collection',
				typeOptions: { multipleValues: true },
				default: {},
				placeholder: 'Add Option',
				description: 'Answer choices of the poll, at least one',
				options: [
					{
						displayName: 'Option',
						name: 'name',
						type: 'string',
						default: '',
					},
				],
			},
			{
				displayName: 'Multiple Answers',
				name: 'pollMultipleAnswers',
				type: 'boolean',
				default: false,
				description: 'Whether voters may select more than one option',
			},
		],
		['sendPoll'],
	),
	...forOperations(
		[
			{
				displayName: 'Contacts (JSON)',
				name: 'contacts',
				type: 'json',
				default: '[\n  { "name": "Ada Lovelace", "phone": "15551234567" }\n]',
				required: true,
				description: 'Array of contacts, each with a name and a phone field',
			},
		],
		['sendContactVcard'],
	),
	...forOperations(
		[
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com',
				description: 'Link to send with a preview card',
			},
		],
		['sendLinkPreview'],
	),
	...forOperations(
		[
			{
				displayName: 'Buttons (JSON)',
				name: 'buttons',
				type: 'json',
				default:
					'[\n  { "type": "reply", "text": "Yes" },\n  { "type": "url", "text": "Open site", "url": "https://example.com" }\n]',
				required: true,
				description:
					'Array of buttons. type is reply, url, call or copy; url needs url, call needs phoneNumber, copy needs copyCode',
			},
			{
				displayName: 'Header',
				name: 'header',
				type: 'string',
				default: '',
				description: 'Optional header text',
			},
			{
				displayName: 'Body',
				name: 'body',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'Optional message body text',
			},
			{
				displayName: 'Footer',
				name: 'footer',
				type: 'string',
				default: '',
				description: 'Optional footer text',
			},
		],
		['sendButtons'],
	),
	...forOperations(
		[
			{
				displayName: 'Title',
				name: 'listTitle',
				type: 'string',
				default: '',
				required: true,
				description: 'Header title of the list message',
			},
			{
				displayName: 'Description',
				name: 'listDescription',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				required: true,
				description: 'Body text shown above the list button',
			},
			{
				displayName: 'Button',
				name: 'listButton',
				type: 'string',
				default: '',
				required: true,
				description: 'Label of the button that opens the list',
			},
			{
				displayName: 'Sections (JSON)',
				name: 'listSections',
				type: 'json',
				default:
					'[\n  {\n    "title": "Options",\n    "rows": [{ "title": "First option", "description": "Optional hint" }]\n  }\n]',
				required: true,
				description: 'Array of sections, each with a title and rows of {title, description?, rowId?}',
			},
		],
		['sendList'],
	),
	...forOperations(
		[
			{
				displayName: 'Reaction',
				name: 'reaction',
				type: 'string',
				default: '',
				required: true,
				placeholder: '👍',
				description: 'Emoji to react with',
			},
		],
		['react'],
	),
	...forOperations(
		[
			{
				displayName: 'Star',
				name: 'star',
				type: 'boolean',
				default: true,
				description: 'Whether to star (true) or unstar (false) the message',
			},
		],
		['star'],
	),
	...forOperations(
		[
			{
				displayName: 'Phone Number',
				name: 'phone',
				type: 'string',
				default: '',
				required: true,
				placeholder: '15551234567',
				description: 'Phone number in international format, without + or spaces',
			},
		],
		['checkNumber'],
	),
	...forOperations(
		[
			{
				displayName: 'Recipients (JSON)',
				name: 'recipients',
				type: 'json',
				default: '[\n  { "chatId": "15551234567@c.us" }\n]',
				required: true,
				description: 'Array of recipients, each with a chatId and optional variables for the template',
			},
			{
				displayName: 'Content (JSON)',
				name: 'content',
				type: 'json',
				default: '{\n  "text": "Hello {{name}}"\n}',
				required: true,
				description:
					'Message content: text and/or caption, plus at most one of image, video, audio or document objects',
			},
			{
				displayName: 'Delay (Ms)',
				name: 'delayMs',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 1000,
				description: 'Delay between messages in milliseconds',
			},
			{
				displayName: 'Randomize Delay',
				name: 'randomizeDelay',
				type: 'boolean',
				default: true,
				description: 'Whether to add a random jitter to the delay between messages',
			},
			{
				displayName: 'Stop on Error',
				name: 'stopOnError',
				type: 'boolean',
				default: false,
				description: 'Whether to stop the batch when a message fails',
			},
			{
				displayName: 'Template',
				name: 'template',
				type: 'string',
				default: '',
				description: 'Template with {{variable}} placeholders replaced from each recipient',
			},
		],
		['sendBulk'],
	),
	...forOperations(
		[
			{
				displayName: 'Batch ID',
				name: 'batchId',
				type: 'string',
				default: '',
				required: true,
				description: 'ID returned when the batch was created',
			},
		],
		['cancelBatch', 'getBatchStatus'],
	),
];

export const messageResource: ResourceModule = {
	value: 'message',
	name: 'Message',
	defaultOperation: 'sendText',
	description: 'Send WhatsApp messages, media and interactive content',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;
		const chatId = optional(ctx.getNodeParameter('chatId', itemIndex, '')) as string | undefined;
		const messageId = optional(ctx.getNodeParameter('messageId', itemIndex, '')) as string | undefined;
		const base = { session, chatId };

		switch (operation) {
			case 'cancelBatch': {
				const batchId = ctx.getNodeParameter('batchId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/messages/batch/${batchId}/cancel`);
			}
			case 'checkNumber': {
				const phone = ctx.getNodeParameter('phone', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', '/api/checkNumberStatus', undefined, { session, phone });
			}
			case 'forward':
				return bunwaApiRequest.call(ctx, 'POST', '/api/forwardMessage', { ...base, messageId });
			case 'generateMessageId':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/new-message-id`);
			case 'getBatchStatus': {
				const batchId = ctx.getNodeParameter('batchId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/messages/batch/${batchId}`);
			}
			case 'markAsRead':
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendSeen', base);
			case 'react': {
				const reaction = ctx.getNodeParameter('reaction', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'PUT', '/api/reaction', { ...base, messageId, reaction });
			}
			case 'reply': {
				const text = ctx.getNodeParameter('text', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'POST', '/api/reply', { ...base, text, messageId });
			}
			case 'sendBulk': {
				const recipients = parseJson<IDataObject[]>(ctx.getNodeParameter('recipients', itemIndex, '[]'), []);
				const content = parseJson<IDataObject>(ctx.getNodeParameter('content', itemIndex, '{}'), {});
				const delayMs = ctx.getNodeParameter('delayMs', itemIndex, 1000) as number;
				const randomizeDelay = ctx.getNodeParameter('randomizeDelay', itemIndex, true) as boolean;
				const stopOnError = ctx.getNodeParameter('stopOnError', itemIndex, false) as boolean;
				const template = optional(ctx.getNodeParameter('template', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/messages/send-bulk`, {
					recipients,
					content,
					delayMs,
					randomizeDelay,
					stopOnError,
					template,
				});
			}
			case 'sendButtons': {
				const buttons = parseJson<IDataObject[]>(ctx.getNodeParameter('buttons', itemIndex, '[]'), []);
				const header = optional(ctx.getNodeParameter('header', itemIndex, '')) as string | undefined;
				const body = optional(ctx.getNodeParameter('body', itemIndex, '')) as string | undefined;
				const footer = optional(ctx.getNodeParameter('footer', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendButtons', { ...base, buttons, header, body, footer });
			}
			case 'sendContactVcard': {
				const contacts = parseJson<IDataObject[]>(ctx.getNodeParameter('contacts', itemIndex, '[]'), []);
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendContactVcard', { ...base, contacts });
			}
			case 'sendFile': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				const caption = optional(ctx.getNodeParameter('caption', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendFile', { ...base, file, caption });
			}
			case 'sendImage': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				const caption = optional(ctx.getNodeParameter('caption', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendImage', { ...base, file, caption });
			}
			case 'sendLinkPreview': {
				const url = ctx.getNodeParameter('url', itemIndex) as string;
				const title = optional(ctx.getNodeParameter('title', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendLinkPreview', { ...base, url, title });
			}
			case 'sendList': {
				const title = ctx.getNodeParameter('listTitle', itemIndex) as string;
				const description = ctx.getNodeParameter('listDescription', itemIndex) as string;
				const button = ctx.getNodeParameter('listButton', itemIndex) as string;
				const sections = parseJson<IDataObject[]>(ctx.getNodeParameter('listSections', itemIndex, '[]'), []);
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendList', { ...base, title, description, button, sections });
			}
			case 'sendLocation': {
				const latitude = ctx.getNodeParameter('latitude', itemIndex) as number;
				const longitude = ctx.getNodeParameter('longitude', itemIndex) as number;
				const title = optional(ctx.getNodeParameter('title', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendLocation', {
					...base,
					latitude,
					longitude,
					title,
				});
			}
			case 'sendPoll': {
				const name = ctx.getNodeParameter('pollName', itemIndex) as string;
				const rawOptions = ctx.getNodeParameter('pollOptions', itemIndex, []) as IDataObject | IDataObject[];
				const multipleAnswers = ctx.getNodeParameter('pollMultipleAnswers', itemIndex, false) as boolean;
				const choices = (Array.isArray(rawOptions) ? rawOptions : [rawOptions])
					.map((option) => (typeof option === 'string' ? option : (option?.name as string)))
					.filter(Boolean)
					.map((value) => ({ name: String(value) }));
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendPoll', {
					...base,
					poll: { name, options: choices, multipleAnswers },
				});
			}
			case 'sendText': {
				const text = ctx.getNodeParameter('text', itemIndex) as string;
				const linkPreview = ctx.getNodeParameter('linkPreview', itemIndex, true) as boolean;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendText', { ...base, text, linkPreview });
			}
			case 'sendVideo': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				const caption = optional(ctx.getNodeParameter('caption', itemIndex, '')) as string | undefined;
				const convert = ctx.getNodeParameter('convert', itemIndex, true) as boolean;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendVideo', { ...base, file, caption, convert });
			}
			case 'sendVoice': {
				const file = ctx.getNodeParameter('file', itemIndex) as string;
				const convert = ctx.getNodeParameter('convert', itemIndex, true) as boolean;
				return bunwaApiRequest.call(ctx, 'POST', '/api/sendVoice', { ...base, file, convert });
			}
			case 'star': {
				const star = ctx.getNodeParameter('star', itemIndex, true) as boolean;
				return bunwaApiRequest.call(ctx, 'PUT', '/api/star', { ...base, messageId, star });
			}
			case 'startTyping':
				return bunwaApiRequest.call(ctx, 'POST', '/api/startTyping', base);
			case 'stopTyping':
				return bunwaApiRequest.call(ctx, 'POST', '/api/stopTyping', base);
			default:
				throw new Error(`Unsupported message operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const messageRoutes: Record<string, string> = {
	sendText: 'POST /api/sendText',
	sendImage: 'POST /api/sendImage',
	sendFile: 'POST /api/sendFile',
	sendVoice: 'POST /api/sendVoice',
	sendVideo: 'POST /api/sendVideo',
	sendLocation: 'POST /api/sendLocation',
	sendPoll: 'POST /api/sendPoll',
	sendContactVcard: 'POST /api/sendContactVcard',
	sendLinkPreview: 'POST /api/sendLinkPreview',
	sendButtons: 'POST /api/sendButtons',
	sendList: 'POST /api/sendList',
	reply: 'POST /api/reply',
	forward: 'POST /api/forwardMessage',
	react: 'PUT /api/reaction',
	star: 'PUT /api/star',
	markAsRead: 'POST /api/sendSeen',
	startTyping: 'POST /api/startTyping',
	stopTyping: 'POST /api/stopTyping',
	checkNumber: 'GET /api/checkNumberStatus',
	generateMessageId: 'GET /api/{session}/new-message-id',
	sendBulk: 'POST /api/{session}/messages/send-bulk',
	getBatchStatus: 'GET /api/{session}/messages/batch/{batchId}',
	cancelBatch: 'POST /api/{session}/messages/batch/{batchId}/cancel',
};

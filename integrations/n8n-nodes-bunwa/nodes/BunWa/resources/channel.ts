import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	bunwaApiRequest,
	forOperations,
	optional,
	sessionField,
	splitList,
	type ResourceModule,
} from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{ name: 'Create', value: 'create', action: 'Create a channel' },
	{ name: 'Follow', value: 'follow', action: 'Follow a channel' },
	{ name: 'Get', value: 'get', action: 'Get a channel' },
	{ name: 'List', value: 'list', action: 'List the channels of the session' },
	{ name: 'Mute', value: 'mute', action: 'Mute a channel' },
	{ name: 'Search by Text', value: 'searchByText', action: 'Search the channel directory by text' },
	{ name: 'Search by View', value: 'searchByView', action: 'Browse the channel directory by view' },
	{ name: 'Search Categories', value: 'searchCategories', action: 'List the directory categories' },
	{ name: 'Search Countries', value: 'searchCountries', action: 'List the directory countries' },
	{ name: 'Search Views', value: 'searchViews', action: 'List the directory views' },
	{ name: 'Unfollow', value: 'unfollow', action: 'Unfollow a channel' },
	{ name: 'Unmute', value: 'unmute', action: 'Unmute a channel' },
];

/** Operations that address one channel. */
const channelOperations = ['follow', 'get', 'mute', 'unfollow', 'unmute'];

/** Operations that query the channel directory. */
const searchOperations = ['searchByView', 'searchByText'];

const channelIdField: INodeProperties = {
	displayName: 'Channel ID',
	name: 'channelId',
	type: 'string',
	default: '',
	required: true,
	placeholder: '12345678901234567890@newsletter',
	description: 'Channel JID ending in @newsletter, or the numeric channel ID',
};

const properties: INodeProperties[] = [
	sessionField('Session that owns the channels'),
	...forOperations([channelIdField], channelOperations),
	...forOperations(
		[
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				required: true,
				description: 'Name of the new channel',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'Optional description of the new channel',
			},
		],
		['create'],
	),
	...forOperations(
		[
			{
				displayName: 'View',
				name: 'view',
				type: 'string',
				default: '',
				placeholder: 'trending',
				description: 'Directory view to browse, for example trending',
			},
		],
		['searchByView'],
	),
	...forOperations(
		[
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				default: '',
				required: true,
				description: 'Text to search the channel directory for',
			},
		],
		['searchByText'],
	),
	...forOperations(
		[
			{
				displayName: 'Categories',
				name: 'categories',
				type: 'string',
				default: '',
				placeholder: 'news, sports',
				description: 'Comma-separated category filters to narrow the search down',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of channels to return',
			},
			{
				displayName: 'Start Cursor',
				name: 'startCursor',
				type: 'string',
				default: '',
				description: 'Cursor returned by a previous search, to fetch the next page',
			},
		],
		searchOperations,
	),
	...forOperations(
		[
			{
				displayName: 'Countries',
				name: 'countries',
				type: 'string',
				default: '',
				placeholder: 'US, GB',
				description: 'Comma-separated country codes to filter the directory by',
			},
		],
		['searchByView'],
	),
];

export const channelResource: ResourceModule = {
	value: 'channel',
	name: 'Channel',
	defaultOperation: 'list',
	description: 'Browse, follow and search WhatsApp channels',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;
		const channelId = optional(ctx.getNodeParameter('channelId', itemIndex, '')) as string | undefined;

		switch (operation) {
			case 'list':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/channels`);
			case 'get':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/channels/${channelId}`);
			case 'create': {
				const name = ctx.getNodeParameter('name', itemIndex) as string;
				const description = optional(ctx.getNodeParameter('description', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/channels`, { name, description });
			}
			case 'follow':
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/channels/${channelId}/follow`);
			case 'unfollow':
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/channels/${channelId}/unfollow`);
			case 'mute':
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/channels/${channelId}/mute`);
			case 'unmute':
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/channels/${channelId}/unmute`);
			case 'searchByView': {
				const view = optional(ctx.getNodeParameter('view', itemIndex, '')) as string | undefined;
				const countries = splitList(ctx.getNodeParameter('countries', itemIndex, ''));
				const categories = splitList(ctx.getNodeParameter('categories', itemIndex, ''));
				const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
				const startCursor = optional(ctx.getNodeParameter('startCursor', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/channels/search/by-view`, {
					view,
					countries: countries.length > 0 ? countries : undefined,
					categories: categories.length > 0 ? categories : undefined,
					limit,
					startCursor,
				});
			}
			case 'searchByText': {
				const text = ctx.getNodeParameter('text', itemIndex) as string;
				const categories = splitList(ctx.getNodeParameter('categories', itemIndex, ''));
				const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
				const startCursor = optional(ctx.getNodeParameter('startCursor', itemIndex, '')) as string | undefined;
				return bunwaApiRequest.call(ctx, 'POST', `/api/${session}/channels/search/by-text`, {
					text,
					categories: categories.length > 0 ? categories : undefined,
					limit,
					startCursor,
				});
			}
			case 'searchViews':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/channels/search/views`);
			case 'searchCountries':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/channels/search/countries`);
			case 'searchCategories':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/channels/search/categories`);
			default:
				throw new Error(`Unsupported channel operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const channelRoutes: Record<string, string> = {
	list: 'GET /api/{session}/channels',
	get: 'GET /api/{session}/channels/{channelId}',
	create: 'POST /api/{session}/channels',
	follow: 'POST /api/{session}/channels/{channelId}/follow',
	unfollow: 'POST /api/{session}/channels/{channelId}/unfollow',
	mute: 'POST /api/{session}/channels/{channelId}/mute',
	unmute: 'POST /api/{session}/channels/{channelId}/unmute',
	searchByView: 'POST /api/{session}/channels/search/by-view',
	searchByText: 'POST /api/{session}/channels/search/by-text',
	searchViews: 'GET /api/{session}/channels/search/views',
	searchCountries: 'GET /api/{session}/channels/search/countries',
	searchCategories: 'GET /api/{session}/channels/search/categories',
};

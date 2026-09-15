import type { IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { bunwaApiRequest, forOperations, optional, sessionField, type ResourceModule } from '../GenericFunctions';

const operations: INodePropertyOptions[] = [
	{
		name: 'Check Exists',
		value: 'checkExists',
		action: 'Check whether a phone number is on WhatsApp',
	},
	{ name: 'Count LIDs', value: 'countLids', action: 'Count the LIDs known to the session' },
	{
		name: 'Delete Profile Picture',
		value: 'deleteProfilePicture',
		action: 'Delete the profile picture of the account',
		description: 'Requires the PLUS tier of the BunWa server',
	},
	{
		name: 'Find LID by Phone',
		value: 'findLidByPhone',
		action: 'Find the LID linked to a phone number',
	},
	{ name: 'Get LID', value: 'getLid', action: 'Get the phone number behind a LID' },
	{ name: 'Get Profile', value: 'getProfile', action: 'Get the profile of the account' },
	{
		name: 'Get Profile Picture',
		value: 'getProfilePicture',
		action: 'Get the profile picture URL of a contact',
	},
	{ name: 'List Contacts', value: 'list', action: 'List all contacts of the session' },
	{ name: 'List LIDs', value: 'listLids', action: 'List the LIDs known to the session' },
	{
		name: 'Set Profile Name',
		value: 'setProfileName',
		action: 'Set the profile name of the account',
	},
	{
		name: 'Set Profile Picture',
		value: 'setProfilePicture',
		action: 'Set the profile picture of the account',
		description: 'Requires the PLUS tier of the BunWa server',
	},
	{
		name: 'Set Profile Status',
		value: 'setProfileStatus',
		action: 'Set the about text of the account',
	},
];

/** Operations that address one LID. */
const lidOperations = ['getLid'];

const properties: INodeProperties[] = [
	sessionField('Session that owns the contacts'),
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
		['checkExists'],
	),
	...forOperations(
		[
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				default: '',
				required: true,
				placeholder: '15551234567@c.us',
				description: 'Contact JID to fetch the profile picture of',
			},
		],
		['getProfilePicture'],
	),
	...forOperations(
		[
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of LIDs to return',
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of LIDs to skip',
			},
		],
		['listLids'],
	),
	...forOperations(
		[
			{
				displayName: 'LID',
				name: 'lid',
				type: 'string',
				default: '',
				required: true,
				placeholder: '123456789012345@lid',
				description: 'LID to resolve; the @lid suffix is added when it is missing',
			},
		],
		lidOperations,
	),
	...forOperations(
		[
			{
				displayName: 'Phone Number',
				name: 'phoneNumber',
				type: 'string',
				default: '',
				required: true,
				placeholder: '15551234567',
				description: 'Phone number to look the LID up for',
			},
		],
		['findLidByPhone'],
	),
	...forOperations(
		[
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				required: true,
				description: 'New profile name of the account',
			},
		],
		['setProfileName'],
	),
	...forOperations(
		[
			{
				displayName: 'Status',
				name: 'status',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Available',
				description: 'New about text of the account',
			},
		],
		['setProfileStatus'],
	),
	...forOperations(
		[
			{
				displayName: 'File (JSON)',
				name: 'file',
				type: 'json',
				default: '{\n  "url": "https://example.com/avatar.png"\n}',
				required: true,
				description:
					'Profile picture to set, sent as the request body itself: use {"url": "https://..."} for a remote file or {"data": "<base64>", "mimetype": "image/jpeg"} for a base64 file',
			},
		],
		['setProfilePicture'],
	),
];

export const contactResource: ResourceModule = {
	value: 'contact',
	name: 'Contact',
	defaultOperation: 'list',
	description: 'Look up contacts, LIDs and the account profile',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;

		switch (operation) {
			case 'list':
				return bunwaApiRequest.call(ctx, 'GET', '/api/contacts/all', undefined, { session });
			case 'checkExists': {
				const phone = ctx.getNodeParameter('phone', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', '/api/contacts/check-exists', undefined, { session, phone });
			}
			case 'getProfilePicture': {
				const contactId = ctx.getNodeParameter('contactId', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', '/api/contacts/profile-picture', undefined, { session, contactId });
			}
			case 'listLids': {
				const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
				const offset = ctx.getNodeParameter('offset', itemIndex, 0) as number;
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/lids`, undefined, { limit, offset });
			}
			case 'countLids':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/lids/count`);
			case 'getLid': {
				const lid = ctx.getNodeParameter('lid', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/lids/${lid}`);
			}
			case 'findLidByPhone': {
				const phoneNumber = ctx.getNodeParameter('phoneNumber', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/lids/pn/${phoneNumber}`);
			}
			case 'getProfile':
				return bunwaApiRequest.call(ctx, 'GET', `/api/${session}/profile`);
			case 'setProfileName': {
				const name = ctx.getNodeParameter('name', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'PUT', `/api/${session}/profile/name`, { name });
			}
			case 'setProfileStatus': {
				const status = ctx.getNodeParameter('status', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'PUT', `/api/${session}/profile/status`, { status });
			}
			case 'setProfilePicture': {
				const raw = ctx.getNodeParameter('file', itemIndex, '{}') as string | IDataObject;
				const file = typeof raw === 'string' ? (JSON.parse(raw || '{}') as IDataObject) : raw;
				return bunwaApiRequest.call(ctx, 'PUT', `/api/${session}/profile/picture`, file);
			}
			case 'deleteProfilePicture':
				return bunwaApiRequest.call(ctx, 'DELETE', `/api/${session}/profile/picture`);
			default:
				throw new Error(`Unsupported contact operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const contactRoutes: Record<string, string> = {
	list: 'GET /api/contacts/all',
	checkExists: 'GET /api/contacts/check-exists',
	getProfilePicture: 'GET /api/contacts/profile-picture',
	listLids: 'GET /api/{session}/lids',
	countLids: 'GET /api/{session}/lids/count',
	getLid: 'GET /api/{session}/lids/{lid}',
	findLidByPhone: 'GET /api/{session}/lids/pn/{phoneNumber}',
	getProfile: 'GET /api/{session}/profile',
	setProfileName: 'PUT /api/{session}/profile/name',
	setProfileStatus: 'PUT /api/{session}/profile/status',
	setProfilePicture: 'PUT /api/{session}/profile/picture',
	deleteProfilePicture: 'DELETE /api/{session}/profile/picture',
};

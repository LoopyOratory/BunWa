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
	{ name: 'Add Participants', value: 'addParticipants', action: 'Add participants to a group' },
	{ name: 'Count Groups', value: 'count', action: 'Count the groups of a session' },
	{ name: 'Create Group', value: 'create', action: 'Create a group' },
	{ name: 'Demote Participants', value: 'demoteParticipants', action: 'Demote group admins to participants' },
	{ name: 'Get Group', value: 'get', action: 'Get a group' },
	{ name: 'Get Invite Code', value: 'getInviteCode', action: 'Get the invite code of a group' },
	{ name: 'Get Join Info', value: 'getJoinInfo', action: 'Get info about a group invite' },
	{ name: 'Get Participants', value: 'getParticipants', action: 'Get the participants of a group' },
	{ name: 'Get Participants V2', value: 'getParticipantsV2', action: 'Get the participants of a group (v2)' },
	{ name: 'Get Picture', value: 'getPicture', action: 'Get the picture of a group' },
	{ name: 'Get Security Settings', value: 'getSecuritySettings', action: 'Get the security settings of a group' },
	{ name: 'Join Group', value: 'join', action: 'Join a group with an invite code' },
	{ name: 'Leave Group', value: 'leave', action: 'Leave a group' },
	{ name: 'List Groups', value: 'list', action: 'List groups' },
	{ name: 'Promote Participants', value: 'promoteParticipants', action: 'Promote participants to group admins' },
	{ name: 'Refresh Groups', value: 'refresh', action: 'Refresh the group cache' },
	{ name: 'Remove Participants', value: 'removeParticipants', action: 'Remove participants from a group' },
	{ name: 'Revoke Invite Code', value: 'revokeInviteCode', action: 'Revoke and regenerate the invite code' },
	{ name: 'Set Description', value: 'setDescription', action: 'Set the description of a group' },
	{ name: 'Set Subject', value: 'setSubject', action: 'Set the subject of a group' },
	{
		name: 'Update Security Settings',
		value: 'updateSecuritySettings',
		action: 'Update the security settings of a group',
	},
];

/** Operations that address one group. */
const groupOperations = [
	'addParticipants',
	'demoteParticipants',
	'get',
	'getInviteCode',
	'getParticipants',
	'getParticipantsV2',
	'getPicture',
	'getSecuritySettings',
	'leave',
	'promoteParticipants',
	'removeParticipants',
	'revokeInviteCode',
	'setDescription',
	'setSubject',
	'updateSecuritySettings',
];

/** Operations that take a participant list. */
const participantOperations = [
	'addParticipants',
	'create',
	'demoteParticipants',
	'promoteParticipants',
	'removeParticipants',
];

const groupIdField: INodeProperties = {
	displayName: 'Group ID',
	name: 'groupId',
	type: 'string',
	default: '',
	required: true,
	placeholder: '123456789012345678@g.us',
	description: 'Group JID, for example 123456789012345678@g.us',
};

const participantsField: INodeProperties = {
	displayName: 'Participants',
	name: 'participants',
	type: 'string',
	default: '',
	required: true,
	placeholder: '15551234567@c.us, 15559876543@c.us',
	description: 'Comma-separated participant JIDs, for example 15551234567@c.us',
};

const properties: INodeProperties[] = [
	sessionField('Session that owns the groups'),
	...forOperations([groupIdField], groupOperations),
	...forOperations(
		[
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				required: true,
				description: 'Subject of the new group',
			},
		],
		['create'],
	),
	...forOperations([participantsField], participantOperations),
	...forOperations(
		[
			{
				displayName: 'Invite Code',
				name: 'inviteCode',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'AbCdEfGhIjKlMnOpQrStUv',
				description: 'Invite code from a group invite link, the part after https://chat.whatsapp.com/',
			},
		],
		['getJoinInfo', 'join'],
	),
	...forOperations(
		[
			{
				displayName: 'Subject',
				name: 'subject',
				type: 'string',
				default: '',
				required: true,
				description: 'New subject (name) of the group',
			},
		],
		['setSubject'],
	),
	...forOperations(
		[
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				required: true,
				description: 'New description of the group',
			},
		],
		['setDescription'],
	),
	...forOperations(
		[
			{
				displayName: 'Only Admins Can Edit Group Info',
				name: 'infoAdminOnly',
				type: 'boolean',
				default: false,
				description: 'Whether only admins may edit the group subject, description and picture',
			},
			{
				displayName: 'Only Admins Can Send Messages',
				name: 'messagesAdminOnly',
				type: 'boolean',
				default: false,
				description: 'Whether only admins may send messages in the group',
			},
		],
		['updateSecuritySettings'],
	),
];

export const groupResource: ResourceModule = {
	value: 'group',
	name: 'Group',
	defaultOperation: 'list',
	description: 'List and manage WhatsApp groups and their participants',
	operations,
	properties,
	async execute({ ctx, itemIndex, operation }) {
		const session = optional(ctx.getNodeParameter('session', itemIndex, '')) as string | undefined;
		const groupId = optional(ctx.getNodeParameter('groupId', itemIndex, '')) as string | undefined;
		const base = `/api/${session}/groups`;

		switch (operation) {
			case 'addParticipants': {
				const participants = splitList(ctx.getNodeParameter('participants', itemIndex, ''));
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${groupId}/participants/add`, { participants });
			}
			case 'count':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/count`);
			case 'create': {
				const name = ctx.getNodeParameter('name', itemIndex) as string;
				const participants = splitList(ctx.getNodeParameter('participants', itemIndex, ''));
				return bunwaApiRequest.call(ctx, 'POST', base, { name, participants });
			}
			case 'demoteParticipants': {
				const participants = splitList(ctx.getNodeParameter('participants', itemIndex, ''));
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${groupId}/admin/demote`, { participants });
			}
			case 'get':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${groupId}`);
			case 'getInviteCode':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${groupId}/invite-code`);
			case 'getJoinInfo': {
				const inviteCode = ctx.getNodeParameter('inviteCode', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'GET', `${base}/join-info`, undefined, { code: inviteCode });
			}
			case 'getParticipants':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${groupId}/participants`);
			case 'getParticipantsV2':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${groupId}/participants/v2`);
			case 'getPicture':
				return bunwaApiRequest.call(ctx, 'GET', `${base}/${groupId}/picture`);
			case 'getSecuritySettings': {
				const info = await bunwaApiRequest.call(ctx, 'GET', `${base}/${groupId}/settings/security/info-admin-only`);
				const messages = await bunwaApiRequest.call(
					ctx,
					'GET',
					`${base}/${groupId}/settings/security/messages-admin-only`,
				);
				return {
					infoAdminOnly: info?.adminsOnly ?? info,
					messagesAdminOnly: messages?.adminsOnly ?? messages,
				};
			}
			case 'join': {
				const inviteCode = ctx.getNodeParameter('inviteCode', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'POST', `${base}/join`, { code: inviteCode });
			}
			case 'leave':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${groupId}/leave`);
			case 'list':
				return bunwaApiRequest.call(ctx, 'GET', base);
			case 'promoteParticipants': {
				const participants = splitList(ctx.getNodeParameter('participants', itemIndex, ''));
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${groupId}/admin/promote`, { participants });
			}
			case 'refresh':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/refresh`);
			case 'removeParticipants': {
				const participants = splitList(ctx.getNodeParameter('participants', itemIndex, ''));
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${groupId}/participants/remove`, { participants });
			}
			case 'revokeInviteCode':
				return bunwaApiRequest.call(ctx, 'POST', `${base}/${groupId}/invite-code/revoke`);
			case 'setDescription': {
				const description = ctx.getNodeParameter('description', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'PUT', `${base}/${groupId}/description`, { description });
			}
			case 'setSubject': {
				const subject = ctx.getNodeParameter('subject', itemIndex) as string;
				return bunwaApiRequest.call(ctx, 'PUT', `${base}/${groupId}/subject`, { subject });
			}
			case 'updateSecuritySettings': {
				const infoAdminOnly = ctx.getNodeParameter('infoAdminOnly', itemIndex, false) as boolean;
				const messagesAdminOnly = ctx.getNodeParameter('messagesAdminOnly', itemIndex, false) as boolean;
				await bunwaApiRequest.call(ctx, 'PUT', `${base}/${groupId}/settings/security/info-admin-only`, {
					adminsOnly: infoAdminOnly,
				});
				await bunwaApiRequest.call(ctx, 'PUT', `${base}/${groupId}/settings/security/messages-admin-only`, {
					adminsOnly: messagesAdminOnly,
				});
				return { infoAdminOnly, messagesAdminOnly };
			}
			default:
				throw new Error(`Unsupported group operation: ${operation}`);
		}
	},
};

/** The HTTP route each operation calls. Used by the docs and by test/routes.test.mjs. */
export const groupRoutes: Record<string, string> = {
	list: 'GET /api/{session}/groups',
	count: 'GET /api/{session}/groups/count',
	get: 'GET /api/{session}/groups/{groupId}',
	create: 'POST /api/{session}/groups',
	join: 'POST /api/{session}/groups/join',
	getJoinInfo: 'GET /api/{session}/groups/join-info',
	refresh: 'POST /api/{session}/groups/refresh',
	leave: 'POST /api/{session}/groups/{groupId}/leave',
	getParticipants: 'GET /api/{session}/groups/{groupId}/participants',
	getParticipantsV2: 'GET /api/{session}/groups/{groupId}/participants/v2',
	addParticipants: 'POST /api/{session}/groups/{groupId}/participants/add',
	removeParticipants: 'POST /api/{session}/groups/{groupId}/participants/remove',
	promoteParticipants: 'POST /api/{session}/groups/{groupId}/admin/promote',
	demoteParticipants: 'POST /api/{session}/groups/{groupId}/admin/demote',
	setSubject: 'PUT /api/{session}/groups/{groupId}/subject',
	setDescription: 'PUT /api/{session}/groups/{groupId}/description',
	getPicture: 'GET /api/{session}/groups/{groupId}/picture',
	getInviteCode: 'GET /api/{session}/groups/{groupId}/invite-code',
	revokeInviteCode: 'POST /api/{session}/groups/{groupId}/invite-code/revoke',
	getSecuritySettings: 'GET /api/{session}/groups/{groupId}/settings/security/info-admin-only',
	updateSecuritySettings: 'PUT /api/{session}/groups/{groupId}/settings/security/info-admin-only',
};

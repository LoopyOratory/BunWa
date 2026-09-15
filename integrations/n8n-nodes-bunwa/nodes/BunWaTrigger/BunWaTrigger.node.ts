import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { bunwaApiRequest } from '../BunWa/GenericFunctions';

const EVENT_OPTIONS = [
	{ name: 'All Events', value: '*' },
	{ name: 'Call Received', value: 'call.received' },
	{ name: 'Call Rejected', value: 'call.rejected' },
	{ name: 'Chat Archived', value: 'chat.archive' },
	{ name: 'Engine Event', value: 'engine.event' },
	{ name: 'Group Join', value: 'group.join' },
	{ name: 'Group Leave', value: 'group.leave' },
	{ name: 'Group Participants', value: 'group.participants' },
	{ name: 'Group Update', value: 'group.update' },
	{ name: 'Label Chat Added', value: 'label.chat.added' },
	{ name: 'Label Chat Deleted', value: 'label.chat.deleted' },
	{ name: 'Label Deleted', value: 'label.deleted' },
	{ name: 'Label Upsert', value: 'label.upsert' },
	{ name: 'Message', value: 'message' },
	{ name: 'Message Ack', value: 'message.ack' },
	{ name: 'Message Any', value: 'message.any' },
	{ name: 'Message Edited', value: 'message.edited' },
	{ name: 'Message Reaction', value: 'message.reaction' },
	{ name: 'Message Revoked', value: 'message.revoked' },
	{ name: 'Message Waiting', value: 'message.waiting' },
	{ name: 'Poll Vote', value: 'poll.vote' },
	{ name: 'Presence Update', value: 'presence.update' },
	{ name: 'Session Status', value: 'session.status' },
	{ name: 'State Change', value: 'state.change' },
];

/**
 * Starts a workflow on BunWa webhook events.
 *
 * Activation registers a webhook subscription on the chosen session
 * (POST /api/sessions/:session/webhooks) pointing at this workflow's webhook
 * URL; deactivation removes it again. BunWa must therefore be able to reach the
 * n8n instance, and the subscription lives in the session config.
 */
export class BunWaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BunWa Trigger',
		name: 'bunWaTrigger',
		icon: 'file:bunwa.svg',
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when BunWa emits a webhook event',
		defaults: {
			name: 'BunWa Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'bunWaApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Session Name or ID',
				name: 'session',
				type: 'string',
				default: '',
				required: true,
				description:
					'Session to subscribe to. The subscription is stored in this session config on the BunWa server.',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: EVENT_OPTIONS,
				default: ['message.any'],
				required: true,
				description:
					'Which events start the workflow. "All Events" subscribes to every event BunWa emits.',
			},
			{
				displayName: 'HMAC Secret',
				name: 'hmacKey',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'Optional. When set, BunWa signs each delivery with X-WAHA-Signature (HMAC-SHA256 over the raw body using this secret).',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		const headers = this.getHeaderData() as IDataObject;
		const event = (headers['x-waha-event'] as string) ?? (body.event as string) ?? 'unknown';

		return {
			workflowData: [
				[
					{
						json: {
							...body,
							event,
							deliveryId: headers['x-waha-delivery-id'] ?? undefined,
							retryCount: headers['x-waha-retry-count'] ?? undefined,
							idempotencyKey: headers['x-waha-idempotency-key'] ?? undefined,
						},
					},
				],
			],
		};
	}

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const session = this.getNodeParameter('session') as string;
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node');

				const subscriptions = (await bunwaApiRequest.call(
					this as never,
					'GET',
					`/api/sessions/${session}/webhooks`,
				)) as IDataObject[];
				const existing = Array.isArray(subscriptions)
					? subscriptions.find((webhook) => webhook.url === webhookUrl)
					: undefined;
				if (existing?.id) {
					staticData.webhookId = existing.id;
					return true;
				}
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const session = this.getNodeParameter('session') as string;
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node');
				const events = this.getNodeParameter('events') as string[];
				const hmacKey = this.getNodeParameter('hmacKey', '') as string;

				const created = (await bunwaApiRequest.call(this as never, 'POST', `/api/sessions/${session}/webhooks`, {
					url: webhookUrl,
					events,
					enabled: true,
					...(hmacKey ? { hmac: { key: hmacKey } } : {}),
				})) as IDataObject;

				if (created?.id) {
					staticData.webhookId = created.id;
					return true;
				}

				// Older builds do not echo the created webhook, so look it up.
				const subscriptions = (await bunwaApiRequest.call(
					this as never,
					'GET',
					`/api/sessions/${session}/webhooks`,
				)) as IDataObject[];
				const match = Array.isArray(subscriptions)
					? subscriptions.find((webhook) => webhook.url === webhookUrl)
					: undefined;
				if (!match?.id) {
					throw new NodeOperationError(
						this.getNode(),
						'BunWa accepted the webhook but it could not be found afterwards, so it cannot be cleaned up on deactivation.',
					);
				}
				staticData.webhookId = match.id;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const session = this.getNodeParameter('session') as string;
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId) {
					return true;
				}
				await bunwaApiRequest.call(this as never, 'DELETE', `/api/sessions/${session}/webhooks/${webhookId}`);
				delete staticData.webhookId;
				return true;
			},
		},
	};
}

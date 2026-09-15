/**
 * Reads which interactive control a customer actually used.
 *
 * BunWa delivers the raw WhatsApp payload, where a selection lives deep inside
 * `_data` and the shape depends on what was sent: a quick reply button, a
 * legacy button message, a list row, or a native flow response. Without this,
 * a workflow has to reach into `$json._data.message...selectedId` and know
 * which of four shapes to expect, which is why the upstream OpenWA plugin
 * cannot route on button replies at all.
 *
 * Shapes verified against a live session:
 *   templateButtonReplyMessage    quick reply buttons (native flow)
 *   buttonsResponseMessage        legacy button messages
 *   listResponseMessage           interactive lists
 *   interactiveResponseMessage    native flow responses and flow submissions
 */
export interface InteractiveSelection {
	/** Which kind of control produced this reply. */
	type: 'button' | 'list' | 'flow';
	/** Stable id of the tapped button or row, as set when it was sent. */
	selectedId?: string;
	/** Label the customer saw. BunWa also puts this in `body`. */
	selectedText?: string;
	/** Message id the reply was given against, useful for threading. */
	repliedToMessageId?: string;
}

/** A plain reply carries the tapped id either directly or inside paramsJson. */
function readParamsJson(params: unknown): string | undefined {
	if (typeof params !== 'string') {
		return undefined;
	}
	try {
		const parsed = JSON.parse(params);
		return parsed?.id ?? parsed?.selectedId ?? parsed?.selectedRowId ?? parsed?.title ?? undefined;
	} catch {
		return undefined;
	}
}

export function extractInteractiveResponse(body: unknown): InteractiveSelection | null {
	const message = (body as any)?._data?.message ?? (body as any)?.message;
	if (!message) {
		return null;
	}

	// Quick reply buttons: the shape a tap on `quick_reply` actually produces.
	const template = message.templateButtonReplyMessage;
	if (template) {
		return {
			type: 'button',
			selectedId: template.selectedId ?? undefined,
			selectedText: template.selectedDisplayText ?? undefined,
			repliedToMessageId: template.contextInfo?.stanzaId ?? undefined,
		};
	}

	const buttons = message.buttonsResponseMessage;
	if (buttons) {
		return {
			type: 'button',
			selectedId: buttons.selectedButtonId ?? undefined,
			selectedText: buttons.selectedDisplayText ?? undefined,
			repliedToMessageId: buttons.contextInfo?.stanzaId ?? undefined,
		};
	}

	const list = message.listResponseMessage;
	if (list) {
		return {
			type: 'list',
			selectedId: list.singleSelectReply?.selectedRowId ?? list.selectedRowId ?? undefined,
			selectedText: list.title ?? list.description ?? undefined,
			repliedToMessageId: list.contextInfo?.stanzaId ?? undefined,
		};
	}

	const interactive = message.interactiveResponseMessage;
	if (interactive) {
		return {
			type: 'flow',
			selectedId: readParamsJson(interactive.nativeFlowResponseMessage?.paramsJson),
			selectedText: interactive.body?.text ?? undefined,
			repliedToMessageId: interactive.contextInfo?.stanzaId ?? undefined,
		};
	}

	return null;
}

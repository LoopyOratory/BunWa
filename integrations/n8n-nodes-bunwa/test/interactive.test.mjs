import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractInteractiveResponse } from '../dist/nodes/BunWaTrigger/interactive.js';

// Fixtures mirror payloads captured from a live session.
const quickReplyTap = {
	body: 'Tap to reply',
	_data: {
		message: {
			templateButtonReplyMessage: {
				selectedId: 'reply-test',
				selectedDisplayText: 'Tap to reply',
				contextInfo: { stanzaId: '3EB0F223AF3058E784A61B' },
			},
		},
	},
};

test('reads a quick reply tap', () => {
	const selection = extractInteractiveResponse(quickReplyTap);
	assert.equal(selection.type, 'button');
	assert.equal(selection.selectedId, 'reply-test');
	assert.equal(selection.selectedText, 'Tap to reply');
	assert.equal(selection.repliedToMessageId, '3EB0F223AF3058E784A61B');
});

test('reads a legacy button reply', () => {
	const selection = extractInteractiveResponse({
		_data: { message: { buttonsResponseMessage: { selectedButtonId: 'yes', selectedDisplayText: 'Yes' } } },
	});
	assert.equal(selection.type, 'button');
	assert.equal(selection.selectedId, 'yes');
});

test('reads a list row selection', () => {
	const selection = extractInteractiveResponse({
		_data: { message: { listResponseMessage: { title: 'Fashion', singleSelectReply: { selectedRowId: 'order-cat-fashion' } } } },
	});
	assert.equal(selection.type, 'list');
	assert.equal(selection.selectedId, 'order-cat-fashion');
	assert.equal(selection.selectedText, 'Fashion');
});

test('reads a native flow response and pulls the id out of paramsJson', () => {
	const selection = extractInteractiveResponse({
		_data: {
			message: {
				interactiveResponseMessage: {
					nativeFlowResponseMessage: { name: 'single_select', paramsJson: '{"id":"order-cat-fashion","title":"Fashion"}' },
					body: { text: 'Fashion' },
				},
			},
		},
	});
	assert.equal(selection.type, 'flow');
	assert.equal(selection.selectedId, 'order-cat-fashion');
});

test('survives malformed paramsJson instead of throwing', () => {
	const selection = extractInteractiveResponse({
		_data: { message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: 'not json' } } } },
	});
	assert.equal(selection.type, 'flow');
	assert.equal(selection.selectedId, undefined);
});

test('returns null for a plain text message', () => {
	assert.equal(extractInteractiveResponse({ body: 'hello', _data: { message: { conversation: 'hello' } } }), null);
	assert.equal(extractInteractiveResponse({}), null);
	assert.equal(extractInteractiveResponse(null), null);
});

import { Button, ButtonType } from '../../../structures/chatting.buttons.dto';
import { proto, generateWAMessageFromContent, isJidGroup, type BinaryNode } from '@whiskeysockets/baileys';

function toName(type: ButtonType) {
  switch (type) {
    case ButtonType.REPLY:
      return 'quick_reply';
    case ButtonType.URL:
      return 'cta_url';
    case ButtonType.CALL:
      return 'cta_call';
    case ButtonType.COPY:
      return 'cta_copy';
  }
}

export function randomId() {
  // generate 16 random digits
  return Math.random().toString().slice(2, 18);
}

export function buttonToJson(button: Button) {
  const name = toName(button.type);
  const buttonParams: any = {
    display_text: button.text,
    id: button.id || randomId(),
    disabled: false,
  };
  switch (button.type) {
    case ButtonType.REPLY:
      break;
    case ButtonType.CALL:
      buttonParams.phone_number = button.phoneNumber;
      break;
    case ButtonType.COPY:
      buttonParams.copy_code = button.copyCode;
      break;
    case ButtonType.URL:
      buttonParams.url = button.url;
      buttonParams.merchant_url = button.url;
      break;
  }
  return {
    name: name,
    buttonParamsJson: JSON.stringify(buttonParams),
  };
}

/**
 * WhatsApp's server requires specific binary protocol nodes alongside the
 * interactiveMessage protobuf payload for a client to actually render
 * tappable buttons — Baileys' relayMessage() does not add these
 * automatically (it only recognizes the reply/"native_flow_response" side).
 * Without them the message can be silently dropped or delivered blank.
 * Node shape verified against WhatsApp's own recognized 'biz' binary tag
 * (present in Baileys' WABinary/constants.js) and community
 * implementations of the same interactiveMessage/nativeFlowMessage format.
 */
export function buildButtonBinaryNodes(chatId: string): BinaryNode[] {
  const nodes: BinaryNode[] = [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [
            {
              tag: 'native_flow',
              attrs: { v: '9', name: 'mixed' },
            },
          ],
        },
      ],
    },
  ];
  // Private (1:1) chats additionally require a bot node for interactive
  // messages to render; groups do not need it.
  if (!isJidGroup(chatId)) {
    nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
  }
  return nodes;
}

/**
 * WhatsApp clients only treat an interactive payload as tappable when it
 * arrives inside a view-once envelope; this is how WhatsApp's own business
 * clients send interactive messages. Without an envelope the message renders
 * but the buttons do nothing when tapped (verified live).
 *
 * BUNWA_INTERACTIVE_WRAPPER switches the envelope without a rebuild so the
 * variants can be compared against a real client:
 *   v2ext (default) | v2 | v1 | none
 */
export function wrapInteractiveMessage(inner: any): any {
  switch ((process.env.BUNWA_INTERACTIVE_WRAPPER || 'v2ext').toLowerCase()) {
    case 'none':
      return inner;
    case 'v1':
      return { viewOnceMessage: { message: inner } };
    case 'v2':
      return { viewOnceMessageV2: { message: inner } };
    default:
      return { viewOnceMessageV2Extension: { message: inner } };
  }
}

export async function sendButtonMessage(
  sock: any,
  chatId: string,
  buttons: Button[],
  header?: string,
  headerImage?: any,
  body?: string,
  footer?: string,
) {
  const inner: any = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
    },
    interactiveMessage: {
      body: undefined,
      header: undefined,
      footer: undefined,
      nativeFlowMessage: {
        buttons: buttons.map(buttonToJson),
        messageParamsJson: JSON.stringify({
          from: 'api',
          templateId: randomId(),
        }),
      },
    },
  };

  if (header || headerImage) {
    inner.interactiveMessage.header = {
      title: header,
      hasMediaAttachment: !!headerImage,
      imageMessage: headerImage,
    };
  }
  if (body) {
    inner.interactiveMessage.body = {
      text: body,
    };
  }
  if (footer) {
    inner.interactiveMessage.footer = {
      text: footer,
    };
  }

  const msg = proto.Message.create(wrapInteractiveMessage(inner) as any);
  const fullMessage = generateWAMessageFromContent(chatId, msg, {
    userJid: sock?.user?.id,
  });
  await sock.relayMessage(chatId, fullMessage.message, {
    messageId: fullMessage.key.id,
    additionalNodes: buildButtonBinaryNodes(chatId),
  });
  return fullMessage;
}

import { parseMessageIdSerialized } from './ids';
import { WAMessage } from '../../structures/responses.dto';
import { WAMessageAckBody } from '../../structures/webhooks.dto';
import { distinct, interval } from 'rxjs';

export function DistinctAck(flushEvery: number = 60_000) {
  return distinct(
    (msg: WAMessageAckBody) => `${msg.id}-${msg.ack}-${msg.participant}`,
    interval(flushEvery),
  );
}

function extractUniqueMessageId(messageId: string): string {
  const key = parseMessageIdSerialized(messageId, true);
  return key.id;
}

export function DistinctMessages(flushEvery: number = 60_000) {
  return distinct((msg: WAMessage) => {
    const uniqueId = extractUniqueMessageId(msg.id);
    return `${msg.fromMe}_${uniqueId}`;
  }, interval(flushEvery));
}

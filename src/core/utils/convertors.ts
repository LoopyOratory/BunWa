export function ExtractMessageKeysForRead(messages: any[]): any[] {
  return messages.map(m => ({ key: m.key }));
}

export function MessagesForRead(
  chatId: string,
  request: any,
): { query: any; filter: any } {
  const limit = request.messages || chatId?.includes('@g.us') ? 100 : 30;
  const query = {
    offset: 0,
    limit: limit,
    downloadMedia: false,
    merge: true,
  };
  const afterMs = Date.now() - (request.days || 1) * 24 * 60 * 60 * 1000;
  const after = Math.floor(afterMs / 1000);
  const filter: any = {
    'filter.ack': 1,
    'filter.fromMe': false,
    'filter.timestamp.gte': after,
  };
  return {
    query: query,
    filter: filter,
  };
}

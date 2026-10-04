import { Boom } from '@hapi/boom';
import type makeWASocket from '@whiskeysockets/baileys';
import { getBinaryNodeChild, S_WHATSAPP_NET } from '@whiskeysockets/baileys';
import { BadRequestException } from '../../exceptions';

export class NOWEBNewsletterMetadata {
  id!: string;
  state!: string;
  creation_time!: number;
  name!: string;
  nameTime!: number;
  description!: string;
  descriptionTime!: number;
  invite!: string;
  handle!: string;
  picture!: string | null;
  preview!: string | null;
  reaction_codes!: string | null;
  subscribers!: number;
  verification!: string;
  viewer_metadata: any;
}

export function toNewsletterMetadata(
  data: any,
): NOWEBNewsletterMetadata | null {
  if (data.state?.type === 'DELETED') {
    return null;
  }

  if (data.state?.type === 'NON_EXISTING') {
    return null;
  }

  return {
    id: data.id,
    state: data.state?.type,
    creation_time: +data.thread_metadata.creation_time,
    name: data.thread_metadata.name.text,
    nameTime: +data.thread_metadata.name.update_time,
    description: data.thread_metadata.description.text,
    descriptionTime: +data.thread_metadata.description.update_time,
    invite: data.thread_metadata.invite,
    handle: data.thread_metadata.handle,
    picture: data.thread_metadata.picture?.direct_path || null,
    preview: data.thread_metadata.preview?.direct_path || null,
    reaction_codes: data.thread_metadata?.settings?.reaction_codes?.value,
    subscribers: +data.thread_metadata.subscribers_count,
    verification: data.thread_metadata.verification,
    viewer_metadata: data.viewer_metadata,
  };
}

/**
 * Query IDs and result paths for WhatsApp's newsletter directory (w:mex) queries.
 * Baileys doesn't expose a directory-search API, so these are executed via the same
 * w:mex/executeWMexQuery mechanism Baileys itself uses internally for newsletterMetadata etc.
 * (see node_modules/@whiskeysockets/baileys/lib/Socket/mex.js), just with different
 * query_id/dataPath. Values verified against a working reference implementation
 * (devlikeapro/waha's NowebClient.ts, MIT-licensed, `core` branch).
 */
const NEWSLETTERS_DIRECTORY_LIST_QUERY_ID = '6190824427689257';
const NEWSLETTERS_DIRECTORY_LIST_PATH = 'xwa2_newsletters_directory_list';
const NEWSLETTERS_DIRECTORY_SEARCH_QUERY_ID = '6802402206520139';
const NEWSLETTERS_DIRECTORY_SEARCH_PATH = 'xwa2_newsletters_directory_search';
const NEWSLETTER_CREATE_QUERY_ID = '8823471724422422';
const NEWSLETTER_CREATE_PATH = 'xwa2_newsletter_create';
const NEWSLETTER_SUBSCRIBED_QUERY_ID = '6388546374527196';
const NEWSLETTER_SUBSCRIBED_PATH = 'xwa2_newsletter_subscribed';

/** Sends one w:mex query and returns the decoded JSON body. */
async function sendNewsletterMexQuery(
  sock: ReturnType<typeof makeWASocket>,
  variables: Record<string, unknown>,
  queryId: string,
): Promise<any> {
  const result = await sock.query({
    tag: 'iq',
    attrs: {
      id: sock.generateMessageTag(),
      type: 'get',
      to: S_WHATSAPP_NET,
      xmlns: 'w:mex',
    },
    content: [
      {
        tag: 'query',
        attrs: { query_id: queryId },
        content: Buffer.from(JSON.stringify({ variables }), 'utf-8'),
      },
    ],
  });
  const child = getBinaryNodeChild(result, 'result');
  if (!child?.content) {
    throw new Boom(
      `Failed to query newsletter directory, unexpected response structure.`,
      { statusCode: 400, data: result },
    );
  }
  return JSON.parse(child.content.toString());
}

/** Throws the GraphQL answer as a Boom so the shared error handler maps its status. */
function throwGraphqlErrors(data: any): never {
  const errorMessages = data.errors
    .map((err: any) => err.message || 'Unknown error')
    .join(', ');
  const errorCode = data.errors[0]?.extensions?.error_code || 400;
  throw new Boom(`GraphQL server error: ${errorMessages}`, {
    statusCode: errorCode,
    data: data.errors[0],
  });
}

async function executeNewsletterDirectoryQuery(
  sock: ReturnType<typeof makeWASocket>,
  variables: Record<string, unknown>,
  queryId: string,
  dataPath: string,
): Promise<any> {
  const data = await sendNewsletterMexQuery(sock, variables, queryId);
  if (data.errors?.length > 0) {
    throwGraphqlErrors(data);
  }
  const response = dataPath ? data?.data?.[dataPath] : data?.data;
  if (typeof response !== 'undefined') {
    return response;
  }
  throw new Boom(
    `Failed to query newsletter directory, unexpected response structure.`,
    { statusCode: 400, data },
  );
}

/**
 * Channels the account is subscribed to. Baileys 7.0.0-rc14 has no
 * newsletterSubscribed method (newer forks do), so the same w:mex query the
 * client uses is sent here. This is what backs GET /channels on NOWEB.
 */
export async function fetchSubscribedNewsletters(
  sock: ReturnType<typeof makeWASocket>,
): Promise<any[]> {
  const data = await sendNewsletterMexQuery(
    sock,
    {},
    NEWSLETTER_SUBSCRIBED_QUERY_ID,
  );
  if (data.errors?.length > 0) {
    throwGraphqlErrors(data);
  }
  const response = data?.data?.[NEWSLETTER_SUBSCRIBED_PATH];
  if (Array.isArray(response)) {
    return response;
  }
  throw new Boom(
    `Failed to list subscribed newsletters, unexpected response structure.`,
    { statusCode: 400, data },
  );
}

/**
 * Creates a channel. Implemented directly instead of sock.newsletterCreate
 * because Baileys 7.0.0-rc14's parseNewsletterCreateResponse dereferences
 * thread_metadata.picture unconditionally, and WhatsApp returns picture: null
 * when a channel is created without a picture, so the call throws a TypeError
 * after the channel already exists. The wire query is the same w:mex one
 * Baileys sends; the response is handed to the shared null-safe mapper.
 */
export async function createNewsletter(
  sock: ReturnType<typeof makeWASocket>,
  name: string,
  description?: string,
): Promise<any> {
  const variables = { input: { name, description: description ?? null } };
  const data = await sendNewsletterMexQuery(
    sock,
    variables,
    NEWSLETTER_CREATE_QUERY_ID,
  );
  if (data.errors?.length > 0) {
    throwGraphqlErrors(data);
  }
  const response = data?.data?.[NEWSLETTER_CREATE_PATH];
  if (typeof response !== 'undefined') {
    return response;
  }
  throw new Boom(
    `Failed to create newsletter, unexpected response structure.`,
    { statusCode: 400, data },
  );
}

export interface NewsletterDirectoryPage {
  startCursor: string | null;
  endCursor: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface NewsletterDirectoryResult {
  page: NewsletterDirectoryPage;
  newsletters: NOWEBNewsletterMetadata[];
}

function parseNewsletterDirectoryResponse(response: any): NewsletterDirectoryResult {
  const pageInfo = response?.page_info ?? {};
  const results: any[] = response?.result ?? [];
  const newsletters = results
    .map(toNewsletterMetadata)
    .filter((n: NOWEBNewsletterMetadata | null): n is NOWEBNewsletterMetadata => n !== null);
  return {
    page: {
      startCursor: pageInfo.startCursor ?? null,
      endCursor: pageInfo.endCursor ?? null,
      hasNextPage: !!pageInfo.hasNextPage,
      hasPreviousPage: !!pageInfo.hasPreviousPage,
    },
    newsletters,
  };
}

export async function searchNewsletterDirectoryByView(
  sock: ReturnType<typeof makeWASocket>,
  query: {
    view?: string;
    countries?: string[];
    categories?: string[];
    limit?: number;
    startCursor?: string;
  },
): Promise<NewsletterDirectoryResult> {
  if (!query.view) {
    throw new BadRequestException(
      'The view field is required, for example RECOMMENDED. See GET /channels/search/views.',
    );
  }
  const input: Record<string, any> = {
    view: query.view,
    limit: query.limit,
    start_cursor: query.startCursor,
  };
  // WhatsApp rejects the query when filters is present but empty, so only send
  // it when there is something to filter by.
  if (query.countries?.length || query.categories?.length) {
    input.filters = {
      country_codes: query.countries,
      categories: query.categories,
    };
  }
  const response = await executeNewsletterDirectoryQuery(
    sock,
    { input },
    NEWSLETTERS_DIRECTORY_LIST_QUERY_ID,
    NEWSLETTERS_DIRECTORY_LIST_PATH,
  );
  return parseNewsletterDirectoryResponse(response);
}

export async function searchNewsletterDirectoryByText(
  sock: ReturnType<typeof makeWASocket>,
  query: {
    text?: string;
    categories?: string[];
    limit?: number;
    startCursor?: string;
  },
): Promise<NewsletterDirectoryResult> {
  if (!query.text) {
    throw new BadRequestException(
      'The text field is required, for example {"text": "news"}.',
    );
  }
  const variables = {
    input: {
      search_text: query.text,
      categories: query.categories,
      limit: query.limit,
      start_cursor: query.startCursor,
    },
  };
  const response = await executeNewsletterDirectoryQuery(
    sock,
    variables,
    NEWSLETTERS_DIRECTORY_SEARCH_QUERY_ID,
    NEWSLETTERS_DIRECTORY_SEARCH_PATH,
  );
  return parseNewsletterDirectoryResponse(response);
}

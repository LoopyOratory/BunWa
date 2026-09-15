# n8n-nodes-bunwa

n8n community nodes for the [BunWa](https://github.com/LoopyOratory/BunWa) WhatsApp HTTP API. The package contains two nodes: an action node for sending messages and managing sessions, chats, groups, contacts, channels, labels, presence, statuses and server resources, and a trigger node that starts a workflow when BunWa delivers a webhook event.

## Installation

Community nodes need a self-hosted n8n instance. They are not available on n8n Cloud.

### Through the n8n UI

1. Open your n8n instance.
2. Go to Settings > Community nodes.
3. Select Install, then enter `n8n-nodes-bunwa`.
4. Confirm the installation and restart n8n if it asks you to.

### Manually with npm

Install the package into the n8n custom nodes folder:

```sh
mkdir -p ~/.n8n/custom
cd ~/.n8n/custom
npm install n8n-nodes-bunwa
```

If your custom nodes live somewhere else, set `N8N_CUSTOM_EXTENSIONS` to that folder before starting n8n. Restart n8n after installing or updating the package.

## Prerequisites

- A running BunWa server that n8n can reach, and its base URL (for example `http://localhost:3000` or `https://bunwa.example.com`).
- The `WAHA_API_KEY` value configured on that server. BunWa also accepts the dashboard Basic credentials on API routes, but the API key is the supported path for automations.

## Credentials

The `BunWa API` credential has two fields:

| Field    | Description                                                                                 |
| -------- | ------------------------------------------------------------------------------------------- |
| Base URL | Address of the BunWa server, without a trailing slash. Defaults to `http://localhost:3000`. |
| API Key  | The `WAHA_API_KEY` configured on the BunWa server. It is sent as the `x-api-key` header.    |

The credential test calls `GET /api/sessions`, an authenticated endpoint, so a wrong API key fails the test instead of silently passing.

## Nodes

### BunWa

The action node sends one request per input item. Its subtitle shows the selected operation and resource, for example `sendText: message`.

| Resource | Description                                                  |
| -------- | ------------------------------------------------------------ |
| Message  | Send WhatsApp messages, media and interactive content        |
| Session  | Create, start, stop and inspect WhatsApp sessions            |
| Chat     | Inspect chats and manage their messages                      |
| Group    | List and manage WhatsApp groups and their participants       |
| Contact  | Look up contacts, LIDs and the account profile               |
| Channel  | Browse, follow and search WhatsApp channels                  |
| Label    | Manage WhatsApp labels and the chats they are applied to     |
| Presence | Read and set WhatsApp presence                               |
| Status   | Post and delete WhatsApp statuses (stories)                  |
| Server   | Inspect the BunWa server and manage templates and MCP policy |

Example: to send a text, add a BunWa node, pick the Message resource and the Send Text operation, then fill in Session Name or ID, Chat ID (for example `15551234567@c.us`) and Text. The node returns the server response as JSON.

### BunWa Trigger

The trigger node starts a workflow when BunWa emits a webhook event.

- On activation, the node registers a webhook subscription on the selected session with `POST /api/sessions/:session/webhooks`, pointing at the workflow's n8n webhook URL.
- On deactivation, it removes the subscription with `DELETE /api/sessions/:session/webhooks/:id`. If the created subscription cannot be found afterwards, activation fails with an error so a stale subscription is not left behind.
- BunWa must be able to reach the n8n instance. If n8n sits behind a proxy or a container network, set n8n's `WEBHOOK_URL` so the registered URL is reachable from the BunWa server.
- The subscription is stored in the session config on the BunWa server.

Selectable events:

| Event              | Value                |
| ------------------ | -------------------- |
| All Events         | `*`                  |
| Call Received      | `call.received`      |
| Call Rejected      | `call.rejected`      |
| Chat Archived      | `chat.archive`       |
| Engine Event       | `engine.event`       |
| Group Join         | `group.join`         |
| Group Leave        | `group.leave`        |
| Group Participants | `group.participants` |
| Group Update       | `group.update`       |
| Label Chat Added   | `label.chat.added`   |
| Label Chat Deleted | `label.chat.deleted` |
| Label Deleted      | `label.deleted`      |
| Label Upsert       | `label.upsert`       |
| Message            | `message`            |
| Message Ack        | `message.ack`        |
| Message Any        | `message.any`        |
| Message Edited     | `message.edited`     |
| Message Reaction   | `message.reaction`   |
| Message Revoked    | `message.revoked`    |
| Message Waiting    | `message.waiting`    |
| Poll Vote          | `poll.vote`          |
| Presence Update    | `presence.update`    |
| Session Status     | `session.status`     |
| State Change       | `state.change`       |

The HMAC Secret field is optional. When it is set, BunWa signs each delivery with an `X-WAHA-Signature` header (HMAC-SHA256 over the raw body using this secret). The trigger outputs the webhook body, plus `event`, `deliveryId`, `retryCount` and `idempotencyKey` when BunWa sends them.

## Operations reference

Every operation maps to one HTTP route on the BunWa server. Values in braces such as `{session}` and `{chatId}` are path parameters filled in from the node fields. The tables are generated from the same `*Routes` maps the node code uses, and `test/routes.test.mjs` checks every route against the server source, so they cannot drift.

### Message

Send WhatsApp messages, media and interactive content

| Operation           | Route                                                 | Notes |
| ------------------- | ----------------------------------------------------- | ----- |
| Cancel Batch        | `POST /api/{session}/messages/batch/{batchId}/cancel` |       |
| Check Number        | `GET /api/checkNumberStatus`                          |       |
| Forward             | `POST /api/forwardMessage`                            |       |
| Generate Message ID | `GET /api/{session}/new-message-id`                   |       |
| Get Batch Status    | `GET /api/{session}/messages/batch/{batchId}`         |       |
| Get Messages        | `GET /api/messages`                                   |       |
| Mark as Read        | `POST /api/sendSeen`                                  |       |
| React               | `PUT /api/reaction`                                   |       |
| Reply               | `POST /api/reply`                                     |       |
| Send Bulk           | `POST /api/{session}/messages/send-bulk`              |       |
| Send Buttons        | `POST /api/sendButtons`                               | At most 3 buttons. Types: reply, url, call, copy, catalog, location, flow. Only reply buttons reply |
| Send Contact VCard  | `POST /api/sendContactVcard`                          |       |
| Send File           | `POST /api/sendFile`                                  |       |
| Send Image          | `POST /api/sendImage`                                 |       |
| Send Link Preview   | `POST /api/sendLinkPreview`                           |       |
| Send List           | `POST /api/sendList`                                  |       |
| Send Location       | `POST /api/sendLocation`                              |       |
| Send Poll           | `POST /api/sendPoll`                                  |       |
| Send Sticker        | `POST /api/sendSticker`                               |       |
| Send Text           | `POST /api/sendText`                                  |       |
| Send Video          | `POST /api/sendVideo`                                 |       |
| Send Voice          | `POST /api/sendVoice`                                 |       |
| Star                | `PUT /api/star`                                       |       |
| Start Typing        | `POST /api/startTyping`                               |       |
| Stop Typing         | `POST /api/stopTyping`                                |       |

### Session

Create, start, stop and inspect WhatsApp sessions

| Operation      | Route                                     | Notes                                            |
| -------------- | ----------------------------------------- | ------------------------------------------------ |
| Create         | `POST /api/sessions`                      | Registers a new session                          |
| Delete         | `DELETE /api/sessions/{session}`          | Removes the session and its stored credentials   |
| Force Kill     | `POST /api/sessions/{session}/force-kill` | Hard stop without a graceful drain               |
| Get            | `GET /api/sessions/{session}`             | Returns one session with its status              |
| Get Config     | `GET /api/sessions/{session}/config`      |                                                  |
| Get QR         | `GET /api/{session}/auth/qr`              | Base64 PNG, optionally with a phone pairing code |
| Get Screenshot | `GET /api/{session}/screenshot`           | WEBJS engine only                                |
| List           | `GET /api/sessions`                       |                                                  |
| Log Out        | `POST /api/sessions/{session}/logout`     | Unpairs the account, then deletes the session    |
| Restart        | `POST /api/sessions/{session}/restart`    |                                                  |
| Start          | `POST /api/sessions/{session}/start`      |                                                  |
| Stop           | `POST /api/sessions/{session}/stop`       |                                                  |
| Update Config  | `PATCH /api/sessions/{session}/config`    |                                                  |

### Chat

Inspect chats and manage their messages

| Operation          | Route                                                              | Notes |
| ------------------ | ------------------------------------------------------------------ | ----- |
| Archive Chat       | `POST /api/{session}/chats/{chatId}/archive`                       |       |
| Delete Chat        | `DELETE /api/{session}/chats/{chatId}`                             |       |
| Delete Message     | `DELETE /api/{session}/chats/{chatId}/messages/{messageId}`        |       |
| Edit Message       | `PUT /api/{session}/chats/{chatId}/messages/{messageId}`           |       |
| Get Chat           | `GET /api/{session}/chats/{chatId}`                                |       |
| Get Chat Picture   | `GET /api/{session}/chats/{chatId}/picture`                        |       |
| Get Message        | `GET /api/{session}/chats/{chatId}/messages/{messageId}`           |       |
| Get Messages       | `GET /api/{session}/chats/{chatId}/messages`                       |       |
| Get Overview       | `GET /api/{session}/chats/overview`                                |       |
| Get Reactions      | `GET /api/{session}/chats/{chatId}/messages/{messageId}/reactions` |       |
| List Chats         | `GET /api/{session}/chats`                                         |       |
| Mark Chat Read     | `POST /api/{session}/chats/{chatId}/read`                          |       |
| Mark Chat Unread   | `POST /api/{session}/chats/{chatId}/unread`                        |       |
| Mark Messages Read | `POST /api/{session}/chats/{chatId}/messages/read`                 |       |
| Pin Message        | `POST /api/{session}/chats/{chatId}/messages/{messageId}/pin`      |       |
| Unarchive Chat     | `POST /api/{session}/chats/{chatId}/unarchive`                     |       |
| Unpin Message      | `POST /api/{session}/chats/{chatId}/messages/{messageId}/unpin`    |       |

### Group

List and manage WhatsApp groups and their participants

| Operation                | Route                                                                   | Notes |
| ------------------------ | ----------------------------------------------------------------------- | ----- |
| Add Participants         | `POST /api/{session}/groups/{groupId}/participants/add`                 |       |
| Count Groups             | `GET /api/{session}/groups/count`                                       |       |
| Create Group             | `POST /api/{session}/groups`                                            |       |
| Demote Participants      | `POST /api/{session}/groups/{groupId}/admin/demote`                     |       |
| Get Group                | `GET /api/{session}/groups/{groupId}`                                   |       |
| Get Invite Code          | `GET /api/{session}/groups/{groupId}/invite-code`                       |       |
| Get Join Info            | `GET /api/{session}/groups/join-info`                                   |       |
| Get Participants         | `GET /api/{session}/groups/{groupId}/participants`                      |       |
| Get Participants V2      | `GET /api/{session}/groups/{groupId}/participants/v2`                   |       |
| Get Picture              | `GET /api/{session}/groups/{groupId}/picture`                           |       |
| Get Security Settings    | `GET /api/{session}/groups/{groupId}/settings/security/info-admin-only` |       |
| Join Group               | `POST /api/{session}/groups/join`                                       |       |
| Leave Group              | `POST /api/{session}/groups/{groupId}/leave`                            |       |
| List Groups              | `GET /api/{session}/groups`                                             |       |
| Promote Participants     | `POST /api/{session}/groups/{groupId}/admin/promote`                    |       |
| Refresh Groups           | `POST /api/{session}/groups/refresh`                                    |       |
| Remove Participants      | `POST /api/{session}/groups/{groupId}/participants/remove`              |       |
| Revoke Invite Code       | `POST /api/{session}/groups/{groupId}/invite-code/revoke`               |       |
| Set Description          | `PUT /api/{session}/groups/{groupId}/description`                       |       |
| Set Subject              | `PUT /api/{session}/groups/{groupId}/subject`                           |       |
| Update Security Settings | `PUT /api/{session}/groups/{groupId}/settings/security/info-admin-only` |       |

### Contact

Look up contacts, LIDs and the account profile

| Operation              | Route                                      | Notes                                      |
| ---------------------- | ------------------------------------------ | ------------------------------------------ |
| Check Exists           | `GET /api/contacts/check-exists`           |                                            |
| Count LIDs             | `GET /api/{session}/lids/count`            |                                            |
| Delete Profile Picture | `DELETE /api/{session}/profile/picture`    | Requires the PLUS tier of the BunWa server |
| Find LID by Phone      | `GET /api/{session}/lids/pn/{phoneNumber}` |                                            |
| Get LID                | `GET /api/{session}/lids/{lid}`            |                                            |
| Get Profile            | `GET /api/{session}/profile`               |                                            |
| Get Profile Picture    | `GET /api/contacts/profile-picture`        |                                            |
| List Contacts          | `GET /api/contacts/all`                    |                                            |
| List LIDs              | `GET /api/{session}/lids`                  |                                            |
| Set Profile Name       | `PUT /api/{session}/profile/name`          |                                            |
| Set Profile Picture    | `PUT /api/{session}/profile/picture`       | Requires the PLUS tier of the BunWa server |
| Set Profile Status     | `PUT /api/{session}/profile/status`        |                                            |

### Channel

Browse, follow and search WhatsApp channels

| Operation         | Route                                               | Notes |
| ----------------- | --------------------------------------------------- | ----- |
| Create            | `POST /api/{session}/channels`                      |       |
| Follow            | `POST /api/{session}/channels/{channelId}/follow`   |       |
| Get               | `GET /api/{session}/channels/{channelId}`           |       |
| List              | `GET /api/{session}/channels`                       |       |
| Mute              | `POST /api/{session}/channels/{channelId}/mute`     |       |
| Search by Text    | `POST /api/{session}/channels/search/by-text`       |       |
| Search by View    | `POST /api/{session}/channels/search/by-view`       |       |
| Search Categories | `GET /api/{session}/channels/search/categories`     |       |
| Search Countries  | `GET /api/{session}/channels/search/countries`      |       |
| Search Views      | `GET /api/{session}/channels/search/views`          |       |
| Unfollow          | `POST /api/{session}/channels/{channelId}/unfollow` |       |
| Unmute            | `POST /api/{session}/channels/{channelId}/unmute`   |       |

### Label

Manage WhatsApp labels and the chats they are applied to

| Operation           | Route                                       | Notes |
| ------------------- | ------------------------------------------- | ----- |
| Create              | `POST /api/{session}/labels`                |       |
| Delete              | `DELETE /api/{session}/labels/{labelId}`    |       |
| Get Chats for Label | `GET /api/{session}/labels/{labelId}/chats` |       |
| Get Labels for Chat | `GET /api/{session}/labels/chats/{chatId}`  |       |
| List                | `GET /api/{session}/labels`                 |       |
| Set Labels for Chat | `PUT /api/{session}/labels/chats/{chatId}`  |       |
| Update              | `PUT /api/{session}/labels/{labelId}`       |       |

### Presence

Read and set WhatsApp presence

| Operation    | Route                                             | Notes |
| ------------ | ------------------------------------------------- | ----- |
| Get All      | `GET /api/{session}/presence`                     |       |
| Get for Chat | `GET /api/{session}/presence/{chatId}`            |       |
| Set Own      | `POST /api/{session}/presence`                    |       |
| Subscribe    | `POST /api/{session}/presence/{chatId}/subscribe` |       |

### Status

Post and delete WhatsApp statuses (stories)

| Operation           | Route                                      | Notes |
| ------------------- | ------------------------------------------ | ----- |
| Delete              | `POST /api/{session}/status/delete`        |       |
| Generate Message ID | `GET /api/{session}/status/new-message-id` |       |
| Send Image          | `POST /api/{session}/status/image`         |       |
| Send Text           | `POST /api/{session}/status/text`          |       |
| Send Video          | `POST /api/{session}/status/video`         |       |
| Send Voice          | `POST /api/{session}/status/voice`         |       |

### Server

Inspect the BunWa server and manage templates and MCP policy

| Operation          | Route                                                   | Notes                                                                     |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Convert Voice Note | `POST /api/{session}/media/convert/voice`               | The response carries the converted audio as base64 data with its mimetype |
| Create Template    | `POST /api/sessions/{session}/templates`                |                                                                           |
| Delete Template    | `DELETE /api/sessions/{session}/templates/{templateId}` |                                                                           |
| Get Audit Logs     | `GET /api/audit`                                        |                                                                           |
| Get MCP Policy     | `GET /api/sessions/{session}/mcp`                       |                                                                           |
| Get Server Status  | `GET /api/server/status`                                |                                                                           |
| Get Version        | `GET /api/version`                                      |                                                                           |
| Get Workers        | `GET /api/workers`                                      |                                                                           |
| Health             | `GET /health`                                           |                                                                           |
| List MCP Tools     | `GET /api/mcp/tools`                                    |                                                                           |
| List Templates     | `GET /api/sessions/{session}/templates`                 |                                                                           |
| Ping               | `GET /ping`                                             |                                                                           |
| Update MCP Policy  | `PUT /api/sessions/{session}/mcp`                       |                                                                           |

## Deliberately not exposed

These server endpoints are broken or stubbed, so the package does not build workflows on them. Two of them are still listed as Message operations for WAHA route parity, as noted below; the supported substitutes are in the operations reference.

- Chat mute and unmute (`POST /api/{session}/chats/{chatId}/mute` and `/unmute`): always answers 400, because no engine implements `muteChat`.
- Contact block and unblock (`POST /api/contacts/block` and `/unblock`): always answers 500 on the NOWEB engine.
- Group delete (`DELETE /api/{session}/groups/{groupId}`): always answers 500 even though the engine has a `deleteGroup` method.
- `GET /api/contacts/about`: stub that returns an empty string.
- `POST /api/sendSticker`: currently fails, because the route has no `:session` path parameter for its session resolver. The Message resource still exposes Send Sticker for WAHA route parity, so it will fail until the server route is fixed.
- `GET /api/messages`: stub that returns an empty array. The Message resource still exposes Get Messages for WAHA route parity; use Chat → Get Messages, which calls `GET /api/{session}/chats/{chatId}/messages`, instead.

## Workflow examples

### Reply to an inbound message with an LLM

1. Add a BunWa Trigger, pick the session, and select the `message.any` event (or `message` for incoming messages only).
2. Add a Filter node to keep incoming direct messages, for example `{{ $json.data.fromMe }}` is false and `{{ $json.data.from }}` does not end in `@g.us`.
3. Add an AI node (for example Basic LLM Chain or OpenAI) and pass `{{ $json.data.body }}` as the prompt.
4. Add a BunWa node with Message → Reply, using the trigger's `session`, Chat ID `{{ $json.data.from }}` and the model output as Text.

### Alert when a session drops

1. Add a BunWa Trigger, pick the session, and select the `session.status` event.
2. Add a Filter node to keep items where `{{ $json.data.status }}` is `STOPPED` or `FAILED`. BunWa session statuses are `STOPPED`, `STARTING`, `SCAN_QR_CODE`, `WORKING` and `FAILED`.
3. Post the alert with a Slack node or an HTTP Request node, including `{{ $json.session }}` and `{{ $json.data.status }}`.

### Broadcast in batches

1. Add a BunWa node with Message → Send Bulk, fill in the recipients JSON, the content JSON, a delay and the Stop on Error option. The response carries a `batchId`.
2. Add a Wait node and wait a few seconds so the batch can make progress.
3. Add a BunWa node with Message → Get Batch Status and the `batchId` from step 1.
4. Add an IF node: while `{{ $json.status }}` is `pending` or `processing`, loop back to the Wait node; `completed`, `failed` and `cancelled` are terminal. For long lists, poll from a Schedule Trigger instead and store the `batchId`.

## Development

```sh
bun install          # or npm install
npm run build        # compiles TypeScript to dist/ and copies the icons
npm run lint         # eslint over credentials, nodes and index.ts
npm test             # builds, then runs node --test over test/*.test.mjs
```

Point n8n at the local build by symlinking the package into the custom nodes folder:

```sh
mkdir -p ~/.n8n/custom
ln -s "$PWD" ~/.n8n/custom/n8n-nodes-bunwa
```

Or set `N8N_CUSTOM_EXTENSIONS` to the folder that should be scanned for custom nodes. Restart n8n after rebuilding.

`test/live-smoke.test.mjs` is skipped unless `BUNWA_URL` and `BUNWA_API_KEY` are set. With both set it runs the node code against a real server:

```sh
BUNWA_URL=http://localhost:3000 BUNWA_API_KEY=your-key npm test
```

## License

This package lives inside the BunWa repository and is covered by the BunWa Community License (BCL) v1.0. It is free to use for personal projects, open-source projects, non-profit and educational use. Commercial use requires the BunWa commercial license. See [LICENSE.md](LICENSE.md) for the full terms.

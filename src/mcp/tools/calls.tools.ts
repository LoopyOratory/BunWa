/**
 * Call MCP tools for BunWa.
 *
 * WEBJS only: WhatsApp Web's VoIP stack places the call and injects audio.
 * NOWEB sessions answer with a clear "not available" error.
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z
  .string()
  .min(1)
  .optional()
  .default('')
  .describe('Session name (e.g. "default"). Not needed when the key is a session-scoped MCP key.');

async function getSession(manager: SessionManager, name: string) {
  return manager.getWorkingSession(name);
}

export function callsTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'CallStart',
      description:
        'Place a WhatsApp voice call to a chat or phone number. WEBJS engine only. Returns the active call, or null if WhatsApp did not register it.',
      tier: 'write',
      category: 'calls',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z
          .string()
          .min(1)
          .describe('Chat JID (e.g. 233201234567@c.us) or a phone number in international format'),
        video: z.boolean().optional().default(false).describe('Place a video call instead of voice'),
        waitForAnswer: z
          .boolean()
          .optional()
          .default(false)
          .describe('Block until the other party answers or timeoutMs elapses'),
        timeoutMs: z.number().int().positive().optional().describe('Answer timeout in milliseconds (default 60000)'),
        injectAudio: z
          .boolean()
          .optional()
          .default(true)
          .describe('Route outgoing audio from injected clips instead of the real microphone'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).startCall(input.chatId, {
          video: input.video,
          waitForAnswer: input.waitForAnswer,
          timeoutMs: input.timeoutMs,
          injectAudio: input.injectAudio,
        });
      },
    },
    {
      name: 'CallEnd',
      description: 'End the active WhatsApp call (or a specific call by id). WEBJS engine only.',
      tier: 'write',
      category: 'calls',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        callId: z.string().optional().describe('Call id; omit to end the active call'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        const result = await (session as any).endCall(input.callId);
        return { success: result };
      },
    },
    {
      name: 'CallActive',
      description: 'Get the current WhatsApp call (ringing, outgoing or connected), or null. WEBJS engine only.',
      tier: 'read',
      category: 'calls',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return { call: await (session as any).getActiveCall() };
      },
    },
    {
      name: 'CallDiagnostics',
      description:
        'Check whether this WhatsApp Web build exposes the private VoIP modules BunWa needs for calls. Run before a live call.',
      tier: 'read',
      category: 'calls',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).callDiagnostics();
      },
    },
    {
      name: 'CallSpeak',
      description:
        'Play a base64 audio clip (MP3/OGG/WAV) into the active WhatsApp call so the other party hears it. Use this for TTS replies. WEBJS engine only.',
      tier: 'write',
      category: 'calls',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        audioBase64: z.string().min(1).describe('Base64-encoded audio clip'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        const duration = await (session as any).playCallAudio(input.audioBase64);
        return { success: true, duration };
      },
    },
  ];
}

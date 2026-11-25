import type { ModelProbeResult, ModelSettingsSecrets } from './agent.types';

const TIMEOUT_MS = 20_000;

interface ProbeEndpoint {
  served: 'primary' | 'fallback';
  provider: string;
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

function endpointsOf(settings: ModelSettingsSecrets): ProbeEndpoint[] {
  const list: ProbeEndpoint[] = [
    {
      served: 'primary',
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
    },
  ];
  list.push({
    served: 'fallback',
    provider: settings.fallbackProvider,
    baseUrl: settings.fallbackBaseUrl,
    apiKey: settings.fallbackApiKey,
    model: settings.fallbackModel,
  });
  return list;
}

function normalizeUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return `${base}${path}`;
}

async function probeOpenAiCompatible(endpoint: ProbeEndpoint, signal: AbortSignal): Promise<string> {
  if (!endpoint.baseUrl) throw new Error('Base URL is empty. Set the provider base URL in model settings.');
  if (!endpoint.apiKey) throw new Error('API key is missing. Add the provider key in model settings.');
  const response = await fetch(normalizeUrl(endpoint.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${endpoint.apiKey}`,
      // OpenCode Go routes each request by session; without this header the
      // probe answers 400 MissingSessionID even though the chat runtime works.
      ...(endpoint.baseUrl.includes('opencode.ai') ? { 'x-opencode-session': 'bunwa-probe' } : {}),
    },
    body: JSON.stringify({
      model: endpoint.model,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      max_tokens: 16,
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const text = body?.choices?.[0]?.message?.content?.trim();
  return text ? `Answered “${text.slice(0, 40)}”.` : 'Answered, but returned no text.';
}

async function probeAnthropic(endpoint: ProbeEndpoint, signal: AbortSignal): Promise<string> {
  if (!endpoint.apiKey) throw new Error('API key is missing. Add the provider key in model settings.');
  const base = endpoint.baseUrl.trim() || 'https://api.anthropic.com';
  const response = await fetch(normalizeUrl(base, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': endpoint.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: endpoint.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const body = (await response.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
  const text = body?.content?.find((part) => part.type === 'text')?.text?.trim();
  return text ? `Answered “${text.slice(0, 40)}”.` : 'Answered, but returned no text.';
}

function describeError(error: unknown, timedOut: boolean): string {
  if (timedOut) return `Didn't answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`;
  const raw = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b|unauthori[sz]ed|invalid.*(key|token|authorization)/i.test(raw))
    return 'The provider refused the API key. Check the key in model settings.';
  if (/\b404\b|not.found|does not exist/i.test(raw)) return 'The provider does not know this model name. Check the model id.';
  if (/\b429\b|rate.?limit|quota|insufficient/i.test(raw)) return 'The provider is rate-limiting or out of credit.';
  if (/\b5\d\d\b/.test(raw)) return 'The provider is having trouble right now (server error).';
  return `Returned an error: ${raw.slice(0, 180)}`;
}

/** Tests the configured primary and fallback models and reports each in plain words. */
export async function probeModelSettings(settings: ModelSettingsSecrets): Promise<ModelProbeResult[]> {
  const results: ModelProbeResult[] = [];
  for (const endpoint of endpointsOf(settings)) {
    if (!endpoint.model.trim()) {
      results.push({
        served: endpoint.served,
        model: endpoint.model,
        ok: false,
        ms: 0,
        detail: endpoint.served === 'primary' ? 'No primary model is set.' : 'No fallback model is set.',
      });
      continue;
    }
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const started = performance.now();
    try {
      const detail =
        endpoint.provider === 'anthropic'
          ? await probeAnthropic(endpoint, signal)
          : await probeOpenAiCompatible(endpoint, signal);
      results.push({
        served: endpoint.served,
        model: endpoint.model,
        ok: true,
        ms: Math.round(performance.now() - started),
        detail,
      });
    } catch (error) {
      results.push({
        served: endpoint.served,
        model: endpoint.model,
        ok: false,
        ms: Math.round(performance.now() - started),
        detail: describeError(error, signal.aborted),
      });
    }
  }
  return results;
}

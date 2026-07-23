/**
 * OpenAI-compatible /v1/chat/completions for expert mode (Ollama, OpenAI, etc.).
 */
import { resolveExpertApiBase, resolveExpertApiKey, resolveExpertApiModel } from './ai-expert-config.js';

function authHeaders() {
    const key = resolveExpertApiKey();
    const h = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
}

function parseSseChunk(line, onToken, acc) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return acc;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return acc;
    try {
        const chunk = JSON.parse(payload);
        const piece = chunk?.choices?.[0]?.delta?.content || '';
        if (piece) {
            const next = acc + piece;
            if (typeof onToken === 'function') onToken(next);
            return next;
        }
    } catch (_) {}
    return acc;
}

export async function expertApiChat({ messages, systemPrompt, maxTokens, temperature, onStream }) {
    const base = resolveExpertApiBase();
    const model = resolveExpertApiModel();
    const body = {
        model,
        messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            ...messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).map((m) => ({
                role: m.role,
                content: String(m.content || ''),
            })),
        ],
        max_tokens: Math.max(16, Math.min(4096, Number(maxTokens) || 256)),
        temperature: Number.isFinite(temperature) ? temperature : 0.6,
        stream: !!onStream,
    };

    const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`API HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
    }

    if (!onStream) {
        const json = await res.json();
        return String(json?.choices?.[0]?.message?.content || '').trim();
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) full = parseSseChunk(line, onStream, full);
    }
    return full.trim();
}

export async function expertApiHealthCheck() {
    const base = resolveExpertApiBase();
    try {
        const res = await fetch(`${base}/models`, { headers: authHeaders(), signal: AbortSignal.timeout(8000) });
        if (res.ok) return true;
    } catch (_) {}
    throw new Error(`Cannot reach API at ${base}`);
}

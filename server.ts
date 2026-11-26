import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables if available in local development
for (const envFile of ['.env', '.env.local']) {
  const envPath = path.resolve(__dirname, envFile);
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // Ignore errors loading env files
    }
  }
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// DeepSeek (OpenAI-compatible Chat Completions)
// Docs: https://api-docs.deepseek.com/api/create-chat-completion/
// Endpoint: POST https://api.deepseek.com/chat/completions
// Current models (2026-11-13): deepseek-flash, deepseek-v4-pro.
// Old names deepseek-chat / deepseek-reasoner were retired 2026-07-24, do not use them.
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

function getDeepSeekApiKey(): string | null {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    return null;
  }
  return apiKey;
}

function mockCommentary(score: number, missed: number): string {
  return score > 10
    ? `Sun Wukong declares: Outstanding reflexes! You caught ${score} snacks like a true Mountain monkey warrior!`
    : `Sun Wukong roasts: Only ${score} snacks caught and ${missed} dropped? Even a baby marmoset has faster paws!`;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callDeepSeekChat(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number; stream?: boolean } = {},
): Promise<any> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || DEEPSEEK_MODEL,
      messages,
      // Commentary is one short sentence: no thinking, fast and cheap.
      thinking: { type: 'disabled' },
      temperature: opts.temperature ?? 0.9,
      max_tokens: opts.maxTokens ?? 120,
      stream: opts.stream ?? false,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`DeepSeek API ${response.status}: ${body.slice(0, 500)}`);
  }
  return response;
}

// Endpoint for game commentary (used by services/geminiService.ts -> fetch('/api/commentary'))
app.post('/api/commentary', async (req, res) => {
  const { score = 0, missed = 0 } = req.body;
  const apiKey = getDeepSeekApiKey();

  if (!apiKey) {
    // Graceful response when API key is awaiting attachment
    return res.json({ commentary: mockCommentary(score, missed) });
  }

  const prompt = `
    You are the legendary Monkey King (Sun Wukong).
    A little monkey minion just played a training game catching falling snacks with their mouth.

    Their Stats:
    - Snacks Caught (Score): ${score}
    - Snacks Missed: ${missed}

    Give them a very short, funny, 1-sentence assessment of their performance.
    If the score is high (>10), praise them arrogantly.
    If low, roast them gently using monkey metaphors.
  `;

  try {
    const response = await callDeepSeekChat([
      { role: 'system', content: 'You are the legendary Monkey King (Sun Wukong). Reply in exactly one short, funny sentence.' },
      { role: 'user', content: prompt },
    ]);
    const data = await response.json();
    const commentary = data?.choices?.[0]?.message?.content?.trim()
      || 'The Monkey King is speechless at your performance.';
    return res.json({ commentary });
  } catch (error: any) {
    console.error('DeepSeek API Error on server:', error);
    return res.json({
      commentary: 'The Monkey King is currently meditating (API Error). But you did well!',
    });
  }
});

// Generic text generation proxy endpoint
async function handleGenerate(req: express.Request, res: express.Response) {
  const { prompt, model, system } = req.body as { prompt?: string; model?: string; system?: string };
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (!getDeepSeekApiKey()) {
    return res.status(503).json({ error: 'API key not configured in environment' });
  }
  try {
    const messages: ChatMessage[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const response = await callDeepSeekChat(messages, { model, maxTokens: 1024 });
    const data = await response.json();
    return res.json({ text: data?.choices?.[0]?.message?.content || '' });
  } catch (error: any) {
    console.error('DeepSeek API Error on server:', error);
    return res.status(500).json({ error: error?.message || 'Generation error' });
  }
}

app.post('/api/deepseek/generate', handleGenerate);
// Legacy alias (was /api/gemini/generate in the AI Studio template)
app.post('/api/gemini/generate', handleGenerate);

// Streaming generation proxy endpoint (Server-Sent Events)
async function handleStream(req: express.Request, res: express.Response) {
  const { prompt, model, system } = req.body as { prompt?: string; model?: string; system?: string };
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (!getDeepSeekApiKey()) {
    return res.status(503).json({ error: 'API key not configured in environment' });
  }
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messages: ChatMessage[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const response = await callDeepSeekChat(messages, { model, maxTokens: 1024, stream: true });
    if (!response.body) throw new Error('DeepSeek returned an empty stream');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          const text = chunk?.choices?.[0]?.delta?.content || '';
          if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
        } catch {
          // Ignore non-JSON keep-alive lines
        }
      }
    }
    res.write('data: [DONE]\n\n');
    return res.end();
  } catch (error: any) {
    console.error('DeepSeek Streaming Error on server:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error?.message || 'Streaming error' });
    } else {
      res.write(`data: ${JSON.stringify({ error: error?.message || 'Stream failed' })}\n\n`);
      return res.end();
    }
  }
}

app.post('/api/deepseek/stream', handleStream);
// Legacy alias (was /api/gemini/stream in the AI Studio template)
app.post('/api/gemini/stream', handleStream);

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

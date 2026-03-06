/**
 * AI Service — OpenAI-compatible proxy with streaming, queuing, and audit logging.
 *
 * System prompt is loaded from docs/SYSTEM-PROMPT.md (re-read on every request
 * so changes made in the editor take effect immediately).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const AI_ENDPOINT = process.env.AI_ENDPOINT || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'llama3';
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '4096', 10);
const AI_CONTEXT_WINDOW = parseInt(process.env.AI_CONTEXT_WINDOW || '8192', 10);
const AI_TOOLS_ENABLED = (process.env.AI_TOOLS_ENABLED || 'false').toLowerCase() === 'true';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_QUEUE_DEPTH = 5;

export function isAiEnabled(): boolean {
  return AI_ENDPOINT.length > 0;
}

export function getAiConfig() {
  return { enabled: isAiEnabled(), model: AI_MODEL };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiChatRequest {
  filePath: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentContent: string;
  userName: string;
  summarise?: boolean;
}

export interface EditInstruction {
  search: string;
  replace: string;
}

interface QueueEntry {
  execute: () => void;
  reject: (err: Error) => void;
  position: number;
}

interface RoomQueue {
  active: boolean;
  queue: QueueEntry[];
}

// ---------------------------------------------------------------------------
// System prompt (loaded from file, with fallback)
// ---------------------------------------------------------------------------

const FALLBACK_SYSTEM_PROMPT = `You are an AI architect assistant embedded in a collaborative Markdown editor.
Your role is to help users write, review, and improve Markdown documents.

When the user asks you to edit the document, respond with edit instructions using this format:

<<<EDIT
SEARCH: exact text to find
REPLACE: replacement text
>>>

Never replace the entire document — only modify the specific sections that need changing.
The current document content will be provided. Reference specific sections by quoting them.
Be concise, professional, and helpful.`;

/**
 * Resolve the path to the SYSTEM-PROMPT.md file.
 * Uses the DOCS_PATH if set, otherwise falls back to the repo docs/ directory.
 */
function getSystemPromptPath(): string {
  const docsPath = process.env.DOCS_PATH || path.join(__dirname, '../../../docs');
  return path.join(docsPath, 'SYSTEM-PROMPT.md');
}

/**
 * Load the system prompt from SYSTEM-PROMPT.md.
 * Re-reads on every call so that edits made in the editor take effect immediately.
 */
async function loadSystemPrompt(): Promise<string> {
  try {
    const promptPath = getSystemPromptPath();
    const content = await fs.readFile(promptPath, 'utf-8');
    if (content.trim().length > 0) {
      console.log(`[AI] Loaded system prompt from ${promptPath} (${content.length} chars)`);
      return content.trim();
    }
  } catch (err: any) {
    console.warn(`[AI] Could not load SYSTEM-PROMPT.md: ${err.message}. Using fallback.`);
  }
  return FALLBACK_SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// Tool definitions (only used when AI_TOOLS_ENABLED=true)
// ---------------------------------------------------------------------------

const EDIT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'edit_document',
    description:
      'Make surgical edits to the Markdown document. Each edit specifies exact text to find and its replacement.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              search: {
                type: 'string',
                description: 'Exact text to find in the document, must match verbatim',
              },
              replace: {
                type: 'string',
                description: 'Replacement text',
              },
            },
            required: ['search', 'replace'],
          },
        },
      },
      required: ['edits'],
    },
  },
};

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Per-room request queue
// ---------------------------------------------------------------------------

const roomQueues = new Map<string, RoomQueue>();

function getOrCreateQueue(roomName: string): RoomQueue {
  let rq = roomQueues.get(roomName);
  if (!rq) {
    rq = { active: false, queue: [] };
    roomQueues.set(roomName, rq);
  }
  return rq;
}

function processNext(roomName: string): void {
  const rq = roomQueues.get(roomName);
  if (!rq) return;
  if (rq.queue.length === 0) {
    rq.active = false;
    return;
  }
  const next = rq.queue.shift()!;
  rq.active = true;
  // Update positions for remaining entries
  rq.queue.forEach((entry, i) => {
    entry.position = i + 1;
  });
  next.execute();
}

/**
 * Enqueue an AI request for a room. Returns a promise that resolves when
 * the request can proceed, or rejects if the queue is full.
 * The returned object includes the queue position (0 = executing immediately).
 */
export function enqueueRequest(
  roomName: string
): { promise: Promise<void>; position: number; cancel: () => void } {
  const rq = getOrCreateQueue(roomName);

  if (!rq.active) {
    rq.active = true;
    return { promise: Promise.resolve(), position: 0, cancel: () => {} };
  }

  if (rq.queue.length >= MAX_QUEUE_DEPTH) {
    return {
      promise: Promise.reject(new Error('Queue full')),
      position: -1,
      cancel: () => {},
    };
  }

  let resolveFn: () => void;
  let rejectFn: (err: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const position = rq.queue.length + 1;
  const entry: QueueEntry = {
    execute: () => resolveFn!(),
    reject: (err: Error) => rejectFn!(err),
    position,
  };
  rq.queue.push(entry);

  const cancel = () => {
    const idx = rq.queue.indexOf(entry);
    if (idx !== -1) {
      rq.queue.splice(idx, 1);
      rejectFn(new Error('Cancelled'));
    }
  };

  return { promise, position, cancel };
}

export function releaseQueue(roomName: string): void {
  processNext(roomName);
}

// ---------------------------------------------------------------------------
// Build messages array for the AI API
// ---------------------------------------------------------------------------

async function buildMessages(
  req: AiChatRequest
): Promise<Array<{ role: string; content: string }>> {
  const systemPrompt = await loadSystemPrompt();
  const systemTokens = estimateTokens(systemPrompt);
  const docTokens = estimateTokens(req.documentContent);
  const budgetForHistory = AI_CONTEXT_WINDOW - AI_MAX_TOKENS - systemTokens - docTokens - 100; // 100 token margin

  // Always include system prompt with document content
  const msgs: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n## Current Document (${req.filePath})\n\n${req.documentContent}`,
    },
  ];

  // Add as much chat history as fits, most recent first
  let usedTokens = 0;
  const historyToInclude: Array<{ role: string; content: string }> = [];

  for (let i = req.messages.length - 1; i >= 0; i--) {
    const msg = req.messages[i];
    const msgTokens = estimateTokens(msg.content);
    if (usedTokens + msgTokens > budgetForHistory && historyToInclude.length > 0) {
      break; // Don't include this message if it would exceed budget (but always include at least the latest)
    }
    historyToInclude.unshift(msg);
    usedTokens += msgTokens;
    if (usedTokens > budgetForHistory) break;
  }

  msgs.push(...historyToInclude);
  return msgs;
}

// ---------------------------------------------------------------------------
// Text-based fallback: parse <<<EDIT blocks
// ---------------------------------------------------------------------------

function parseTextEdits(text: string): EditInstruction[] {
  const edits: EditInstruction[] = [];
  const regex = /<<<EDIT\nSEARCH:\s*([\s\S]*?)\nREPLACE:\s*([\s\S]*?)\n>>>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    edits.push({ search: match[1].trim(), replace: match[2].trim() });
  }
  return edits;
}

// ---------------------------------------------------------------------------
// SSE writing helpers
// ---------------------------------------------------------------------------

export type SseWriter = (event: string, data: object) => void;

function createSseWriter(res: {
  write: (chunk: string) => boolean;
  flush?: () => void;
}): SseWriter {
  return (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };
}

// ---------------------------------------------------------------------------
// Stream AI response
// ---------------------------------------------------------------------------

export async function streamAiChat(
  req: AiChatRequest,
  res: { write: (chunk: string) => boolean; flush?: () => void; end: () => void },
  signal: AbortSignal
): Promise<void> {
  const sseSend = createSseWriter(res);
  const startTime = Date.now();

  if (!isAiEnabled()) {
    sseSend('error', { message: 'AI is not configured. Set AI_ENDPOINT in .env to enable.' });
    res.end();
    return;
  }

  const messages = await buildMessages(req);

  console.log(`[AI] Request: model=${AI_MODEL} endpoint=${AI_ENDPOINT}/chat/completions`);
  console.log(`[AI] Messages: ${messages.length} messages, tools=${AI_TOOLS_ENABLED}`);

  // Build the request body
  const body: Record<string, unknown> = {
    model: AI_MODEL,
    messages,
    max_tokens: AI_MAX_TOKENS,
    stream: true,
  };

  // Only include tools if explicitly enabled
  if (AI_TOOLS_ENABLED) {
    body.tools = [EDIT_TOOL];
  }

  let aiRes: Response;
  try {
    const url = `${AI_ENDPOINT}/chat/completions`;
    console.log(`[AI] Fetching: ${url}`);
    aiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    console.log(`[AI] Response status: ${aiRes.status} ${aiRes.statusText}`);
    console.log(`[AI] Response headers: content-type=${aiRes.headers.get('content-type')}`);
  } catch (err: any) {
    console.error(`[AI] Fetch error:`, err);
    if (err.name === 'AbortError') {
      sseSend('error', { message: 'Request timed out' });
    } else {
      sseSend('error', { message: `AI endpoint error: ${err.message}` });
    }
    res.end();
    return;
  }

  if (!aiRes.ok) {
    let errorMsg = `AI returned status ${aiRes.status}`;
    try {
      const errBody = await aiRes.text();
      errorMsg += `: ${errBody.slice(0, 500)}`;
      console.error(`[AI] Error response body: ${errBody.slice(0, 1000)}`);
    } catch {
      // ignore
    }
    sseSend('error', { message: errorMsg });
    res.end();
    return;
  }

  // Parse streaming response
  const reader = aiRes.body?.getReader();
  if (!reader) {
    sseSend('error', { message: 'No response body from AI endpoint' });
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let toolCallArgs = '';
  let toolCallActive = false;
  let promptTokens = 0;
  let completionTokens = 0;
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const rawChunk = decoder.decode(value, { stream: true });
      chunkCount++;
      if (chunkCount <= 3) {
        console.log(`[AI] Raw chunk ${chunkCount}: ${rawChunk.slice(0, 300)}${rawChunk.length > 300 ? '...' : ''}`);
      }

      buffer += rawChunk;

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Skip empty lines and comments
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          console.log('[AI] Received [DONE] marker');
          continue;
        }

        let chunk: any;
        try {
          chunk = JSON.parse(dataStr);
        } catch {
          console.warn(`[AI] Failed to parse chunk: ${dataStr.slice(0, 200)}`);
          continue;
        }

        // Extract usage if present
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || 0;
          completionTokens = chunk.usage.completion_tokens || 0;
        }

        const choice = chunk.choices?.[0];
        if (!choice) {
          // Some APIs put the content at the top level or in a different structure
          if (chunk.content) {
            fullContent += chunk.content;
            sseSend('delta', { content: chunk.content });
          }
          continue;
        }

        const delta = choice.delta;
        if (!delta) {
          // Handle non-streaming response format (message instead of delta)
          if (choice.message?.content) {
            fullContent += choice.message.content;
            sseSend('delta', { content: choice.message.content });
          }
          continue;
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name === 'edit_document') {
              toolCallActive = true;
            }
            if (tc.function?.arguments) {
              toolCallArgs += tc.function.arguments;
            }
          }
          continue;
        }

        // Handle content deltas
        if (delta.content) {
          fullContent += delta.content;
          sseSend('delta', { content: delta.content });
        }

        // If finish_reason is present, process tool calls
        if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
          if (toolCallActive && toolCallArgs) {
            try {
              const parsed = JSON.parse(toolCallArgs);
              if (parsed.edits && Array.isArray(parsed.edits)) {
                sseSend('edit', { edits: parsed.edits });
              }
            } catch (err) {
              console.error('[AI] Failed to parse tool call arguments:', err);
            }
          }
        }
      }
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.error('[AI] Stream error:', err);
      sseSend('error', { message: `Stream error: ${err.message}` });
    }
  }

  console.log(`[AI] Stream complete: ${chunkCount} chunks, ${fullContent.length} chars content`);

  // Check for text-based edit fallback in the full content
  if (!toolCallActive && fullContent) {
    const textEdits = parseTextEdits(fullContent);
    if (textEdits.length > 0) {
      console.log(`[AI] Found ${textEdits.length} text-based edit(s) in response`);
      sseSend('edit', { edits: textEdits });
    }
  }

  // Send done event
  const duration = Date.now() - startTime;
  sseSend('done', { usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } });

  // Audit log
  const editsInContent = toolCallActive ? 1 : parseTextEdits(fullContent).length;
  console.log(
    `[AI-Audit] user=${req.userName} file=${req.filePath} ` +
      `prompt_tokens=${promptTokens} completion_tokens=${completionTokens} ` +
      `edits=${editsInContent} duration=${duration}ms`
  );

  res.end();
}

// ---------------------------------------------------------------------------
// Summarise document (preliminary AI call)
// ---------------------------------------------------------------------------

export async function summariseDocument(documentContent: string): Promise<string> {
  if (!isAiEnabled()) return documentContent;

  try {
    const response = await fetch(`${AI_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a document summariser. Produce a concise summary preserving key structure and content.',
          },
          {
            role: 'user',
            content: `Summarise the following Markdown document in under 500 words, preserving key structure and content:\n\n${documentContent}`,
          },
        ],
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error('[AI] Summarisation failed:', response.status);
      return documentContent;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || documentContent;
  } catch (err) {
    console.error('[AI] Summarisation error:', err);
    return documentContent;
  }
}

// ---------------------------------------------------------------------------
// Token budget check (exported for client context warning)
// ---------------------------------------------------------------------------

export function getContextBudget() {
  // Use a rough estimate for system prompt size since we don't want to read the file synchronously
  const systemTokenEstimate = 500;
  return {
    contextWindow: AI_CONTEXT_WINDOW,
    maxTokens: AI_MAX_TOKENS,
    availableForDoc: AI_CONTEXT_WINDOW - AI_MAX_TOKENS - systemTokenEstimate,
  };
}

export { REQUEST_TIMEOUT_MS };

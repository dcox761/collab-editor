import { Router, Request, Response } from 'express';
import {
  isAiEnabled,
  getAiConfig,
  getContextBudget,
  streamAiChat,
  summariseDocument,
  enqueueRequest,
  releaseQueue,
  REQUEST_TIMEOUT_MS,
} from '../services/aiService.js';

export const aiRouter = Router();

/**
 * GET /api/ai/config
 * Returns whether AI is enabled and which model is configured.
 */
aiRouter.get('/ai/config', (_req: Request, res: Response) => {
  res.json(getAiConfig());
});

/**
 * GET /api/ai/budget
 * Returns token budget information for client-side context warnings.
 */
aiRouter.get('/ai/budget', (_req: Request, res: Response) => {
  res.json(getContextBudget());
});

/**
 * POST /api/ai/chat
 * Streams an AI response as SSE events.
 * Body: { filePath, messages, documentContent, userName, summarise? }
 */
aiRouter.post('/ai/chat', async (req: Request, res: Response) => {
  console.log('[AI-Route] POST /api/ai/chat received');

  if (!isAiEnabled()) {
    console.log('[AI-Route] AI not enabled, returning 503');
    res.status(503).json({ error: 'AI is not configured. Set AI_ENDPOINT in .env to enable.' });
    return;
  }

  const { filePath, messages, documentContent, userName, summarise } = req.body;
  console.log(`[AI-Route] filePath=${filePath} messages=${messages?.length} docLen=${documentContent?.length} user=${userName}`);

  if (!filePath || !messages || documentContent === undefined || documentContent === null) {
    res.status(400).json({ error: 'Missing required fields: filePath, messages, documentContent' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Enqueue request for this room
  const roomName = filePath;
  let queueResult;
  try {
    queueResult = enqueueRequest(roomName);
    console.log(`[AI-Route] Queue position: ${queueResult.position}`);
  } catch (err: any) {
    console.error('[AI-Route] Queue error:', err);
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Queue error' })}\n\n`);
    res.end();
    return;
  }

  // If queued, send position
  if (queueResult.position > 0) {
    res.write(
      `event: queued\ndata: ${JSON.stringify({ position: queueResult.position })}\n\n`
    );
  }

  // Handle client disconnect — also abort the AI request
  // IMPORTANT: Use res.on('close'), NOT req.on('close').
  // In Node >= 18, req 'close' fires when the request body is fully consumed
  // (immediately for POST JSON), not when the client actually disconnects.
  const controller = new AbortController();
  let cancelled = false;
  res.on('close', () => {
    if (!res.writableFinished) {
      console.log('[AI-Route] Client disconnected before response finished');
      cancelled = true;
      controller.abort();
      queueResult.cancel();
    }
  });

  // Wait for queue turn
  try {
    await queueResult.promise;
  } catch (err: any) {
    console.log(`[AI-Route] Queue wait error: ${err.message}`);
    if (err.message === 'Cancelled') {
      res.end();
      return;
    }
    if (err.message === 'Queue full') {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: 'Too many pending requests. Please try again later.' })}\n\n`
      );
      res.end();
      return;
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
    return;
  }

  if (cancelled) {
    console.log('[AI-Route] Request was cancelled while queued');
    releaseQueue(roomName);
    res.end();
    return;
  }

  console.log('[AI-Route] Queue passed, starting AI stream');

  // Optionally summarise document content
  let finalDocContent = documentContent;
  if (summarise) {
    finalDocContent = await summariseDocument(documentContent);
  }

  // Timeout for the AI request
  const timeout = setTimeout(() => {
    console.log('[AI-Route] Request timeout, aborting');
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    await streamAiChat(
      {
        filePath,
        messages,
        documentContent: finalDocContent,
        userName: userName || 'anonymous',
      },
      res,
      controller.signal
    );
    console.log('[AI-Route] streamAiChat completed');
  } catch (err: any) {
    console.error('[AI-Route] streamAiChat error:', err?.message || err);
  } finally {
    clearTimeout(timeout);
    releaseQueue(roomName);
    console.log('[AI-Route] Queue released');
  }
});

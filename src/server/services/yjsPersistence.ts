import * as Y from 'yjs';
import { readFileContent, writeFileContent } from './fileService.js';
import { getDoc, getActiveRoomNames } from './yjsService.js';

/**
 * Set of room names with unsaved changes since last disk write.
 */
const dirtyDocs = new Set<string>();

let docsPath = '';
let saveInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the persistence layer with the docs root path.
 * Starts the periodic save loop.
 */
export function initPersistence(docsRoot: string): void {
  docsPath = docsRoot;
  // Start the 5-second save loop
  saveInterval = setInterval(saveLoop, 5000);
  console.log('[Y.js Persistence] Save loop started (every 5s)');
}

/**
 * Stop the periodic save loop. Called during server shutdown.
 */
export function stopPersistence(): void {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
}

/**
 * Load markdown content from disk into a Y.Doc's Y.Text.
 * Called when the first client connects to a room.
 */
export async function loadDocFromDisk(roomName: string, doc: Y.Doc): Promise<void> {
  try {
    const markdown = await readFileContent(docsPath, roomName);
    const yText = doc.getText('document');
    doc.transact(() => {
      yText.insert(0, markdown);
    });
    console.log(`[Y.js Persistence] Loaded from disk: ${roomName} (${markdown.length} chars)`);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // New file — Y.Text starts empty, that's fine
      console.log(`[Y.js Persistence] New document (no file on disk): ${roomName}`);
    } else if (err.code === 'PATH_TRAVERSAL') {
      console.error(`[Y.js Persistence] Path traversal blocked: ${roomName}`);
      throw err;
    } else {
      console.error(`[Y.js Persistence] Error loading ${roomName}:`, err);
      throw err;
    }
  }
}

/**
 * Save a Y.Doc's Y.Text content to disk.
 * Called by the periodic save loop and on room cleanup.
 */
export async function saveDocToDisk(roomName: string, doc: Y.Doc): Promise<void> {
  const yText = doc.getText('document');
  const markdown = yText.toString();
  await writeFileContent(docsPath, roomName, markdown);
  dirtyDocs.delete(roomName);
  console.log(`[Y.js Persistence] Saved to disk: ${roomName} (${markdown.length} chars)`);
}

/**
 * Mark a room as having unsaved changes.
 * Called when a Y.Doc receives updates.
 */
export function markDirty(roomName: string): void {
  dirtyDocs.add(roomName);
}

/**
 * Force save a specific room immediately.
 * Used by the Ctrl+S force-save endpoint.
 */
export async function forceSave(roomName: string): Promise<boolean> {
  const doc = getDoc(roomName);
  if (!doc) return false;
  await saveDocToDisk(roomName, doc);
  return true;
}

/**
 * Periodic save loop — writes all dirty docs to disk.
 */
async function saveLoop(): Promise<void> {
  if (dirtyDocs.size === 0) return;

  // Copy the set to avoid mutation during iteration
  const toSave = Array.from(dirtyDocs);

  for (const roomName of toSave) {
    const doc = getDoc(roomName);
    if (!doc) {
      dirtyDocs.delete(roomName);
      continue;
    }
    try {
      await saveDocToDisk(roomName, doc);
    } catch (err) {
      console.error(`[Y.js Persistence] Error saving ${roomName}:`, err);
      // Keep it in dirtyDocs so we retry next cycle
    }
  }
}

/**
 * Save all dirty docs immediately. Called during server shutdown.
 */
export async function saveAllDirty(): Promise<void> {
  console.log(`[Y.js Persistence] Saving all dirty docs (${dirtyDocs.size} pending)...`);
  await saveLoop();
}

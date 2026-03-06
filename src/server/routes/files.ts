import { Router, Request, Response } from 'express';
import {
  readFileContent,
  writeFileContent,
  getFileTree,
  createFileOrDir,
  deleteFileOrDir,
  renameFileOrDir,
} from '../services/fileService.js';
import { forceSave } from '../services/yjsPersistence.js';

export const filesRouter = Router();

// Get file tree
filesRouter.get('/tree', async (req: Request, res: Response) => {
  try {
    const docsPath = req.app.locals.docsPath as string;
    const tree = await getFileTree(docsPath);
    res.json(tree);
  } catch (err) {
    console.error('Error reading file tree:', err);
    res.status(500).json({ error: 'Failed to read file tree' });
  }
});

// Read a file
filesRouter.get('/files/*', async (req: Request, res: Response) => {
  try {
    const docsPath = req.app.locals.docsPath as string;
    const filePath = (req.params as Record<string, string>)[0];
    const content = await readFileContent(docsPath, filePath);
    res.json({ content });
  } catch (err: any) {
    if (err.code === 'PATH_TRAVERSAL') {
      res.status(400).json({ error: 'Invalid path' });
    } else if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else {
      console.error('Error reading file:', err);
      res.status(500).json({ error: 'Failed to read file' });
    }
  }
});

// Save / update a file
filesRouter.put('/files/*', async (req: Request, res: Response) => {
  try {
    const docsPath = req.app.locals.docsPath as string;
    const filePath = (req.params as Record<string, string>)[0];
    const { content } = req.body;
    console.log(`[DEBUG-SAVE] PUT /api/files/${filePath}`, {
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : 'N/A',
      contentEmpty: typeof content === 'string' ? content.trim() === '' : 'N/A',
      contentPreview: typeof content === 'string' ? content.substring(0, 100) : 'N/A',
    });
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string' });
      return;
    }
    if (content.trim() === '') {
      console.warn(`[DEBUG-SAVE] WARNING: Writing EMPTY content to file: ${filePath}`);
    }
    await writeFileContent(docsPath, filePath, content);
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'PATH_TRAVERSAL') {
      res.status(400).json({ error: 'Invalid path' });
    } else {
      console.error('Error writing file:', err);
      res.status(500).json({ error: 'Failed to write file' });
    }
  }
});

// Create a file or directory
filesRouter.post('/files/*', async (req: Request, res: Response) => {
  try {
    const docsPath = req.app.locals.docsPath as string;
    const filePath = (req.params as Record<string, string>)[0];
    const { type } = req.body;
    if (type !== 'file' && type !== 'dir') {
      res.status(400).json({ error: 'type must be "file" or "dir"' });
      return;
    }
    await createFileOrDir(docsPath, filePath, type);
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'PATH_TRAVERSAL') {
      res.status(400).json({ error: 'Invalid path' });
    } else if (err.code === 'EEXIST') {
      res.status(409).json({ error: 'Already exists' });
    } else {
      console.error('Error creating file/dir:', err);
      res.status(500).json({ error: 'Failed to create' });
    }
  }
});

// Delete a file or directory
filesRouter.delete('/files/*', async (req: Request, res: Response) => {
  try {
    const docsPath = req.app.locals.docsPath as string;
    const filePath = (req.params as Record<string, string>)[0];
    await deleteFileOrDir(docsPath, filePath);
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'PATH_TRAVERSAL') {
      res.status(400).json({ error: 'Invalid path' });
    } else if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Not found' });
    } else {
      console.error('Error deleting:', err);
      res.status(500).json({ error: 'Failed to delete' });
    }
  }
});

// Rename / move a file or directory
filesRouter.patch('/files/*', async (req: Request, res: Response) => {
  try {
    const docsPath = req.app.locals.docsPath as string;
    const filePath = (req.params as Record<string, string>)[0];
    const { newPath } = req.body;
    if (typeof newPath !== 'string') {
      res.status(400).json({ error: 'newPath must be a string' });
      return;
    }
    await renameFileOrDir(docsPath, filePath, newPath);
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'PATH_TRAVERSAL') {
      res.status(400).json({ error: 'Invalid path' });
    } else {
      console.error('Error renaming:', err);
      res.status(500).json({ error: 'Failed to rename' });
    }
  }
});

// Force-save a Y.js document to disk (triggered by Ctrl+S)
filesRouter.post('/save/*', async (req: Request, res: Response) => {
  try {
    const filePath = (req.params as Record<string, string>)[0];
    if (!filePath) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }
    const saved = await forceSave(filePath);
    if (saved) {
      res.json({ success: true });
    } else {
      // No active Y.js room for this file — nothing to save
      res.json({ success: true, note: 'No active collaboration session' });
    }
  } catch (err) {
    console.error('Error force-saving:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

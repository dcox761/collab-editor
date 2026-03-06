import fs from 'fs/promises';
import path from 'path';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileTreeNode[];
}

/**
 * Validate that a resolved path is within the docs root.
 * Throws an error with code PATH_TRAVERSAL if not.
 */
function safePath(docsRoot: string, relativePath: string): string {
  const resolved = path.resolve(docsRoot, relativePath);
  if (!resolved.startsWith(docsRoot + path.sep) && resolved !== docsRoot) {
    const err = new Error('Path traversal detected') as Error & { code: string };
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }
  return resolved;
}

/**
 * Read a markdown file and return its content.
 * Line endings are normalised to LF (\n) because CodeMirror uses LF internally.
 * If CRLF (or standalone CR) is left in Y.Text, position indices desync with
 * the CM document — each \r\n counts as 2 chars in Y.Text but 1 in CM.
 */
export async function readFileContent(docsRoot: string, relativePath: string): Promise<string> {
  const fullPath = safePath(docsRoot, relativePath);
  const raw = await fs.readFile(fullPath, 'utf-8');
  return raw.replace(/\r\n?/g, '\n');
}

/**
 * Write content to a markdown file.
 */
export async function writeFileContent(docsRoot: string, relativePath: string, content: string): Promise<void> {
  const fullPath = safePath(docsRoot, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

/**
 * Build a recursive file tree of the docs directory.
 * Only includes .md files and directories.
 */
export async function getFileTree(docsRoot: string): Promise<FileTreeNode[]> {
  return buildTree(docsRoot, docsRoot);
}

async function buildTree(docsRoot: string, dirPath: string): Promise<FileTreeNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];

  // Sort: directories first, then files, alphabetically
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    // Skip hidden files/directories
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(docsRoot, fullPath);

    if (entry.isDirectory()) {
      const children = await buildTree(docsRoot, fullPath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'dir',
        children,
      });
    } else if (entry.name.endsWith('.md')) {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
      });
    }
  }

  return nodes;
}

/**
 * Create a new file or directory.
 */
export async function createFileOrDir(docsRoot: string, relativePath: string, type: 'file' | 'dir'): Promise<void> {
  const fullPath = safePath(docsRoot, relativePath);

  if (type === 'dir') {
    await fs.mkdir(fullPath, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    // Create file only if it doesn't exist
    try {
      await fs.access(fullPath);
      const err = new Error('File already exists') as Error & { code: string };
      err.code = 'EEXIST';
      throw err;
    } catch (e: any) {
      if (e.code === 'EEXIST') throw e;
      // ENOENT means file doesn't exist — good, create it
      await fs.writeFile(fullPath, '', 'utf-8');
    }
  }
}

/**
 * Delete a file or directory.
 */
export async function deleteFileOrDir(docsRoot: string, relativePath: string): Promise<void> {
  const fullPath = safePath(docsRoot, relativePath);
  const stat = await fs.stat(fullPath);
  if (stat.isDirectory()) {
    await fs.rm(fullPath, { recursive: true });
  } else {
    await fs.unlink(fullPath);
  }
}

/**
 * Rename / move a file or directory.
 */
export async function renameFileOrDir(docsRoot: string, relativePath: string, newRelativePath: string): Promise<void> {
  const oldFullPath = safePath(docsRoot, relativePath);
  const newFullPath = safePath(docsRoot, newRelativePath);
  await fs.mkdir(path.dirname(newFullPath), { recursive: true });
  await fs.rename(oldFullPath, newFullPath);
}

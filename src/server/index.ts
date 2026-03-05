import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { filesRouter } from './routes/files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DOCS_PATH = process.env.DOCS_PATH || path.join(__dirname, '../../docs');

// Make DOCS_PATH available to routes
app.locals.docsPath = path.resolve(DOCS_PATH);

app.use(express.json());

// API routes
app.use('/api', filesRouter);

// Serve static client files in production
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving docs from: ${app.locals.docsPath}`);
});

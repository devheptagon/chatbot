import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const clientDir = path.join(__dirname, '../../client');

const router = Router();

router.get(['/chatbot', '/chatbot/'], (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

export default router;

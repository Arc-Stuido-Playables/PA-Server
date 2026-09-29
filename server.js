import path from 'node:path';
import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '0.0.0.0';
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 100;

const server = await createApp({
  dataDir,
  maxUploadBytes: maxUploadMb * 1024 * 1024,
  adminUser: process.env.ADMIN_USER,
  adminPassword: process.env.ADMIN_PASSWORD,
  deletePassword: process.env.DELETE_PASSWORD,
});

server.listen(port, host, () => {
  const auth = process.env.ADMIN_USER && process.env.ADMIN_PASSWORD ? 'on' : 'off';
  console.log(`PA-Server on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/list`);
  const del = process.env.DELETE_PASSWORD ? 'on' : 'off';
  console.log(`data: ${dataDir} | upload limit: ${maxUploadMb} MB | auth: ${auth} | delete: ${del}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

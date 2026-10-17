import path from 'node:path';
import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '0.0.0.0';
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
// 0 or unset = no upload size limit.
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 0;
// Password for the team pages (/list, upload, delete). Defaults to the delete password.
const accessPassword = process.env.ACCESS_PASSWORD || process.env.DELETE_PASSWORD;

const server = await createApp({
  dataDir,
  maxUploadBytes: maxUploadMb * 1024 * 1024,
  adminUser: process.env.ADMIN_USER,
  adminPassword: process.env.ADMIN_PASSWORD,
  accessPassword,
  deletePassword: process.env.DELETE_PASSWORD,
});

server.listen(port, host, () => {
  const on = (v) => (v ? 'on' : 'off');
  console.log(`PA-Server on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/list`);
  console.log(
    `data: ${dataDir} | upload limit: ${maxUploadMb ? `${maxUploadMb} MB` : 'none'} | ` +
      `list password: ${on(accessPassword)} | delete: ${on(process.env.DELETE_PASSWORD)} | ` +
      `basic auth: ${on(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD)}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

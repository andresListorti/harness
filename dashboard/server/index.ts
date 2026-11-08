import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app';

export const HOST = '127.0.0.1';
const portValue = process.env.PORT ?? '3001';
export const PORT = Number(portValue);

if (!/^\d+$/.test(portValue) || !Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

export function startServer() {
  return createApp().listen(PORT, HOST);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer();
}

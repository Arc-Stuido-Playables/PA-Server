import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Reduce a client-supplied file name to a safe base name, or null if unusable.
 * Browsers (old IE/Edge) may send full paths such as `C:\fakepath\x.html`.
 */
export function safeName(raw) {
  if (typeof raw !== 'string') return null;
  const base = raw.split(/[\\/]/).pop().normalize('NFC').trim();
  if (!base || base === '.' || base === '..') return null;
  if (CONTROL_CHARS.test(base)) return null;
  if (Buffer.byteLength(base, 'utf8') > 255) return null;
  return base;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const cp1251 = new TextDecoder('windows-1251');

/**
 * Turn a multipart filename parsed as latin1 back into text. Browsers send UTF-8,
 * but some Windows tools (curl, old uploaders) send cp1251 — the source of the
 * `1пак` / `1���` duplicates on the reference server.
 */
export function decodeFilename(raw) {
  // Already decoded via RFC 5987 filename*=
  if (!raw || /[^\x00-\xff]/.test(raw)) return raw;
  const bytes = Buffer.from(raw, 'latin1');
  try {
    return utf8.decode(bytes);
  } catch {
    return cp1251.decode(bytes);
  }
}

export function isHtml(name) {
  return /\.html?$/i.test(name);
}

export class LimitError extends Error {
  constructor() {
    super('File exceeds upload limit');
    this.code = 'LIMIT';
  }
}

export class Storage {
  constructor(dataDir) {
    this.filesDir = path.join(dataDir, 'files');
    // Same volume as filesDir, so rename() below is atomic.
    this.tmpDir = path.join(dataDir, 'tmp');
  }

  async init() {
    await mkdir(this.filesDir, { recursive: true });
    await rm(this.tmpDir, { recursive: true, force: true });
    await mkdir(this.tmpDir, { recursive: true });
  }

  pathOf(name) {
    return path.join(this.filesDir, name);
  }

  /** All regular files, sorted by code point like the reference server. */
  async list() {
    const entries = await readdir(this.filesDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          const s = await stat(this.pathOf(e.name));
          return { name: e.name, size: s.size, mtime: s.mtime };
        }),
    );
    return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** Stat a stored file by (already validated) name; null if missing. */
  async stat(name) {
    try {
      const s = await stat(this.pathOf(name));
      return s.isFile() ? s : null;
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EINVAL') return null;
      throw err;
    }
  }

  /** Delete a stored file by (already validated) name; false if it did not exist. */
  async remove(name) {
    if (!(await this.stat(name))) return false;
    try {
      await rm(this.pathOf(name));
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  /**
   * Write `stream` to a temp file, then atomically move it over `name`.
   * The published file is untouched unless the whole upload succeeds.
   */
  async save(stream, name) {
    const tmp = path.join(this.tmpDir, `${Date.now()}-${randomBytes(6).toString('hex')}`);
    try {
      await pipeline(stream, createWriteStream(tmp, { flags: 'wx' }));
      if (stream.truncated) throw new LimitError();
      await rename(tmp, this.pathOf(name));
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }
}

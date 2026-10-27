import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../env';
import { hmac, safeEqual } from './crypto';

export type Visibility = 'public' | 'private';

export interface StoredObject {
  key: string;
  url: string;
}

export interface Storage {
  put(data: Uint8Array, opts: { mime: string; ext: string; visibility: Visibility }): Promise<StoredObject>;
  get(key: string): Promise<{ data: Uint8Array; size: number } | null>;
  remove(key: string): Promise<void>;
  urlFor(key: string): Promise<string>;
  verifySignature(key: string, exp: string | undefined, sig: string | undefined): boolean;
  readonly driver: 'local' | 's3';
}

const SIGNED_TTL_MS = 6 * 24 * 3600 * 1000;

function newKey(visibility: Visibility, ext: string): string {
  const d = new Date();
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'bin';
  return `${visibility}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${safeExt}`;
}

export function isSafeKey(key: string): boolean {
  return /^(public|private)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(key);
}

class LocalStorage implements Storage {
  readonly driver = 'local' as const;
  constructor(
    private readonly dir: string,
    private readonly publicBase: string,
    private readonly secret: string,
  ) {}
  private file(key: string) {
    if (!isSafeKey(key)) throw new Error('unsafe key');
    return path.join(this.dir, key);
  }
  async put(data: Uint8Array, opts: { mime: string; ext: string; visibility: Visibility }) {
    const key = newKey(opts.visibility, opts.ext);
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return { key, url: await this.urlFor(key) };
  }
  async get(key: string) {
    try {
      const file = this.file(key);
      const [data, info] = await Promise.all([readFile(file), stat(file)]);
      return { data: new Uint8Array(data), size: info.size };
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
  async urlFor(key: string) {
    const base = `${this.publicBase.replace(/\/$/, '')}/files/${key}`;
    if (key.startsWith('public/')) return base;
    const exp = String(Date.now() + SIGNED_TTL_MS);
    return `${base}?exp=${exp}&sig=${hmac(this.secret, `${key}:${exp}`)}`;
  }
  verifySignature(key: string, exp: string | undefined, sig: string | undefined) {
    if (key.startsWith('public/')) return true;
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    return safeEqual(hmac(this.secret, `${key}:${exp}`), sig);
  }
}

class S3Storage implements Storage {
  readonly driver = 's3' as const;
  private client: S3Client;
  constructor(private readonly env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: !!env.S3_ENDPOINT,
      credentials: env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' } : undefined,
    });
  }
  private get bucket() {
    if (!this.env.S3_BUCKET) throw new Error('S3_BUCKET is required');
    return this.env.S3_BUCKET;
  }
  async put(data: Uint8Array, opts: { mime: string; ext: string; visibility: Visibility }) {
    const key = newKey(opts.visibility, opts.ext);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: opts.mime,
        CacheControl: opts.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      }),
    );
    return { key, url: await this.urlFor(key) };
  }
  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const data = await res.Body?.transformToByteArray();
      return data ? { data, size: data.byteLength } : null;
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async urlFor(key: string) {
    if (key.startsWith('public/') && this.env.S3_PUBLIC_URL) return `${this.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 6 * 24 * 3600 });
  }
  verifySignature() {
    return false;
  }
}

export function createStorage(env: Env): Storage {
  if (env.STORAGE_DRIVER === 's3') return new S3Storage(env);
  return new LocalStorage(path.resolve(env.STORAGE_DIR), env.API_PUBLIC_URL, env.JWT_SECRET);
}

/** Detects the real file type from magic bytes. Returns null when unknown/unsafe. */
export function sniffMime(bytes: Uint8Array, declared: string): string | null {
  const b = bytes;
  const at = (i: number, ...vals: number[]) => vals.every((v, j) => b[i + j] === v);
  const ascii = (i: number, s: string) => [...s].every((ch, j) => b[i + j] === ch.charCodeAt(0));
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'audio/wav';
  if (ascii(0, '%PDF')) return 'application/pdf';
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) {
    return declared.startsWith('application/vnd.openxmlformats') || declared === 'application/zip' ? declared : 'application/zip';
  }
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0);
    if (brand.startsWith('M4A')) return 'audio/mp4';
    if (brand.startsWith('qt')) return 'video/quicktime';
    return declared.startsWith('audio/') ? 'audio/mp4' : 'video/mp4';
  }
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return declared.startsWith('audio/') ? 'audio/webm' : 'video/webm';
  if (ascii(0, 'OggS')) return 'audio/ogg';
  if (ascii(0, 'ID3') || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (declared.startsWith('text/')) {
    const sample = b.subarray(0, 4096);
    if (sample.includes(0)) return null;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample.length < b.length ? sample.subarray(0, sample.length - 4) : sample);
      return declared;
    } catch {
      return null;
    }
  }
  return null;
}

export const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

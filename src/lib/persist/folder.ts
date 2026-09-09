/**
 * Silent backups into a folder the user picks once, via the File System Access
 * API (Chrome / Edge). Safari and Firefox don't have it; callers fall back to
 * downloads there.
 */
import { createStore, del, get, set } from 'idb-keyval';
import type { Doc } from '../model/types';
import { docToJson } from './backup';

// Minimal typings for the parts of the API we use (not in TS's dom lib yet).
type PermissionState = 'granted' | 'denied' | 'prompt';
interface DirHandle {
  kind: 'directory';
  name: string;
  queryPermission(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<{ kind: string; name: string }>;
}
interface FileHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}
type PickerWindow = Window & { showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<DirHandle> };

const meta = createStore('claydo-meta', 'meta');
const KEY = 'backupDir';
/** Dated files older than this are pruned. */
const KEEP_DAYS = 60;

export function supportsFolderBackup(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

export const QUICK_FOLDER_NAME = 'claydo_backups';

/**
 * Let the user pick a folder. In `quick` mode the picker opens at the OS
 * Documents folder and we create a `claydo_backups` folder inside whatever
 * they confirm, so the default is one click.
 */
export async function pickBackupFolder(mode: 'quick' | 'pick' = 'pick'): Promise<DirHandle | null> {
  const w = window as PickerWindow;
  if (!w.showDirectoryPicker) return null;
  try {
    let handle = await w.showDirectoryPicker({ id: mode === 'quick' ? 'claydo-quick' : 'claydo-backups', mode: 'readwrite', startIn: 'documents' });
    if (mode === 'quick' && handle.name !== QUICK_FOLDER_NAME) handle = await handle.getDirectoryHandle(QUICK_FOLDER_NAME, { create: true });
    await set(KEY, handle, meta);
    return handle;
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    throw e;
  }
}

export interface BackupFileInfo {
  name: string;
  size: number;
  modified: number;
}

/** The claydo backup files currently in the folder, newest first. */
export async function listBackupFiles(handle: DirHandle): Promise<BackupFileInfo[]> {
  const out: BackupFileInfo[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file' || !/^claydo-.*\.json$/.test(entry.name)) continue;
    try {
      const fh = await handle.getFileHandle(entry.name);
      const f = await fh.getFile();
      out.push({ name: entry.name, size: f.size, modified: f.lastModified });
    } catch {
      /* skip unreadable */
    }
  }
  return out.sort((a, b) => b.modified - a.modified);
}

export async function loadBackupFolder(): Promise<DirHandle | null> {
  try {
    return (await get<DirHandle>(KEY, meta)) ?? null;
  } catch {
    return null;
  }
}

export async function forgetBackupFolder(): Promise<void> {
  await del(KEY, meta);
}

export async function folderPermission(handle: DirHandle): Promise<PermissionState> {
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

/** Must be called from a user gesture (click). */
export async function reconnectBackupFolder(handle: DirHandle): Promise<PermissionState> {
  try {
    return await handle.requestPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

function dayStamp(ts = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Write `claydo-latest.json` (always) and `claydo-YYYY-MM-DD.json` (one per
 * day, overwritten within the day), then prune dated files past KEEP_DAYS.
 */
export async function writeFolderBackup(handle: DirHandle, doc: Doc): Promise<void> {
  const json = docToJson(doc);
  for (const name of ['claydo-latest.json', `claydo-${dayStamp()}.json`]) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(json);
    await w.close();
  }
  try {
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    for await (const entry of handle.values()) {
      const m = /^claydo-(\d{4})-(\d{2})-(\d{2})\.json$/.exec(entry.name);
      if (!m || entry.kind !== 'file') continue;
      const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
      if (ts < cutoff) await handle.removeEntry(entry.name);
    }
  } catch {
    /* pruning is best-effort */
  }
}

export type { DirHandle };

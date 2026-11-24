import fs from 'node:fs';
/**
 * Best-effort removal of a private temp folder. On Windows a just-exited child
 * (or an antivirus scan) can hold a handle for a moment, which makes rmSync
 * fail with EPERM/EBUSY; a leftover temp folder must never fail the operation.
 */
export function removeTempDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); }
  catch { setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* left for the OS temp cleaner */ } }, 3000).unref?.(); }
}

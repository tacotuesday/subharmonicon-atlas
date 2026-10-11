import type { InstrumentConfig } from '../contracts.ts';
import { makeDemoConfig } from '../defaults.ts';
import { validateConfig } from './config.ts';

export const STORAGE_KEY = 'subharmonicon-visualizer:patch:v1';
export interface PatchStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function serializePatch(config: InstrumentConfig): string { return JSON.stringify(validateConfig(config),null,2); }
export function parsePatch(json: string): InstrumentConfig {
  if (json.length > 64_000) throw new Error('Patch file is too large. Choose a Subharmonicon patch JSON file.');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('The patch file is not valid JSON.'); }
  return validateConfig(value);
}
export function encodePatch(config: InstrumentConfig): string {
  const bytes = new TextEncoder().encode(JSON.stringify(validateConfig(config)));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodePatch(encoded: string): InstrumentConfig {
  if (encoded.length > 86_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('This share link contains an invalid patch.');
  try {
    const binary = atob(encoded.replaceAll('-','+').replaceAll('_','/'));
    const bytes = Uint8Array.from(binary,character => character.charCodeAt(0));
    return parsePatch(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch (error) {
    if (error instanceof Error && /Patch|patch|format|version|range|quantization|octave|jack|JSON/.test(error.message)) throw error;
    throw new Error('This share link contains an invalid patch.');
  }
}
export function loadInitialPatch(hash: string, storage?: PatchStorage): {config:InstrumentConfig;message:string} {
  let message = '';
  if (hash.startsWith('#patch=')) {
    try { return {config:decodePatch(hash.slice(7)),message:'Shared patch loaded. Playback starts paused.'}; }
    catch (error) { message = `${error instanceof Error ? error.message : 'Invalid share link.'} Your local patch was preserved.`; }
  }
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) return {config:parsePatch(saved),message:message || 'Your last patch is ready.'};
  } catch { message ||= 'Local patch storage is unavailable or unreadable. The demo is ready.'; }
  return {config:makeDemoConfig(),message};
}
export function savePatch(config: InstrumentConfig, storage?: PatchStorage): boolean {
  try { if (!storage) return false; storage.setItem(STORAGE_KEY,JSON.stringify(config)); return true; } catch { return false; }
}
export function shareUrl(config: InstrumentConfig, href: string): string { const url = new URL(href); url.hash = `patch=${encodePatch(config)}`; return url.href; }

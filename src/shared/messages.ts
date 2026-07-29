import type { ModelKey } from '../stt/models';

export type JobPriority = 'manual' | 'auto';

/** Messages handled by the offscreen document (routed by the service worker). */
export type OffscreenMessage =
  | { type: 'LOAD_MODEL'; modelKey: ModelKey }
  | {
      type: 'TRANSCRIBE_REQUEST';
      messageId: string;
      priority: JobPriority;
      audioBase64: string;
      mimeType: string;
      durationSec?: number;
    }
  | { type: 'CANCEL_JOB'; messageId: string }
  | { type: 'GET_TRANSCRIPT'; messageId: string }
  | { type: 'DELETE_TRANSCRIPT'; messageId: string }
  | { type: 'CLEAR_TRANSCRIPTS' }
  | { type: 'CLEAR_MODEL_CACHE' }
  | { type: 'GET_STORAGE_ESTIMATE' }
  | { type: 'PING_OFFSCREEN' };

export type RuntimeMessage =
  | { type: 'ENSURE_OFFSCREEN' }
  | { type: 'OPEN_SETUP' }
  | { type: 'CANCEL_LOAD' }
  | OffscreenMessage;

export type RoutedOffscreenMessage = OffscreenMessage & { _to: 'offscreen' };

export type RuntimeEvent =
  | { type: 'PROGRESS'; progress: number; message: string }
  | { type: 'READY'; modelKey: ModelKey; device: string; compatibilityMode: boolean }
  | { type: 'LOAD_ERROR'; message: string }
  | {
      type: 'JOB_STATUS';
      messageId: string;
      status: 'queued' | 'transcribing' | 'done' | 'error' | 'cancelled';
      text?: string;
      error?: string;
    }
  | { type: 'OFFSCREEN_ALIVE' };

export function isRuntimeEvent(msg: unknown): msg is RuntimeEvent {
  return Boolean(msg && typeof msg === 'object' && 'type' in (msg as object));
}

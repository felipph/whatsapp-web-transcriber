import type { ModelKey } from '../stt/models';
import { DEFAULT_MODEL_KEY } from '../stt/models';

export type ModelStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface ExtensionConfig {
  modelKey: ModelKey;
  modelStatus: ModelStatus;
  downloadProgress: number;
  statusMessage: string;
  autoTranscribe: boolean;
  compatibilityMode: boolean;
  lastError?: string;
}

const DEFAULTS: ExtensionConfig = {
  modelKey: DEFAULT_MODEL_KEY,
  modelStatus: 'idle',
  downloadProgress: 0,
  statusMessage: '',
  autoTranscribe: true,
  compatibilityMode: false,
};

export async function getConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...(stored as Partial<ExtensionConfig>) };
}

export async function setConfig(patch: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
  const next = { ...(await getConfig()), ...patch };
  await chrome.storage.local.set(next);
  return next;
}

export function onConfigChange(cb: (config: ExtensionConfig) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== 'local') return;
    void getConfig().then(cb);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

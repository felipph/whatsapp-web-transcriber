export type ModelKey = 'tiny' | 'base' | 'small' | 'medium';

export interface ModelInfo {
  key: ModelKey;
  /** Hugging Face model id */
  id: string;
  label: string;
  sizeLabel: string;
  quality: string;
  speed: string;
  dtype: 'q8';
  recommended?: boolean;
  warning?: string;
}

export const MODELS: ModelInfo[] = [
  {
    key: 'tiny',
    id: 'onnx-community/whisper-tiny',
    label: 'Tiny',
    sizeLabel: '~40 MB',
    quality: 'Mais rápido, menos preciso',
    speed: 'Muito rápido',
    dtype: 'q8',
  },
  {
    key: 'base',
    id: 'onnx-community/whisper-base',
    label: 'Base',
    sizeLabel: '~75 MB',
    quality: 'Equilibrado',
    speed: 'Rápido',
    dtype: 'q8',
    recommended: true,
  },
  {
    key: 'small',
    id: 'onnx-community/whisper-small',
    label: 'Small',
    sizeLabel: '~250 MB',
    quality: 'Melhor qualidade',
    speed: 'Moderado',
    dtype: 'q8',
  },
  {
    key: 'medium',
    id: 'onnx-community/whisper-medium',
    label: 'Medium',
    sizeLabel: '~750 MB',
    quality: 'Máxima qualidade',
    speed: 'Lento',
    dtype: 'q8',
    warning: 'Requer máquina forte e bastante memória.',
  },
];

export const DEFAULT_MODEL_KEY: ModelKey = 'base';

export function getModel(key: ModelKey): ModelInfo {
  const m = MODELS.find((x) => x.key === key);
  if (!m) throw new Error(`Modelo desconhecido: ${key}`);
  return m;
}

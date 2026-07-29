/**
 * Decode OGG/Opus (or any browser-supported audio) to mono PCM at 16 kHz.
 */
export async function decodeToPcm16k(blob: Blob): Promise<{ pcm: Float32Array; durationSec: number }> {
  const buf = await blob.arrayBuffer();
  if (buf.byteLength === 0) {
    throw new Error('Áudio vazio ou corrompido.');
  }

  // Decode at native rate first, then resample to 16 kHz.
  const tmpCtx = new OfflineAudioContext(1, 1, 16000);
  let decoded: AudioBuffer;
  try {
    decoded = await tmpCtx.decodeAudioData(buf.slice(0));
  } catch {
    throw new Error('Não foi possível decodificar o áudio. Arquivo inválido ou formato não suportado.');
  }

  const durationSec = decoded.duration;
  const targetRate = 16000;
  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(durationSec * targetRate)),
    targetRate,
  );

  const src = offline.createBufferSource();
  // Downmix to mono if needed
  let mono: AudioBuffer;
  if (decoded.numberOfChannels === 1) {
    mono = decoded;
  } else {
    mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const out = mono.getChannelData(0);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    for (let i = 0; i < decoded.length; i++) {
      let sum = 0;
      for (const ch of channels) sum += ch[i] ?? 0;
      out[i] = sum / channels.length;
    }
  }

  src.buffer = mono;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return { pcm: rendered.getChannelData(0).slice(), durationSec };
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'audio/ogg' });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

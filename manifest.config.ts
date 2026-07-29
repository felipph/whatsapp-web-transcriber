import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'WhatsApp Web Transcriber',
  description:
    'Transcreve áudios do WhatsApp Web no seu PC. Nada de áudio sai do browser.',
  version: '0.1.0',
  permissions: ['storage', 'offscreen', 'tabs'],
  host_permissions: [
    'https://web.whatsapp.com/*',
    'https://huggingface.co/*',
    'https://*.huggingface.co/*',
    'https://cdn.jsdelivr.net/*',
  ],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'WhatsApp Transcriber',
  },
  options_page: 'src/options/options.html',
  content_scripts: [
    {
      matches: ['https://web.whatsapp.com/*'],
      js: ['src/content/main-world.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://web.whatsapp.com/*'],
      js: ['src/content/whatsapp.ts'],
      run_at: 'document_idle',
      world: 'ISOLATED',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['assets/*'],
      matches: ['https://web.whatsapp.com/*'],
    },
  ],
  icons: {
    '16': 'public/icons/icon16.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
  // Required for ONNX Runtime / Whisper WASM under MV3.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
  // NOTE: Do NOT enable COOP/COEP here. Cross-origin isolation unlocks SharedArrayBuffer,
  // which makes ORT spawn blob: workers — blocked by Chrome extension CSP.
});

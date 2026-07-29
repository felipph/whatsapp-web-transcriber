const orig = URL.createObjectURL.bind(URL);
const origRevoke = URL.revokeObjectURL.bind(URL);

URL.createObjectURL = (obj: Blob | MediaSource) => {
  const url = orig(obj as Blob);
  try {
    if (obj instanceof Blob && obj.type.startsWith('audio/')) {
      window.postMessage({ source: 'wt', type: 'AUDIO_BLOB', url, blob: obj }, '*');
    }
  } catch {
    /* ignore */
  }
  return url;
};

URL.revokeObjectURL = (url: string) => {
  try {
    window.postMessage({ source: 'wt', type: 'AUDIO_REVOKE', url }, '*');
  } catch {
    /* ignore */
  }
  return origRevoke(url);
};

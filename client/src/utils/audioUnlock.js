// Shared singleton AudioContext unlocked synchronously on user click gestures
// so voice greetings and AI replies play immediately without browser autoplay blocks.

let sharedAudioContext = null;

export function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

export function unlockSharedAudioContext() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return null;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const silentBuffer = ctx.createBuffer(1, 1, 22050);
    const silentSource = ctx.createBufferSource();
    silentSource.buffer = silentBuffer;
    silentSource.connect(ctx.destination);
    silentSource.start(0);

    return ctx;
  } catch {
    return null;
  }
}

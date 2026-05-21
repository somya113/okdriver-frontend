/**
 * hlsPlayer.js — okDriver .ts Video Playback
 *
 * Uses MediaSource Extensions API to play raw MPEG-TS transport stream files.
 * HLS.js is used for .m3u8 HLS streams only.
 */
import Hls from 'hls.js';

const MSE_HEADER_SKIP = 188; // okDriver prepends 188 bytes of junk before TS sync

/**
 * @param {HTMLVideoElement} videoEl
 * @param {string} src - .ts or .m3u8 URL
 * @param {object} callbacks - { onReady, onError, onBuffering, onPlaying }
 * @returns {Function} cleanup
 */
export function attachStream(videoEl, src, callbacks = {}) {
  const { onReady, onError, onBuffering, onPlaying } = callbacks;

  if (!videoEl || !src) return () => {};

  console.log('[attachStream] src:', src, 'Hls.supported:', Hls.isSupported());

  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();

  // ── HLS.js for .m3u8 HLS streams ─────────────────────────────────────────
  let hlsPlayingHandler = null;
  if (Hls.isSupported() && src.includes('.m3u8')) {
    const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    hls.loadSource(src);
    hls.attachMedia(videoEl);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('[HLS] Manifest parsed');
      videoEl.play().catch(() => {});
      hlsPlayingHandler = () => { onPlaying?.(); };
      videoEl.addEventListener('playing', hlsPlayingHandler);
      onReady?.();
    });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) { hls.destroy(); onError?.(new Error(`HLS fatal: ${data.details}`)); }
    });
    return () => {
      if (hlsPlayingHandler) videoEl.removeEventListener('playing', hlsPlayingHandler);
      hls.destroy();
    };
  }

  // ── MediaSource Extensions for .ts files ─────────────────────────────────
  // okDriver .ts files have a 188-byte junk header. We strip it and use
  // MSE to feed raw MPEG-TS packets directly to the browser's demuxer.
  if (typeof MediaSource !== 'undefined' && src.includes('.ts')) {
    const mediaSource = new MediaSource();
    let sourceBuffer = null;
    let readOffset = 0;
    let fileSize = 0;
    let url = null;
    let msePlayingHandler = null;

    mediaSource.addEventListener('sourceopen', async () => {
      console.log('[MSE] MediaSource opened');
      const tsCodecs = 'video/mp2t; codecs="avc1.42E01E,mp4a.40.2"';
      try {
        sourceBuffer = mediaSource.addSourceBuffer(tsCodecs);
      } catch (e) {
        console.warn('[MSE] addSourceBuffer failed, trying alternative:', e.message);
        try {
          sourceBuffer = mediaSource.addSourceBuffer('video/mp2t');
        } catch (e2) {
          onError?.(new Error('MediaSource not supported for this video'));
          return;
        }
      }

      sourceBuffer.addEventListener('updatestart', () => { onBuffering?.(true); });
      sourceBuffer.addEventListener('updateend', () => { onBuffering?.(false); });
      sourceBuffer.addEventListener('error', () => {
        onError?.(new Error('SourceBuffer error'));
      });

      try {
        let res;
        try {
          res = await fetch(src);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (fetchErr) {
          console.warn('[MSE] Main fetch failed, falling back to local file:', fetchErr.message);
          res = await fetch('/2026_05_20_11_52_30_02.ts');
          if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        const stripped = buf.slice(MSE_HEADER_SKIP);
        fileSize = stripped.byteLength;
        readOffset = 0;
        console.log('[MSE] File fetched, size:', fileSize);

        const CHUNK = 1024 * 1024;
        const appendNext = () => {
          const end = Math.min(readOffset + CHUNK, fileSize);
          sourceBuffer.appendBuffer(stripped.slice(readOffset, end));
          readOffset = end;
        };

        msePlayingHandler = () => { onPlaying?.(); };
        videoEl.addEventListener('playing', msePlayingHandler);

        sourceBuffer.addEventListener('updateend', () => {
          if (readOffset < fileSize) {
            appendNext();
          } else {
            if (mediaSource.readyState === 'open') {
              mediaSource.endOfStream();
            }
            onReady?.();
          }
        });
        appendNext();
      } catch (e) {
        console.error('[MSE] fetch error:', e.message);
        onError?.(new Error('Failed to load video: ' + e.message));
      }
    });

    url = URL.createObjectURL(mediaSource);
    videoEl.src = url;
    return () => {
      if (msePlayingHandler) videoEl.removeEventListener('playing', msePlayingHandler);
      if (sourceBuffer) {
        sourceBuffer.removeEventListener('updatestart', () => {});
        sourceBuffer.removeEventListener('updateend', () => {});
        sourceBuffer.removeEventListener('error', () => {});
      }
      if (url) URL.revokeObjectURL(url);
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    };
  }

  // ── Fallback: direct src URL ──────────────────────────────────────────────
  videoEl.src = src;
  const onCanPlayHandler = () => { console.log('[Video] canplay'); onReady?.(); };
  const onErrorHandler = () => { onError?.(new Error(videoEl.error?.message || 'Video error ' + videoEl.error?.code)); };
  const onPlayingHandler = () => { onBuffering?.(false); };
  const onWaitingHandler = () => { onBuffering?.(true); };
  videoEl.addEventListener('canplay', onCanPlayHandler);
  videoEl.addEventListener('error', onErrorHandler);
  videoEl.addEventListener('playing', onPlayingHandler);
  videoEl.addEventListener('waiting', onWaitingHandler);
  return () => {
    videoEl.removeEventListener('canplay', onCanPlayHandler);
    videoEl.removeEventListener('error', onErrorHandler);
    videoEl.removeEventListener('playing', onPlayingHandler);
    videoEl.removeEventListener('waiting', onWaitingHandler);
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
  };
}

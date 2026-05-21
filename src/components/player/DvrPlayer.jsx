import React, { useEffect, useRef, useState } from 'react';
import { attachStream } from '../../services/hlsPlayer';

export default function DvrPlayer({
  clip,
  streamUrl,
  uploadStatus,
  playState,
  speed = 1,
  offsetSeconds = 0,
  onEnded,
  onTimeUpdate,
  onPlayState,
  label = '',
}) {
  const videoRef = useRef(null);
  const cleanupRef = useRef(null);
  const [internalError, setInternalError] = useState(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // ── Track whether we've already attached this stream ──────────────────
  const attachedRef = useRef(null);

  // ── Attach stream ONLY when uploadStatus becomes 'ready' ──────────────
  useEffect(() => {
    if (!streamUrl || uploadStatus !== 'ready') return;
    if (attachedRef.current === streamUrl) return; // already attached this URL

    const videoEl = videoRef.current;
    if (!videoEl) return;

    console.log('[DvrPlayer] Attaching stream:', streamUrl);
    setInternalError(null);

    // Clean up previous stream
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    cleanupRef.current = attachStream(videoEl, streamUrl, {
      onReady: () => {
        console.log('[DvrPlayer] Stream ready');
        if (offsetSeconds > 0 && videoEl.currentTime !== offsetSeconds) {
          videoEl.currentTime = offsetSeconds;
        }
        videoEl.playbackRate = speed;
        videoEl.play().catch(() => {
          console.log('[DvrPlayer] Autoplay blocked - will stay paused');
        });
      },
      onPlaying: () => {
        onPlayState?.('playing');
      },
      onError: (err) => {
        console.error('[DvrPlayer] Stream error:', err.message);
        setInternalError(err.message);
      },
      onBuffering: (isBuffering) => {
        console.log('[DvrPlayer] Buffering:', isBuffering);
      },
    });

    attachedRef.current = streamUrl;

    return () => {
      attachedRef.current = null;
    };
  }, [streamUrl, uploadStatus, offsetSeconds]);

  // ── Sync speed changes ──────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  // ── Sync external playState changes ──────────────────────────────────────
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (playState === 'playing' && videoEl.paused) {
      videoEl.play().catch(() => {});
    } else if (playState === 'paused' && !videoEl.paused) {
      videoEl.pause();
    }
  }, [playState]);

  const hasEndedRef = useRef(false);

  // ── Time update → parent scrubber ────────────────────────────────────────
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const t = videoRef.current.currentTime;
      setCurrentVideoTime(t);
      onTimeUpdate?.(t);

      // Fallback for MSE streams that stall at the very end and never fire 'ended'
      const duration = videoRef.current.duration;
      if (duration > 0 && t >= duration - 0.2 && !hasEndedRef.current) {
        hasEndedRef.current = true;
        handleEnded();
      }
    }
  };

  // Reset the ended flag when the clip changes
  useEffect(() => {
    hasEndedRef.current = false;
  }, [clip]);

  // ── Auto-recovery for MSE mid-stream stalls ─────────────────────────────
  useEffect(() => {
    let stallCheckInterval;

    if (playState === 'playing') {
      let lastTime = -1;
      let stallCount = 0;

      stallCheckInterval = setInterval(() => {
        const videoEl = videoRef.current;
        if (!videoEl || videoEl.paused || videoEl.ended) return;

        const currentTime = videoEl.currentTime;
        if (currentTime === lastTime) {
          stallCount++;
          // Stalled for 2 seconds (4 intervals of 500ms)
          if (stallCount >= 4) {
            console.warn('[DvrPlayer] Decoder stall detected. Nudging video forward...');
            videoEl.currentTime += 0.1;
            stallCount = 0; // Reset after nudge
          }
        } else {
          lastTime = currentTime;
          stallCount = 0;
        }
      }, 500);
    }

    return () => {
      if (stallCheckInterval) clearInterval(stallCheckInterval);
    };
  }, [playState]);

  // ── Natural end of clip ──────────────────────────────────────────────────
  const handleEnded = () => {
    console.log('[DvrPlayer] Video ended');
    onPlayState?.('idle');
    onEnded?.();
  };

  const handlePlay = () => {
    videoRef.current?.play().catch(() => {});
  };

  const handlePause = () => {
    videoRef.current?.pause();
  };

  // ── Overlay rendering ────────────────────────────────────────────────────
  const renderOverlay = () => {
    if (playState === 'idle' && !clip) {
      return (
        <div className="player-overlay" style={{ background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 64, height: 64, background: 'rgba(59,130,246,0.1)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, border: '1px solid rgba(59,130,246,0.2)',
          }}>
            <div style={{ width: 0, height: 0, borderTop: '12px solid transparent', borderBottom: '12px solid transparent', borderLeft: '18px solid #3b82f6', marginLeft: 6 }} />
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Search for recordings and click a video to play</div>
        </div>
      );
    }

    if (uploadStatus === 'queued' || uploadStatus === 'uploading') {
      return (
        <div className="player-overlay fade-in">
          <div className="spinner" />
          <div className="player-overlay-text">
            {uploadStatus === 'queued' ? 'Queueing upload...' : 'Retrieving from Dashcam...'}
          </div>
          <div className="player-overlay-sub">Connecting to device via TCP</div>
        </div>
      );
    }

    if (playState === 'loading' || playState === 'buffering') {
      return (
        <div className="player-overlay fade-in">
          <div className="spinner" />
          <div className="player-overlay-text">Buffering...</div>
        </div>
      );
    }

    if (uploadStatus === 'error' || internalError) {
      return (
        <div className="player-overlay fade-in">
          <div className="player-overlay-icon">⚠️</div>
          <div className="player-overlay-text">Failed to load stream</div>
          <div className="player-overlay-sub">{internalError || 'Upload timeout'}</div>
        </div>
      );
    }

    return null;
  };

  // ── Timestamp overlay ────────────────────────────────────────────────────
  const getOverlayTime = () => {
    if (!clip || !clip.startMs) return '';
    const date = new Date(clip.startMs + currentVideoTime * 1000);
    const y = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${mm}-${dd}  ${hh}:${min}:${ss}`;
  };

  const clipDuration = clip?.duration || 180;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#0f172a', overflow: 'hidden' }}>
      {clip && (
        <div className="player-label">
          <span className={`player-label-dot ${playState === 'playing' ? 'status-live' : ''}`} />
          {label} {clip.timeStr ? `— ${clip.timeStr}` : ''}
        </div>
      )}

      <video
        ref={videoRef}
        muted={false}
        onClick={() => playState === 'playing' ? handlePause() : handlePlay()}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={() => onPlayState?.('playing')}
        onPause={() => onPlayState?.('paused')}
        style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer', position: 'relative', zIndex: 0 }}
      />

      {clip && uploadStatus === 'ready' && !internalError && (
        <div style={{
          position: 'absolute', bottom: 80, left: 24, right: 24,
          display: 'flex', justifyContent: 'space-between',
          color: 'white', fontFamily: 'monospace', fontSize: 15, fontWeight: 500,
          letterSpacing: 1, textShadow: '1px 1px 2px black',
          pointerEvents: 'none', zIndex: 5,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>{getOverlayTime()}</span>
            <span>E:77.264651 N:28.746751</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span>+05:30</span>
            <span>78km/h</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span>okDriver</span>
            <span>{clip.filename}</span>
          </div>
        </div>
      )}

      {clip && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
          padding: '40px 24px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: 'white', zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <button
              onClick={() => playState === 'playing' ? handlePause() : handlePlay()}
              style={{ background: 'white', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <span style={{ color: '#0f172a', fontSize: 18, marginLeft: playState === 'playing' ? 0 : 4 }}>
                {playState === 'playing' ? '⏸' : '▶'}
              </span>
            </button>
            <div style={{ display: 'flex', gap: 16, fontSize: 16, cursor: 'pointer', color: '#cbd5e1' }}>
              <span onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}>↺ -10s</span>
              <span onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }}>+10s ↻</span>
            </div>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#e2e8f0', marginLeft: 12 }}>
              {Math.floor(currentVideoTime / 60)}:{(Math.floor(currentVideoTime) % 60).toString().padStart(2, '0')} /
              {`${Math.floor(clipDuration / 60)}:${(clipDuration % 60).toString().padStart(2, '0')}`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 18, color: '#cbd5e1' }}>
            <span>🔊</span>
            <button
              onClick={() => {}}
              style={{ background: 'transparent', border: '1px solid #475569', borderRadius: 6, padding: '2px 8px', color: '#f1f5f9', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              title="Change playback speed"
            >
              {speed}x
            </button>
            <span
              onClick={() => videoRef.current?.requestFullscreen()}
              style={{ cursor: 'pointer' }}
            >⛶</span>
          </div>
        </div>
      )}

      {renderOverlay()}
    </div>
  );
}
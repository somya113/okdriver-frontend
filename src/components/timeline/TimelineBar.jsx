import React, { useRef, useState } from 'react';

export default function TimelineBar({ timeline, scrubPercent, onSeek }) {
  const containerRef = useRef(null);
  const [hoverPct, setHoverPct] = useState(null);

  // If no timeline data is passed, provide a blank 24h timeline so the UI stays consistent
  const displayTimeline = timeline || {
    fwd: { clips: [], segments: [] },
    in: { clips: [], segments: [] },
    hourMarkers: Array.from({ length: 24 }, (_, i) => ({
      hour: String(i).padStart(2, '0'),
      positionPercent: (i / 24) * 100,
    })),
  };

  const getPctFromEvent = (e) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * 100;
  };

  const handleClick = (e) => {
    onSeek?.(getPctFromEvent(e));
  };

  const handleMouseMove = (e) => {
    setHoverPct(getPctFromEvent(e));
  };

  const handleMouseLeave = () => {
    setHoverPct(null);
  };

  const formatTimeFromPct = (pct) => {
    const totalSeconds = (pct / 100) * 24 * 60 * 60;
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="timeline-panel">
      <div className="timeline-header">
        <div className="panel-title" style={{ color: '#0f172a' }}>HISTORY TIMELINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-muted)' }}>{(displayTimeline.fwd.clips?.length || 0) + (displayTimeline.in.clips?.length || 0)} clips</span>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '4px', padding: '2px' }}>
            <button style={{ padding: '2px 8px', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>FWD</button>
            <button style={{ padding: '2px 8px', border: 'none', background: '#64748b', color: 'white', borderRadius: '2px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>ALL</button>
            <button style={{ padding: '2px 8px', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>IN</button>
          </div>
        </div>
      </div>

      <div className="timeline-wrapper">
        <div className="timeline-ruler">
          {displayTimeline.hourMarkers.map((m, i) => (
            <div key={i} className="timeline-hour-marker" style={{ left: `${m.positionPercent}%` }}>
              <div className="timeline-hour-label">{m.hour}</div>
              <div className="timeline-hour-tick"></div>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', marginLeft: '40px', marginRight: '10px' }}>
          <div className="timeline-track-label-fwd">FWD</div>
          <div className="timeline-track-label-in">IN</div>

          <div
            className="timeline-tracks"
            ref={containerRef}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ position: 'relative', cursor: 'pointer' }}
          >
            {hoverPct !== null && (
              <div style={{
                position: 'absolute',
                left: `${hoverPct}%`,
                top: -30,
                transform: 'translateX(-50%)',
                background: '#1e293b',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                pointerEvents: 'none',
                zIndex: 20,
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
              }}>
                {formatTimeFromPct(hoverPct)}
              </div>
            )}
            
            <div className="timeline-scrubber" style={{ left: `${scrubPercent}%`, pointerEvents: 'none' }} />

            {/* FWD Track */}
            <div className="timeline-track timeline-track-fwd">
              {displayTimeline.fwd.segments.map((seg, i) => (
                <div
                  key={`fwd-${i}`}
                  className="timeline-segment"
                  style={{ left: `${seg.startPct}%`, width: `${seg.widthPct}%`, background: 'var(--fwd-color)' }}
                  title={seg.displayTime}
                />
              ))}
            </div>

            {/* IN Track */}
            <div className="timeline-track timeline-track-in">
              {displayTimeline.in.segments.map((seg, i) => (
                <div
                  key={`in-${i}`}
                  className="timeline-segment"
                  style={{ left: `${seg.startPct}%`, width: `${seg.widthPct}%`, background: 'var(--in-color)' }}
                  title={seg.displayTime}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="camera-toggles">
          <div className="camera-toggle-item">
            <div className="color-box" style={{ background: 'var(--fwd-color)' }}></div>
            <span>Forward cam</span>
          </div>
          <div className="camera-toggle-item">
            <div className="color-box" style={{ background: 'var(--in-color)' }}></div>
            <span>Inward cam</span>
          </div>
          <div className="camera-toggle-item" style={{ marginLeft: '12px' }}>
            <div style={{ width: '1px', height: '12px', background: 'var(--scrubber-color)' }}></div>
            <span style={{ color: 'var(--scrubber-color)' }}>Current position</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useDvrPlayback } from '../hooks/useDvrPlayback';
import { api } from '../services/api';
import DvrPlayer from '../components/player/DvrPlayer';
import TimelineBar from '../components/timeline/TimelineBar';

export default function HistoryMonitor() {
  const dvr = useDvrPlayback();

  const renderClipItem = (clip) => {
    const isActive = dvr.queue.current?.filename === clip.filename;
    const isPlaying = isActive && dvr.playState === 'playing';
    const isFwd = clip.cameraType === 'ForwardCam';
    const tagBg = isFwd ? '#eff6ff' : '#f0fdf4';
    const tagColor = isFwd ? '#3b82f6' : '#22c55e';

    return (
      <div
        key={clip.filename}
        className={`clip-item ${isActive ? 'active' : ''}`}
        onClick={() => {
          if (isActive) {
            dvr.setPlayState(dvr.playState === 'playing' ? 'paused' : 'playing');
          } else {
            dvr.playClip(clip, 0);
          }
        }}
      >
        <div>
          <div className="clip-time">{clip.dateStr} {clip.timeStr}</div>
          <div className="clip-meta">{clip.filename}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ background: tagBg, color: tagColor, fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
            {isFwd ? 'FWD' : 'IN'}
          </span>
          <div className="play-icon">
            {isPlaying ? '⏸' : '▶'}
          </div>
        </div>
      </div>
    );
  };

  const streamUrl = dvr.queue.current
    ? api.getStreamUrl(dvr.IMEI, dvr.queue.current.filename)
    : null;

  const inStreamUrl = dvr.inClip
    ? api.getStreamUrl(dvr.IMEI, dvr.inClip.filename)
    : null;

  const uploadStatus = dvr.queue.current
    ? dvr.uploadStatus[dvr.queue.current.filename] || 'queued'
    : 'queued';

  const inUploadStatus = dvr.inClip
    ? dvr.uploadStatus[dvr.inClip.filename] || 'queued'
    : 'queued';

  const renderPlayerArea = () => {
    if (dvr.dualCamera && dvr.queue.current) {
      return (
        <div className="dual-player-container">
          <div className="dual-player-pane">
            <DvrPlayer
              clip={dvr.queue.current}
              streamUrl={streamUrl}
              uploadStatus={uploadStatus}
              playState={dvr.playState}
              speed={dvr.speed}
              offsetSeconds={dvr.clipOffset}
              onEnded={dvr.advanceToNext}
              onTimeUpdate={(t) => dvr.updateScrubber(dvr.queue.current, t)}
              onPlayState={(s) => dvr.setPlayState(s)}
              label="Forward Camera"
            />
          </div>
          <div className="dual-player-divider" />
          <div className="dual-player-pane">
            <DvrPlayer
              clip={dvr.inClip}
              streamUrl={inStreamUrl}
              uploadStatus={inUploadStatus}
              playState={dvr.playState}
              speed={dvr.speed}
              offsetSeconds={dvr.clipOffset}
              onEnded={() => {}}
              onTimeUpdate={() => {}}
              onPlayState={() => {}}
              label="Inward Camera"
            />
          </div>
        </div>
      );
    }

    return (
      <div style={{ flex: 1, minHeight: 460, background: '#0f172a', borderRadius: 12, overflow: 'hidden', position: 'relative', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <DvrPlayer
          clip={dvr.queue.current}
          streamUrl={streamUrl}
          uploadStatus={uploadStatus}
          playState={dvr.playState}
          speed={dvr.speed}
          offsetSeconds={dvr.clipOffset}
          onEnded={dvr.advanceToNext}
          onTimeUpdate={(t) => dvr.updateScrubber(dvr.queue.current, t)}
          onPlayState={(s) => dvr.setPlayState(s)}
          label={dvr.selectedCamera === 'ForwardCam' ? 'Forward Camera' : 'Inward Camera'}
        />
      </div>
    );
  };

  return (
    <div className="dvr-layout">
      {/* LEFT PANEL */}
      <div className="dvr-left-panel">
        <div className="panel-header">
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            DASHBOARD OVERVIEW
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: '2px 6px', borderRadius: 12 }}>
              <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 'bold' }}>
                ● {dvr.clips.filter(c => c.cameraType === 'ForwardCam').length}
              </span>
              <span style={{ color: '#ef4444', fontSize: 10, fontWeight: 'bold' }}>
                ● {dvr.clips.filter(c => c.cameraType === 'InwardCam').length}
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <select
            className="input"
            defaultValue={dvr.IMEI}
            style={{ background: '#f8fafc', cursor: 'pointer' }}
          >
            <option value="864993060968006">DL5CJ7355 [864993060968006]</option>
          </select>

          <div className="input-with-icon">
            <input
              type="date"
              className="input"
              value={dvr.selectedDate}
              onChange={(e) => dvr.handleDateChange(e.target.value)}
              style={{ background: '#f8fafc', cursor: 'pointer', color: '#475569', fontWeight: 500, width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'block', fontWeight: 500 }}>Camera</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                className={`btn ${dvr.selectedCamera === 'ForwardCam' && !dvr.dualCamera ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, padding: 8 }}
                onClick={() => { dvr.setDualCamera(false); dvr.setSelectedCamera('ForwardCam'); }}
              >Forward</button>
              <button
                className={`btn ${dvr.selectedCamera === 'InwardCam' && !dvr.dualCamera ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, padding: 8 }}
                onClick={() => { dvr.setDualCamera(false); dvr.setSelectedCamera('InwardCam'); }}
              >Inward</button>
              <button
                className={`btn ${dvr.dualCamera ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, padding: 8 }}
                onClick={() => dvr.setDualCamera(true)}
              >Both</button>
            </div>

            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'block', fontWeight: 500 }}>Speed</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  className={`btn ${dvr.speed === s ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, padding: 8, fontWeight: 700 }}
                  onClick={() => dvr.setSpeed(s)}
                >{s}x</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={dvr.handleSearch}
                disabled={dvr.isSearching}
              >
                🔍 {dvr.isSearching ? 'Scanning...' : 'Search'}
              </button>
              <button
                className="btn btn-outline"
                style={{ border: 'none', fontWeight: 600 }}
                onClick={dvr.refreshDevice}
                disabled={dvr.isSearching}
              >
                ↻ Refresh
              </button>
              <button
                className="btn btn-outline"
                style={{ color: 'var(--accent-blue)', border: 'none', fontWeight: 600 }}
                onClick={() => dvr.handleDateChange(dvr.selectedDate)}
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {dvr.isSearching && dvr.searchSteps && dvr.searchSteps.length > 0 && (
          <div style={{ padding: '0 16px', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            {dvr.searchSteps.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⏳</span>
                <span>{String(step).replace(/^[✅⌛⏳]\s*/, '')}</span>
              </div>
            ))}
          </div>
        )}

        <div className="panel-header" style={{ borderTop: 'none', marginTop: dvr.isSearching ? 12 : 0 }}>
          <div className="panel-title" style={{ color: '#0f172a', textTransform: 'none', fontSize: 13 }}>
            Available Videos ({dvr.clips.filter(c => c.cameraType === 'ForwardCam').length} FWD / {dvr.clips.filter(c => c.cameraType === 'InwardCam').length} IN)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click a row to play</div>
        </div>

        <div className="clip-list-container">
          {dvr.clips
            .filter(c => dvr.dualCamera || c.cameraType === dvr.selectedCamera)
            .sort((a, b) => a.startTimestamp - b.startTimestamp)
            .map(renderClipItem)}
          {dvr.clips.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              No videos found
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="dvr-right-panel">
        {dvr.error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', color: '#dc2626', fontSize: 13 }}>
            {dvr.error}
          </div>
        )}

        {renderPlayerArea()}

        <TimelineBar
          timeline={dvr.timeline}
          scrubPercent={dvr.scrubPercent}
          onSeek={dvr.seekToPosition}
        />
      </div>
    </div>
  );
}
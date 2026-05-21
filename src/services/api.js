/**
 * api.js — okDriver API Client
 *
 * Calls the okDriver platform APIs directly from the browser.
 * The okDriver server (smart.okdriver.in:5000) returns
 * Access-Control-Allow-Origin: *, so direct browser calls work.
 *
 * Base: http://smart.okdriver.in:5000 (direct, no proxy)
 */

const BASE = 'http://smart.okdriver.in:5000';
const HTTPS_BASE = 'https://smart.okdriver.in';

const IMEI = '864993060968006';

// ── Mock data is loaded from /mockClips.json when API returns empty ───────

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

// Parse filename → ClipMeta
// Filename format: YYYY_MM_DD_HH_MM_SS_CC.ts
function parseFilename(filename) {
  const m = filename.match(/^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\.ts$/);
  if (!m) return null;

  const [, year, month, day, hour, minute, second, channel] = m.map(Number);
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

  const cameraType = channel === 3 ? 'ForwardCam' : 'InwardCam';
  const CLIP_DURATION_MS = 3 * 60 * 1000;

  const d = new Date(year, month - 1, day, hour, minute, second, 0);
  const startTimestamp = d.getTime();

  return {
    filename,
    dateStr,
    timeStr,
    year,
    month,
    day,
    hour,
    minute,
    second,
    channel,
    cameraType,
    startTimestamp,
    endTimestamp: startTimestamp + CLIP_DURATION_MS,
    duration: 180,
    startMs: startTimestamp,
  };
}

export const api = {
  /**
   * API 1: Trigger TF card scan
   * POST /api/playback/request-list/{imei}
   */
  requestVideoList: (imei, daysBack = 30) =>
    request('POST', `/api/playback/request-list/${imei}`, { daysBack, useTFCard: true }),

  /**
   * API 2: Get available video list
   * GET /api/playback/videos/{imei}
   */
  /**
   * API 2: Get available video list
   * GET /api/playback/videos/{imei}
   */
  getVideos: async (imei, parsed = false) => {
    const data = await request('GET', `/api/playback/videos/${imei}${parsed ? '?parsed=true' : ''}`);
    const raw = data.videos || [];

    // Parse raw filenames into ClipMeta objects
    // Mock fallback is handled by useDvrPlayback.loadVideos() — not here
    const clips = raw.map(parseFilename).filter(Boolean);

    return {
      ...data,
      videos: clips.map(c => c.filename),
      clips,
      count: clips.length,
    };
  },

  /**
   * API 3: Request clip upload for streaming
   * POST /api/playback/start/{imei}
   */
  startPlayback: (imei, videoName) =>
    request('POST', `/api/playback/start/${imei}`, {
      videoName,
      protocol: 'http',
      force: true,
    }),

  parseFilename,

  /**
   * Build timeline data from a list of clips for a given date.
   * Recomputes timestamps locally so they align with dayStartMs (local timezone).
   * Merges adjacent clips into continuous bands for DVR-style visual bars.
   */
  buildTimeline: (clips, dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayStartMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
    const dayDurationMs = dayEndMs - dayStartMs;
    const CLIP_DURATION_MS = 3 * 60 * 1000; // each clip is 3 minutes

    // Filter clips to only the selected date
    const dateClips = clips.filter((c) => c.dateStr === dateStr);

    const fwdClips = dateClips
      .filter((c) => c.cameraType === 'ForwardCam')
      .sort((a, b) => a.startTimestamp - b.startTimestamp);
    const inClips = dateClips
      .filter((c) => c.cameraType === 'InwardCam')
      .sort((a, b) => a.startTimestamp - b.startTimestamp);

    /**
     * Merge adjacent/contiguous clips into continuous visual bands.
     * Clips that start exactly when the previous one ends (or overlap)
     * are merged into a single segment. This produces solid DVR-style
     * bars instead of 76 individual 1px-wide slivers.
     */
    const makeSegments = (sortedClips) => {
      if (sortedClips.length === 0) return [];

      const segments = [];
      let bandStart = sortedClips[0].startTimestamp;
      let bandEnd = sortedClips[0].endTimestamp;
      let bandFirstClip = sortedClips[0];

      for (let i = 1; i < sortedClips.length; i++) {
        const clip = sortedClips[i];
        // If this clip starts within 10s of the previous band's end, merge
        if (clip.startTimestamp <= bandEnd + 10000) {
          bandEnd = Math.max(bandEnd, clip.endTimestamp);
        } else {
          // Gap detected — push the current band and start a new one
          const startPct = Math.max(0, ((bandStart - dayStartMs) / dayDurationMs) * 100);
          const endPct = Math.min(100, ((bandEnd - dayStartMs) / dayDurationMs) * 100);
          segments.push({
            startPct,
            widthPct: endPct - startPct,
            displayTime: bandFirstClip.timeStr.slice(0, 5),
            clip: bandFirstClip,
          });
          bandStart = clip.startTimestamp;
          bandEnd = clip.endTimestamp;
          bandFirstClip = clip;
        }
      }

      // Push the final band
      const startPct = Math.max(0, ((bandStart - dayStartMs) / dayDurationMs) * 100);
      const endPct = Math.min(100, ((bandEnd - dayStartMs) / dayDurationMs) * 100);
      segments.push({
        startPct,
        widthPct: endPct - startPct,
        displayTime: bandFirstClip.timeStr.slice(0, 5),
        clip: bandFirstClip,
      });

      return segments;
    };

    const hourMarkers = Array.from({ length: 24 }, (_, i) => ({
      hour: String(i).padStart(2, '0'),
      positionPercent: (i / 24) * 100,
    }));

    return {
      dayStartMs,
      dayEndMs,
      fwd: { clips: fwdClips, segments: makeSegments(fwdClips) },
      in: { clips: inClips, segments: makeSegments(inClips) },
      hourMarkers,
    };
  },

  /**
   * Given a timeline position (0–100), find the clip + offset.
   */
  resolveSeek: (timeline, positionPercent, cameraType = 'ForwardCam') => {
    const track = cameraType === 'ForwardCam' ? timeline.fwd : timeline.in;
    if (!track || !track.clips.length) return null;

    const targetMs = timeline.dayStartMs + (positionPercent / 100) * (timeline.dayEndMs - timeline.dayStartMs);

    let lo = 0, hi = track.clips.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (track.clips[mid].startTimestamp <= targetMs) lo = mid;
      else hi = mid - 1;
    }

    const clip = track.clips[lo];
    if (!clip || targetMs < clip.startTimestamp || targetMs > clip.endTimestamp) {
      return null;
    }

    const offsetSeconds = Math.max(0, (targetMs - clip.startTimestamp) / 1000);
    return { clip, offsetSeconds };
  },

  /**
   * Build the streaming URL for a clip.
   * Uses HTTP on port 5000 — curl confirmed this works.
   */
  getStreamUrl: (imei, filename) =>
    `${BASE}/api/playback/video/${imei}/${filename}`,

  /**
   * Check if a clip upload is complete.
   * HEAD /api/playback/ready/{imei}/{filename}
   * Returns 200 when ready, 301 when still uploading.
   */
  checkReady: async (imei, filename) => {
    try {
      const url = `${BASE}/api/playback/ready/${imei}/${filename}`;
      const res = await fetch(url, { method: 'HEAD' });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  /**
   * Poll for upload status of a clip.
   * Returns: { status: "queued" | "uploading" | "ready" | "error" }
   */
  pollUpload: async (imei, filename) => {
    const ready = await api.checkReady(imei, filename);
    return { status: ready ? 'ready' : 'uploading' };
  },
};
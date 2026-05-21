/**
 * useDvrPlayback.js — DVR Playback State Hook
 *
 * Manages the entire DVR playback lifecycle:
 *   - Clip loading from okDriver API 2, with fallback to /mockClips.json
 *   - Timeline building from parsed clips (filtered by selected date)
 *   - Clip queue: [current, next, buffered]
 *   - API 3 calls for each clip upload (skipped in mock mode)
 *   - Upload polling (2.5s interval per clip, skipped in mock mode)
 *   - Pre-fetching next 2 clips when current starts
 *   - Timeline seeking (binary search → clip + offset)
 *   - Auto-advance when clip ends
 *   - Dual camera: FWD + IN side-by-side
 *   - Mock mode: when videos array is empty, timeline and playback
 *     work with mock data without requiring API 3 or real uploads
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

const IMEI = '864993060968006'; // Test device IMEI
const POLL_INTERVAL = 2500;     // ms between upload poll checks

// Helper: today's date as YYYY-MM-DD string
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useDvrPlayback() {
  // ── State ────────────────────────────────────────────────────────────────
  const [clips, setClips]           = useState([]);
  const [dates, setDates]           = useState([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [timeline, setTimeline]     = useState(null);
  const [queue, setQueue]           = useState({ current: null, next: null, buffered: null });
  const [playState, setPlayState]   = useState('idle');
  const [uploadStatus, setUploadStatus] = useState({});
  const [currentTime, setCurrentTime]  = useState(0);
  const [clipOffset, setClipOffset] = useState(0);
  const [scrubPercent, setScrubPercent] = useState(0);
  const [speed, setSpeed]           = useState(1);
  const [error, setError]           = useState(null);
  const [dualCamera, setDualCamera] = useState(false);
  const [inClip, setInClip]         = useState(null);
  const [selectedCamera, setSelectedCamera] = useState('ForwardCam');
  const [isSearching, setIsSearching] = useState(false);
  const [searchSteps, setSearchSteps] = useState([]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pollTimers = useRef({});
  const prefetched = useRef(new Set());
  const allClipsRef = useRef([]);    // cached full clip list (mock or API)
  const isMockMode = useRef(false);  // true when running on mock data (no real API videos)

  // ── Upload Polling (skipped in mock mode) ──────────────────────────────
  const pollUpload = useCallback(async (filename) => {
    // In mock mode, immediately mark as ready — no real device to poll
    if (isMockMode.current) {
      setUploadStatus((prev) => ({ ...prev, [filename]: 'ready' }));
      return;
    }

    if (pollTimers.current[filename]) return;
    console.log(`[DVR] Starting poll for: ${filename}`);

    try {
      await api.startPlayback(IMEI, filename);
    } catch (e) {
      console.warn(`[DVR] startPlayback failed for ${filename}: ${e.message}`);
    }

    setUploadStatus((prev) => {
      console.log(`[DVR] ${filename} set to queued`);
      return { ...prev, [filename]: 'queued' };
    });

    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    const timer = setInterval(async () => {
      attempts++;
      try {
        const res = await api.pollUpload(IMEI, filename);
        console.log(`[DVR] pollUpload ${filename}: attempt=${attempts} status=${res.status}`);
        setUploadStatus((prev) => ({ ...prev, [filename]: res.status }));

        if (res.status === 'ready' || attempts >= MAX_ATTEMPTS) {
          clearInterval(timer);
          delete pollTimers.current[filename];
          if (res.status === 'ready') {
            console.log(`[DVR] ✅ ${filename} is ready — video should play now`);
          } else if (attempts >= MAX_ATTEMPTS) {
            console.warn(`[DVR] ⏰ ${filename} polling timed out`);
            setUploadStatus((prev) => ({ ...prev, [filename]: 'error' }));
          }
        }
      } catch (e) {
        console.warn(`[DVR] pollUpload error for ${filename}: ${e.message}`);
        clearInterval(timer);
        delete pollTimers.current[filename];
        setUploadStatus((prev) => ({ ...prev, [filename]: 'error' }));
      }
    }, POLL_INTERVAL);

    pollTimers.current[filename] = timer;
  }, []);

  /**
   * Normalize a clip's timestamps to the user's LOCAL timezone.
   * Mock data may have hardcoded timestamps from a different timezone.
   * This ensures all clip timestamps align with dayStartMs (also local).
   */
  const normalizeClip = useCallback((clip) => {
    const CLIP_DURATION_MS = 3 * 60 * 1000;
    const localStart = new Date(clip.year, clip.month - 1, clip.day, clip.hour, clip.minute, clip.second, 0).getTime();
    return {
      ...clip,
      startTimestamp: localStart,
      endTimestamp: localStart + CLIP_DURATION_MS,
      startMs: localStart,
    };
  }, []);

  // ── Load videos: try API first, then fall back to mockClips.json ────────
  const loadVideos = useCallback(async () => {
    // Try the real API first
    try {
      const data = await api.getVideos(IMEI, true);
      const apiClips = data.clips || [];

      if (apiClips.length > 0) {
        // Real API returned clips — normalize and use them
        isMockMode.current = false;
        allClipsRef.current = apiClips.map(normalizeClip);
        const dateSet = new Set();
        allClipsRef.current.forEach((c) => dateSet.add(c.dateStr));
        console.log(`[DVR] Loaded ${apiClips.length} clips from API`);
        return Array.from(dateSet).sort();
      }
    } catch (e) {
      console.warn('[DVR] API getVideos failed:', e.message);
    }

    // API returned empty or failed — fall back to mockClips.json
    try {
      const res = await fetch('/mockClips.json');
      const mock = await res.json();
      const mockClips = mock.clips || [];
      if (mockClips.length > 0) {
        isMockMode.current = true;
        allClipsRef.current = mockClips.map(normalizeClip);
        const dateSet = new Set();
        allClipsRef.current.forEach((c) => dateSet.add(c.dateStr));
        console.log(`[DVR] Loaded ${mockClips.length} clips from mockClips.json (mock mode)`);
        return Array.from(dateSet).sort();
      }
    } catch (e) {
      console.warn('[DVR] mockClips.json also failed:', e.message);
    }

    // Nothing available
    allClipsRef.current = [];
    isMockMode.current = true;
    return [];
  }, [normalizeClip]);

  // ── Load clips for a specific date (from cache) ─────────────────────────
  const loadClips = useCallback(async (date) => {
    setError(null);
    setPlayState('loading');

    try {
      const allClips = allClipsRef.current;
      let dateClips = date ? allClips.filter((c) => c.dateStr === date) : allClips;

      // If no clips for the requested date, use the earliest available date
      if (dateClips.length === 0 && allClips.length > 0) {
        const availableDates = [...new Set(allClips.map((c) => c.dateStr))].sort();
        const fallbackDate = availableDates[0];
        dateClips = allClips.filter((c) => c.dateStr === fallbackDate);
        setSelectedDate(fallbackDate);
        date = fallbackDate;
      }

      const dateStr = dateClips[0]?.dateStr || date || today();

      setClips(dateClips);
      // Build timeline from ALL cached clips — buildTimeline now filters by dateStr internally
      const tl = api.buildTimeline(allClipsRef.current, dateStr);
      setTimeline(tl);
      setPlayState('idle');
      return dateClips;
    } catch (e) {
      setError(e.message);
      setPlayState('error');
      return [];
    }
  }, []);

  // ── Initial load on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const sortedDates = await loadVideos();
        setDates(sortedDates);

        if (sortedDates.length > 0) {
          const latest = sortedDates[sortedDates.length - 1];
          setSelectedDate(latest);
          await loadClips(latest);
        } else {
          // No clips at all — just build an empty timeline for today
          const dateStr = today();
          setSelectedDate(dateStr);
          await loadClips(dateStr);
        }

        // Only trigger device refresh when NOT in mock mode and no clips found
        if (!isMockMode.current && allClipsRef.current.length === 0) {
          await refreshDevice();
        }
      } catch (e) {
        setError(e.message);
        setPlayState('error');
      }
    };
    init();
  }, []);

  // ── Handle date change ─────────────────────────────────────────────────────
  const handleDateChange = useCallback(async (date) => {
    setSelectedDate(date);
    setQueue({ current: null, next: null, buffered: null });
    setPlayState('idle');
    setScrubPercent(0);
    setUploadStatus({});
    setError(null);
    prefetched.current.clear();
    await loadClips(date || '');
  }, [loadClips]);

  // ── Search / trigger device scan (skipped in mock mode info) ─────────────
  const handleSearch = useCallback(async () => {
    if (isMockMode.current) {
      // In mock mode, just reload from cache
      setError(null);
      await loadClips(selectedDate);
      return;
    }

    setIsSearching(true);
    setError(null);
    setPlayState('loading');
    setSearchSteps(['Requesting video list from device...', 'Waiting for device to respond...', 'Polling for available videos...']);
    try {
      await api.requestVideoList(IMEI);
      let attempts = 0;
      const maxAttempts = 30;
      const pollDelay = 2500;

      const poll = async () => {
        attempts++;
        const data = await api.getVideos(IMEI, true);
        const session = data.session || {};
        setSearchSteps([
          `Polling... attempt ${attempts}/${maxAttempts}`,
          session.lastDateSent ? `Last date sent: ${session.lastDateSent}` : 'Waiting for data...',
          `Clips found: ${data.clips?.length || 0}`,
        ]);

        if (session.datesCompleted >= session.datesRequested?.length || attempts > 4) {
          allClipsRef.current = (data.clips || []).map(normalizeClip);
          isMockMode.current = false;
          const dateSet = new Set();
          allClipsRef.current.forEach((c) => dateSet.add(c.dateStr));
          const sortedDates = Array.from(dateSet).sort();
          setDates(sortedDates);
          setSelectedDate(sortedDates[sortedDates.length - 1] || '');
          await loadClips(sortedDates[sortedDates.length - 1] || '');
          setIsSearching(false);
          setPlayState('idle');
        } else if (attempts < maxAttempts) {
          setTimeout(poll, pollDelay);
        } else {
          setError('Device scan timed out. Please try again.');
          setIsSearching(false);
          setPlayState('idle');
        }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setError(e.message);
      setIsSearching(false);
      setPlayState('error');
    }
  }, [loadClips, selectedDate, normalizeClip]);

  // ── Refresh device storage (skipped in mock mode) ─────────────────────────
  const refreshDevice = useCallback(async () => {
    if (isMockMode.current) {
      // In mock mode, just reload from cache
      await loadClips(selectedDate);
      return;
    }

    setError(null);
    setPlayState('loading');
    try {
      await api.requestVideoList(IMEI);
      let attempts = 0;
      const maxAttempts = 30;
      const pollDelay = 2500;

      const poll = async () => {
        attempts++;
        const data = await api.getVideos(IMEI, true);
        const session = data.session || {};
        if (session.datesCompleted >= session.datesRequested?.length) {
          allClipsRef.current = (data.clips || []).map(normalizeClip);
          isMockMode.current = false;
          const dateSet = new Set();
          allClipsRef.current.forEach((c) => dateSet.add(c.dateStr));
          const sortedDates = Array.from(dateSet).sort();
          setDates(sortedDates);
          setSelectedDate(sortedDates[sortedDates.length - 1] || '');
          await loadClips(sortedDates[sortedDates.length - 1] || '');
          setPlayState('idle');
        } else if (attempts < maxAttempts) {
          setTimeout(poll, pollDelay);
        } else {
          setError('Device scan timed out. Please try again.');
          setPlayState('idle');
        }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setError(e.message);
      setPlayState('error');
    }
  }, [loadClips, selectedDate, normalizeClip]);

  // ── Build next/buffered from current clip ──────────────────────────────────
  const buildQueueFromClip = useCallback((clip, cameraType) => {
    if (!clip || !timeline) return { current: clip, next: null, buffered: null };
    const track = cameraType === 'ForwardCam' ? timeline.fwd : timeline.in;
    if (!track) return { current: clip, next: null, buffered: null };
    const idx = track.clips.findIndex((c) => c.filename === clip.filename);
    return {
      current: clip,
      next: track.clips[idx + 1] || null,
      buffered: track.clips[idx + 2] || null,
    };
  }, [timeline]);

  // ── Play a specific clip ────────────────────────────────────────────────────
  const playClip = useCallback(async (clip, offsetSeconds = 0) => {
    if (!clip) return;
    setError(null);
    setClipOffset(offsetSeconds);

    const q = buildQueueFromClip(clip, clip.cameraType);
    setQueue(q);

    let pairedIn = null;
    let pairedFwd = null;

    // Handle dual camera: find the paired clip from the other camera
    if (dualCamera) {
      pairedIn = timeline?.in.clips.find(
        (c) => Math.abs(c.startTimestamp - clip.startTimestamp) <= 5000
      );
      pairedFwd = timeline?.fwd.clips.find(
        (c) => Math.abs(c.startTimestamp - clip.startTimestamp) <= 5000
      );
      if (clip.cameraType === 'ForwardCam') {
        setInClip(pairedIn || null);
        if (pairedIn) pollUpload(pairedIn.filename);
      } else {
        setInClip(pairedFwd || null);
        if (pairedFwd) pollUpload(pairedFwd.filename);
      }
    } else {
      setInClip(null);
    }

    // In mock mode, skip API 3 and mark upload as instantly ready
    if (isMockMode.current) {
      const paired = clip.cameraType === 'ForwardCam' ? pairedIn : pairedFwd;
      setUploadStatus((prev) => {
        const nextStatus = { ...prev, [clip.filename]: 'ready' };
        if (paired) nextStatus[paired.filename] = 'ready';
        [q.next, q.buffered].forEach((c) => {
          if (c) nextStatus[c.filename] = 'ready';
        });
        return nextStatus;
      });
      setPlayState('playing');
      return;
    }

    // Real mode: trigger upload and start polling
    setPlayState('loading');
    pollUpload(clip.filename);

    // Pre-fetch next clips for seamless transitions
    if (!prefetched.current.has(clip.filename)) {
      prefetched.current.add(clip.filename);
      [q.next, q.buffered].forEach((c) => {
        if (c) {
          api.startPlayback(IMEI, c.filename).catch(() => {});
          pollUpload(c.filename);
        }
      });
    }
    setPlayState('buffering');
  }, [dualCamera, buildQueueFromClip, pollUpload, timeline]);

  // ── Timeline click → seek ────────────────────────────────────────────────────
  const seekToPosition = useCallback(async (positionPercent) => {
    if (!timeline) return;
    const cameraType = dualCamera ? 'ForwardCam' : selectedCamera;
    const result = api.resolveSeek(timeline, positionPercent, cameraType);
    if (!result) {
      setError('No footage at this position');
      setPlayState('idle');
      return;
    }
    setScrubPercent(positionPercent);
    await playClip(result.clip, result.offsetSeconds);
  }, [timeline, dualCamera, selectedCamera, playClip]);

  // ── Auto-advance when clip ends ─────────────────────────────────────────────
  const advanceToNext = useCallback(async () => {
    if (!queue.next) {
      setPlayState('idle');
      return;
    }
    await playClip(queue.next, 0);
  }, [queue.next, playClip]);

  // ── Update scrubber position based on video currentTime ─────────────────────
  const updateScrubber = useCallback((clipMeta, videoCurrentTime) => {
    if (!timeline || !clipMeta) return;
    const clipTs = clipMeta.startTimestamp + videoCurrentTime * 1000;
    const pct = ((clipTs - timeline.dayStartMs) / (timeline.dayEndMs - timeline.dayStartMs)) * 100;
    setScrubPercent(Math.max(0, Math.min(100, pct)));
    setCurrentTime(videoCurrentTime);
  }, [timeline]);

  // ── Re-trigger playback when dualCamera mode changes while a clip is playing ─
  useEffect(() => {
    if (queue.current) {
      playClip(queue.current, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dualCamera]);

  // ── Cleanup poll timers on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

  return {
    clips,
    dates,
    selectedDate,
    timeline,
    queue,
    playState,
    setPlayState,
    uploadStatus,
    currentTime,
    clipOffset,
    scrubPercent,
    speed,
    setSpeed,
    error,
    dualCamera,
    setDualCamera,
    inClip,
    selectedCamera,
    setSelectedCamera,
    handleDateChange,
    handleSearch,
    refreshDevice,
    playClip,
    seekToPosition,
    advanceToNext,
    updateScrubber,
    IMEI,
    isSearching,
    searchSteps,
  };
}
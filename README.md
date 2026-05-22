# okDriver — Smart Dashcam IoT Platform
## History Playback & Continuous Video Timeline

This repository contains the **frontend-only** implementation for the okDriver History Playback module, built as part of the Full Stack Developer Assignment.

---

## Setup & Running Locally

```bash
# 1. Navigate into the frontend directory
cd frontend

# 2. Install dependencies
npm i

# 3. Start the development server
npm run dev
```

Open your browser at `http://localhost:5173` (or the port shown in the terminal).

> **Note:** No backend setup is required. See the section below for details.

> **🔄 If you see a "Failed to Fetch" error on the video player, or if the video screen appears black** — do a hard refresh: **Ctrl + Shift + R**. This clears the browser cache and reloads all assets cleanly, which usually fixes both issues instantly.

> **⏳ Please be patient on first load** — the app may take a few seconds to initialize. It is fetching clip data from the API on startup (or loading the mock fallback if the API is unreachable). The timeline and player will appear once the data is ready.
 choose the date 20th may 2026 as i have uploaded clips for that date only.
---

##  Important: Backend / API Usage

**We have not built or hosted our own backend.**

The okDriver platform provides a **third-party backend API** (`http://smart.okdriver.in:5000`) that this frontend consumes directly from the browser. The API server returns `Access-Control-Allow-Origin: *`, so no proxy is needed.

Since this was a frontend assignment, I am **only submitting the frontend**. The backend (API server) belongs to the okDriver platform itself and is not part of this submission.

---

##  About the Demo — Why Mock Clips Were Used

I was **unable to record a live demo video** on the day the API was active and returning real device footage.

To ensure the project can still be fully demonstrated and evaluated at any time, a **transparent mock-data fallback** is built into the application. Here is exactly how it works:

### How the Fallback Works

1. On startup, the app **first tries to call the real API** (`GET /api/playback/videos/{imei}`) to fetch live clip data from the physical dashcam device.
2. **If the API returns an empty array** (because the device is offline or has no recordings) **or if the API is unreachable**, the app automatically falls back to `/mockClips.json`.
3. `mockClips.json` contains **152 pre-defined clip entries** mapped across a simulated full day, covering both Forward and Inward cameras.
4. In mock mode, the **upload-polling step (API 3) is skipped entirely** — all clips are instantly marked as `ready`, so the UI flows exactly as it would in production.
5. The entire continuous DVR timeline, dual-camera sync, click-to-seek, and auto-advance logic runs identically whether the data comes from the live API or the mock file.

This means: **every feature of the UI is fully demonstrable without a live dashcam device.**

---

## 1. What is this project about?

okDriver is a smart dashcam IoT platform for fleet managers and vehicle owners to remotely monitor, track, and retrieve video recordings from in-vehicle dashcams. The platform features real-time monitoring, historical playback, alert management, and driver behaviour analytics.

This project focuses on the **History Playback Module** (Monitor → History) — the interface that lets users review past footage recorded by the dashcams.

---

## 2. Features Implemented

| Feature | Description |
|---|---|
| **Continuous DVR-Style Playback** | Seamless auto-advance from one 3-minute clip to the next |
| **24-Hour Interactive Timeline** | Visual scrubber mapping hundreds of clips onto a 24-hour axis |
| **Dual Camera Synchronization** | Side-by-side Forward & Inward camera playback |
| **Click-to-Seek Navigation** | Click any point on the timeline to jump to the exact timestamp |
| **Responsive Player Controls** | Play/pause, variable speed (1×, 2×, 4×), sidebar clip list |
| **Mock Data Fallback** | Full UI demo without a live device (see above) |

---

## 3. Project Significance

For fleet operations, sifting through hundreds of isolated 3-minute video files to investigate an incident is incredibly tedious. This module solves that by weaving fragmented files into a single, cohesive timeline. By providing a continuous, DVR-like experience, fleet managers can intuitively scan through an entire day's worth of driving history — greatly accelerating incident investigation and driver monitoring.

---

## 4. Developer Notes

All video queuing, buffering, and API coordination is abstracted into the centralized custom hook `useDvrPlayback.js`. Key engineering decisions:

- **State Management:** Clip queue (`{ current, next, buffered }`), upload polling, and timeline math all live in one place.
- **Timeline Mathematics:** Raw clip timestamps are normalized to the user's local timezone and converted into percentage-based widths, so adjacent clips merge into solid DVR-style bands on the UI.
- **MSE Streaming:** A custom `hlsPlayer.js` engine uses MediaSource Extensions (MSE) to pipe raw `.ts` streams directly into the browser's native `<video>` element — no external player library needed.

---

## 5. Why Mock Data? (Full Technical Explanation)

During development, the live dashcam API frequently returned empty responses because the physical device was either powered off or had no recorded footage for the selected dates. Additionally, I was unable to record a demo on the specific day the API was live.

To ensure the UI could be fully demonstrated without relying on live hardware, I implemented a **transparent fallback mechanism**:

- If `GET /api/playback/videos/{imei}` returns `[]` **or** throws a network error, `isMockMode` is set to `true` and the app fetches `/mockClips.json` instead.
- Mock mode bypasses API 3 (the clip-upload trigger) entirely — uploads are instantly simulated as `ready`.
- **152 clips** spanning a full simulated day are loaded, giving reviewers a complete continuous-playback and timeline experience.

---

## 6. Deep Dive: MSE Auto-Recovery (Stall Detector)

One of the most complex challenges was dealing with corrupted or misaligned timestamps in raw MPEG-TS streams.

**The Problem:** When streaming raw `.ts` files via MSE, if the audio track is slightly longer than the video track, or a keyframe drops over the network, the browser's decoder freezes. The video still shows "Playing" but `currentTime` stops advancing and the native `ended` event never fires — breaking the continuous auto-advance logic.

**The Solution — Stall Detector inside `DvrPlayer.jsx`:**
1. A `setInterval` runs every **500ms** while the player is in the `playing` state.
2. It compares `video.currentTime` to the previous tick's value.
3. If `currentTime` hasn't changed for **2 full seconds** (4 consecutive ticks), a stall is declared.
4. The system forcefully nudges `currentTime` forward by `0.1s` — this microscopic jump flushes the stuck decoder buffer, jumps to the next valid keyframe, and resumes playback instantly.

Additionally, a fallback checks if `currentTime` is within `0.2s` of the total duration and manually fires `handleEnded`, guaranteeing a perfectly seamless clip transition loop.

# okDriver History Playback - Technical Case Study

## 1. Project Overview & Context
The okDriver platform is an IoT solution designed for remote dashcam monitoring and fleet management. A critical component of this system is the **History Playback Module**. Because hardware dashcams record footage in fragmented, continuous blocks (e.g., 3-minute clips) to prevent data corruption, reviewing a full day's driving history natively requires manually opening hundreds of files. 

The primary objective of this module was to engineer a web interface that visually stitches these fragmented clips together into a seamless, continuous, DVR-like 24-hour timeline, allowing fleet managers to effortlessly monitor a vehicle's historical state.

### Key Objectives:
*   **Continuous Auto-Playback:** Automatically queue and transition between clips.
*   **Interactive 24-Hour Timeline:** A visual scrubber that maps hundreds of short clips onto a daily axis.
*   **Dual Camera Mode:** Synchronized playback of both Forward and Inward facing cameras.
*   **Robust Streaming:** Handling unoptimized raw MPEG-TS (`.ts`) video files streamed directly from hardware over TCP.

---

## 2. Frontend Architecture
The application was built using React, prioritizing a strict separation of concerns between heavy state management and UI rendering.

*   **`HistoryMonitor.jsx` (Layout Controller):** Manages the dual-pane layout, the sidebar (device selection, date picker, clip list), and coordinates data flow to the timeline.
*   **`useDvrPlayback.js` (State Engine):** A central custom hook acting as the "brain". It maintains the clip queue (`{ current, next, buffered }`), coordinates API polling, normalizes timestamps, and handles timeline percentage calculations.
*   **`DvrPlayer.jsx` (Video Renderer):** Wraps the HTML5 `<video>` element. It handles user interactions, rendering overlays (loading, buffering, error), and safely binds React state to native DOM events.
*   **`hlsPlayer.js` (Media Engine):** A custom stream handler. Standard HTML5 `<video>` cannot play raw MPEG-TS files natively. This script leverages **MediaSource Extensions (MSE)** to fetch `.ts` files, strip proprietary hardware headers, and pipe raw binary data directly into the browser's hardware demuxer.

---

## 3. Challenges Faced & Solutions Implemented

During the implementation of this module, several complex technical challenges were encountered, particularly around hardware communication, timeline mathematics, and browser media decoding.

### Challenge 1: The "Invisible Timeline" & Sub-Pixel Rendering
**Problem:** Despite loading 150+ clips into the application, the 24-hour timeline appeared completely blank.
**Analysis:** There were two root causes. First, a timezone mismatch: the clips contained hardcoded UTC timestamps, but the timeline was rendering using the local system timezone, pushing the clips mathematically off-screen. Second, a 3-minute clip is roughly 0.2% of a 24-hour day. On a standard 1080p monitor, this equates to roughly 1.5 pixels in width. With CSS anti-aliasing and border-radius applied, the browser completely smoothed them out of existence.
**Solution:** 
1. Implemented a `normalizeClip` interceptor that recalculates all incoming clip timestamps to align with the local timezone.
2. Updated the timeline rendering algorithm to group mathematically adjacent clips and fuse them into single, continuous "bands".
3. Applied `min-width` and `overflow: visible` CSS properties to guarantee visibility of isolated clips.

### Challenge 2: Browser Decoder Freezes (MSE Stalls)
**Problem:** When streaming raw `.ts` chunks over HTTP to the MSE buffer, videos would randomly freeze mid-playback. The UI indicated the video was "Playing", but the time stopped advancing.
**Analysis:** This is a known limitation with browser decoders handling raw MPEG-TS files. If there is a missing keyframe dropped over the network, or if the audio track is slightly longer than the video track, the decoder pipeline panics and waits endlessly for a frame that will never arrive. The native `ended` event never fires.
**Solution:** Engineered an automated "Stall Detector and Auto-Recovery" mechanism inside `DvrPlayer.jsx`. A lightweight loop monitors the `video.currentTime` every 500ms. If the video is playing but the time hasn't changed for 2 full seconds, the system forcefully increments `currentTime` by `0.1s`. This microscopic "nudge" forces the decoder to flush its corrupted buffer, jump to the next valid I-Frame, and instantly resume playback without user intervention.

### Challenge 3: Continuous Playback Failures
**Problem:** The video queue would successfully play the first clip but fail to auto-advance to the next one.
**Analysis:** The auto-advance logic relies on the native HTML5 `ended` event. In the custom `hlsPlayer.js` engine, the recursive chunk-appending loop was terminating when the end of the file was reached, but it was failing to invoke `mediaSource.endOfStream()`. Without this explicit signal, the browser did not know the media was complete.
**Solution:** Rewrote the `updateend` event listener to explicitly check for `readOffset >= fileSize`. Upon reaching the end, it immediately calls `mediaSource.endOfStream()`, successfully triggering the native `ended` event and unblocking the clip queue.

### Challenge 4: Hardware Unavailability & Demo Data
**Problem:** During development and demonstrations, the live dashcam API frequently returned empty data because the physical test devices were powered off or had no driving history.
**Analysis:** The frontend needed a way to be tested and demonstrated without relying on live TCP handshakes with physical edge devices.
**Solution:** A transparent fallback interceptor was built. If the live API returns 0 clips, the application automatically flags `isMockMode = true` and intercepts the flow to fetch a local `/mockClips.json` file. The interceptor then automatically simulates hardware upload statuses (bypassing the "API 3" polling step), allowing the UI to seamlessly render 152 simulated clips for a fully functional offline demo experience.

### Challenge 5: React State vs. Native DOM Event Loops
**Problem:** Implementing play/pause controls in the custom UI occasionally resulted in unresponsive buttons or React infinite re-render loops.
**Analysis:** The React state (`playState`) and the native HTML5 `<video>` DOM state were fighting for control over the source of truth.
**Solution:** Strictly decoupled the event flow:
1. Native `onPlay` and `onPause` DOM events were bound as read-only listeners that passively update the React state.
2. A separate `useEffect` hook was created to listen for external React state changes (e.g., a user clicking a sidebar button). If the React state dictates "paused" but the DOM is "playing", the hook issues a programmatic `video.pause()` command. This unidirectional data flow completely eliminated state conflicts.

# MoveLab — Knee Range-of-Motion Tracker

A phone web-app (PWA) that measures **knee flexion angle** live from your phone
camera, for physiotherapy rehab. Built on validated full-body joint tracking
(MediaPipe Pose), it now focuses on the knee: live angle, session range of
motion (ROM), a bend/rep counter, and a recordable report.

## How it measures the knee
- Knee angle is measured at the **knee** between the **hip** and **ankle**;
  `clinical flexion = 180° − raw angle` (0° = straight leg).
- **View-adaptive** for accuracy:
  - **SIDE view** → uses the aspect-corrected **2-D image-plane** angle, which
    is the clinically correct sagittal plane for the knee and avoids MediaPipe's
    noisy depth axis. In side view only the **camera-facing** leg is measured.
  - **FRONTAL / ANGLED** → uses the **3-D world** angle (both knees).
- The reading is smoothed (One-Euro) and held with a small deadband so it stays
  **steady** while you hold still, and updates instantly when you move.

## Live app (published on GitHub Pages)
- **Knee tracker:** https://apexaiagent786-cpu.github.io/MoveLab-KneeQuest/
- **Rehab games:** https://apexaiagent786-cpu.github.io/MoveLab-KneeQuest/game.html

Open either on your phone, tap **Start**, allow the camera, optionally **Add to
Home Screen**. Phone browsers only allow the camera on a secure (HTTPS) origin,
which Pages provides.

Quick laptop check: `python -m http.server 8000` from the repo root → open
`http://localhost:8000/` (tracker) or `http://localhost:8000/game.html` (games).
`localhost` counts as a secure origin, so the camera works.

## Project structure
```
index.html          Knee ROM tracker (Pages entry)
game.html           Isometric rehab games (Wall-Sit Guardian, Seated Extension Hold)
manifest.json       PWA manifest
js/                 Shared ES modules
  core.js             pose/angle pipeline (OneEuro, KneeMeter, view detection)
  holdDetector.js     isometric hold detection + coaching cues + scoring
  storage.js          offline session history + progress analytics
desktop/            Python + OpenCV desktop tracker (see desktop/README.md)
tests/              In-browser core-logic test runner (tests/test.html)
docs/               Project documents (execution plan)
```

## Reliability (toward goniometer-grade)
- **Calibration ("Cal 0°")** — stand with the leg straight and tap **🎯 Cal 0°**.
  This zeroes the extension reference, removing each person's/camera's systematic
  offset (exactly how you'd zero a goniometer). Do this once per session/leg.
- **Median outlier rejection** removes single-frame spikes before smoothing.
- **One-Euro smoothing + deadband** → the number holds steady when you're still.
- **Physiological clamp** (0–160°) and **confidence gating** stop bad frames from
  corrupting ROM / reps. The panel shows a live **confidence %** per knee.
- A **continuous** smoothed value feeds ROM/reps/recording, while the on-screen
  number is the steadied display value.

> Still a camera estimate, not a certified device — but calibration removes bias
> and the filtering removes jitter, giving good repeatability. **Side view is the
> most reliable.**

## Using it (demo flow)
1. Stand **side-on**, 2–3 m back, whole body in frame, good light.
   Top bar should read **View: SIDE (L)** or **(R)**.
2. Straighten the leg and tap **🎯 Cal 0°** — a straight leg should now read ~0°.
3. The **Knee Flexion** panel shows the live angle, state (EXTENSION → MAX FLEX),
   confidence %, session **ROM (min–max)**, and **reps** (a rep = straighten →
   bend past 70° → straighten under 25°). A live arc + degree is drawn on the knee.
4. Tap **⏺ Record**, do a few knee bends / squats, tap **⏹ Stop**.
5. The **Report** opens: per-knee summary (min/peak flexion, ROM, reps) and a
   **flexion-vs-time chart**. Save with **⬇ CSV / ⬇ JSON**.

| Control | Action |
|---|---|
| **🔄 Flip** | mirror the image |
| **🎯 Cal 0°** | calibrate: straight leg → 0° (removes offset) |
| **🏷 Labels** | show/hide joint names |
| **⏺ Record / ⏹ Stop** | capture knee angle over time |
| **📊 Report** | summary + flexion-vs-time charts + export |
| **↺ Reset** | zero ROM, reps and calibration |

## What gets saved
- **CSV**: `time_s, left_knee_flex, right_knee_flex`
- **JSON**: per-frame samples + a per-knee ROM/reps summary.

## Accuracy note
This is a camera-based estimate, not a certified goniometer — expect a few
degrees of error. Side view gives the most reliable knee reading. Use as a
rehab/training aid.

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

## Run it on a phone (needs HTTPS)
Phone browsers only allow the camera on a secure origin. Easiest: **GitHub Pages**.
1. In the `apexaiagent786-cpu/MoveLab` repo → **Settings → Pages** →
   Source: **Deploy from a branch**, Branch: **main / root** → Save.
2. Open on your phone: **https://apexaiagent786-cpu.github.io/MoveLab/**
3. Tap **Start**, allow the camera, optionally **Add to Home Screen**.

Quick laptop check: `python -m http.server 8000` → open
`http://localhost:8000/mobile_app/` (localhost counts as secure).

## Using it (demo flow)
1. Stand **side-on**, 2–3 m back, whole body in frame, good light.
   Top bar should read **View: SIDE (L)** or **(R)**.
2. The **Knee Flexion** panel shows the live angle, state (EXTENSION → MAX FLEX),
   session **ROM (min–max)**, and **reps** (a rep = straighten → bend past 70° →
   straighten under 25°). A live arc + degree is drawn on the knee.
3. Tap **⏺ Record**, do a few knee bends / squats, tap **⏹ Stop**.
4. The **Report** opens: per-knee summary (min/peak flexion, ROM, reps) and a
   **flexion-vs-time chart**. Save with **⬇ CSV / ⬇ JSON**.

| Control | Action |
|---|---|
| **🔄 Flip** | mirror the image |
| **🏷 Labels** | show/hide joint names |
| **⏺ Record / ⏹ Stop** | capture knee angle over time |
| **📊 Report** | summary + flexion-vs-time charts + export |
| **↺ Reset** | zero ROM, reps and recording |

## What gets saved
- **CSV**: `time_s, left_knee_flex, right_knee_flex`
- **JSON**: per-frame samples + a per-knee ROM/reps summary.

## Accuracy note
This is a camera-based estimate, not a certified goniometer — expect a few
degrees of error. Side view gives the most reliable knee reading. Use as a
rehab/training aid.

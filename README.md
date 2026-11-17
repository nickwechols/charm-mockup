# charm mockup

A 3D iPhone mockup tool for screen recordings.

Run: `node serve.js`, then open http://localhost:5200

- Drop screen recordings or images anywhere (or onto a phone). They are kept in the browser (IndexedDB).
- Phones: Single, Pair, Fan of 3, Fan of 5, Staggered, Depth. Click a phone to choose its screen and pose it; Mirror poses its pair.
- Video: camera moves (Still, Float, Hero orbit, Slow push, Rising arc, Low angle, Tilt up, Spin reveal, Overhead tilt, Turntable). Length matches the screen recording, or set it. Lock camera to place the shot by hand.
- Export MP4 (9:16, 4:5, 1:1, 16:9; 1080p supersampled or 4K; 30/60 fps; Chrome). Screen recordings are stepped frame by frame, in sync with the camera.
- Photo: angle presets and saved views; PNG at 2K/4K, transparent or on a background.
- Look: background colours, gradient or your photo; lighting presets and light dial; phone finish; Dynamic Island.

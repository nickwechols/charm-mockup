# charm mockup

A 3D iPhone mockup tool for screen recordings.

Run: `node serve.js`, then open http://localhost:5200

- Drop screen recordings or images anywhere (or onto a phone). They are kept in the browser (IndexedDB).
- Position by hand: drag a phone to move it, Option-drag to turn it, Shift-drag for depth; Space-drag pans the framing; drag empty space to orbit; double-click empty space resets. Arrow keys nudge (Option turns, Shift for bigger steps), [ ] resize, Cmd+Z / Shift+Cmd+Z undo and redo.
- Phones: Single, Pair, Fan of 3, Fan of 5, Staggered, Depth. Click a phone to choose its screen and pose it; Mirror poses its pair.
- Build your own move: pick an In (Burst, Spin, Drop, Rise, Slide, Zoom, Flip), a Hold (Still, Float, Push in) and an Out (Burst, Spin, Fall, Fly up, Slide, Zoom, Flip), plus Timing (Snappy, Normal, Slow). The hold is dead-centre and straight on so the screen reads clean.
- Center (C) puts the phone in the middle of the frame and clears pan and framing; Face front (F) turns it square to the camera.
- Speed ramps: Burst in, Spin in, Drop in, Ramp out, Burst in + ramp out, Whip, Punch in, Rise up. Entrances and exits keep their timing; the hold in between stretches to the video length (Recording, 5, 10, 15, 30 s or any length on the slider). MP4 exports add motion blur on fast frames.
- Hide recording dot: removes the red iOS screen-recording dot from the top of recordings.
- Video: steady camera moves (Still, Float, Hero orbit, Slow push, Rising arc, Low angle, Tilt up, Spin reveal, Overhead tilt, Turntable). Length matches the screen recording, or set it. Lock camera to place the shot by hand.
- Export MP4 (9:16, 4:5, 1:1, 16:9; 1080p supersampled or 4K; 30/60 fps; Chrome). Screen recordings are stepped frame by frame, in sync with the camera.
- Photo: angle presets and saved views; PNG at 2K/4K, transparent or on a background.
- Look: background colours, gradient or your photo; lighting presets and light dial; phone finish; Dynamic Island.

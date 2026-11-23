# Code → Video

Code → Video is a lightweight, self-hosted web application that generates MP4 videos from JavaScript canvas code. Write a composition once, preview it in the browser, and render it on the server with FFmpeg. The application is designed to run on Android through Termux, but it works on any system with Node.js and FFmpeg installed.

## Features

- Canvas 2D composition editor with built-in templates (2D and 3D)
- Automatic property panel generated from a JSON schema embedded in the composition
- Live preview with deterministic, time-based animation
- Frame-by-frame rendering in the browser, encoded to H.264 MP4 by FFmpeg on the server
- Optional audio track with optional looping
- Configurable resolution, aspect ratio, quality preset, frame rate, and duration
- Render history that persists across page reloads
- Video gallery with download, move, and delete actions
- Local storage of saved compositions, plus import and export as JSON files

## Requirements

- Node.js 16 or later
- FFmpeg, including `ffmpeg` and `ffprobe`, available in `PATH`
- A modern browser with Canvas 2D support
- Internet access to load the Font Awesome stylesheet from the CDN (optional; the UI remains functional without icons)

### Installing on Termux (Android)

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs ffmpeg git
termux-setup-storage   # required only if you want to move videos to shared storage
```

## Installation

```bash
git clone https://github.com/Frhanz79/code-video.git
cd code-video
node server.js
```

The server starts on port 3000. Open `http://localhost:3000` in your browser. On a phone running Termux, open the same address in Chrome or Firefox.

The application has no npm dependencies. It uses only Node.js built-in modules.

## Project Structure

```
code-video/
├── server.js        HTTP server, job management, FFmpeg process control
├── public/
│   ├── index.html   Application layout
│   ├── app.js       Client logic: preview, rendering, gallery, props, storage
│   ├── style.css    Styling
│   ├── templates.js Built-in composition templates
│   └── docs.md      Composition reference documentation
├── output/          Rendered videos (created automatically)
├── tmp/             Temporary audio uploads (created automatically)
└── jobs.json        Render history (created automatically)
```

## Usage

1. **Editor:** Select a template or write your own composition. The property panel updates automatically.
2. **Render:** Use **Preview** to check the animation in the browser. Choose resolution, aspect ratio, quality, FPS, and duration, then select **Render**.
3. **Gallery:** Play, download, move, or delete rendered videos.
4. **Saved:** Store compositions in the browser for later use, or export them as `.json` files.
5. **Docs:** View, copy, or download the composition reference.

Keep the browser tab open and the screen active during rendering. The server stops a render if it receives no frames for 15 seconds.

## Composition Format

A composition is the body of a JavaScript function. The following variables are available:

| Name  | Type   | Description                                      |
|-------|--------|--------------------------------------------------|
| `ctx` | object | 2D canvas rendering context                      |
| `t`   | number | Current time in seconds                          |
| `W`   | number | Frame width in pixels                            |
| `H`   | number | Frame height in pixels                           |
| `D`   | number | Total video duration in seconds                  |
| `P`   | object | Current values of the properties                 |

Props are declared on the first line as a JSON array inside a comment block:

```js
/* props [
  {"key":"color","label":"Color","type":"color","value":"#f472b6"},
  {"key":"speed","label":"Speed","type":"range","min":0.2,"max":3,"step":0.1,"value":1}
] */
```

Supported property types are `text`, `color`, `range`, `number`, and `checkbox`.

### Rules for Compositions

- Animation must depend only on `t`. Do not use `Date.now()`, `performance.now()`, or `Math.random()`. Use a seeded hash function when randomness is needed.
- Draw the entire frame on every call, starting with a background fill.
- Do not use `import`, `require`, `fetch`, or DOM access.
- Do not use external images. `drawImage` with remote URLs will taint the canvas and prevent rendering.
- Express sizes and positions relative to `W`, `H`, or `D` so that the composition works at any resolution.

Refer to `public/docs.md` in the application for the complete reference and examples.

## Render Settings

| Setting     | Options                                                              |
|-------------|----------------------------------------------------------------------|
| Resolution  | 480p, 720p, 1080p, 1440p, 2160p (longest side)                       |
| Aspect ratio| 1:1, 16:9, 9:16, 4:5                                                 |
| Quality     | Low (ultrafast, CRF 28), Medium (veryfast, CRF 23), High (medium, CRF 20), Ultra (slow, CRF 16) |
| FPS         | 24, 30, 60 (the API accepts up to 120)                               |
| Duration    | 3, 5, 10 seconds, or a custom value                                  |

Maximum frame size is 3840 × 2160. Width and height must be even numbers. Durations above 120 seconds trigger a warning because rendering takes significantly longer and uses more memory.

## Audio

Audio is optional. Supported formats include MP3, WAV, M4A, OGG, AAC, and FLAC, with a maximum file size of 60 MB. Enable **Loop audio** to repeat a shorter track across the video. A longer track is trimmed to the video length.

## Storage and Moving Videos

Rendered videos are saved to the `output/` directory and appear in the Gallery. To move a video to the device's shared Movies folder, use the **Move** action. The default destination is `~/storage/shared/Movies/CodeVideo`. Destinations must be located inside `~/storage`. Moved videos no longer appear in the application's Gallery but are visible in the device's gallery app.

## API Overview

| Method | Endpoint                        | Purpose                         |
|--------|---------------------------------|---------------------------------|
| GET    | `/api/config`                   | Default destination and storage status |
| GET    | `/api/jobs`                     | Render history and active job   |
| DELETE | `/api/jobs/:id`                 | Remove a finished job from history |
| GET    | `/api/videos`                   | List rendered videos            |
| DELETE | `/api/videos/:name`             | Delete a rendered video         |
| POST   | `/api/videos/:name/move`        | Move a video to shared storage  |
| GET    | `/output/:name`                 | Stream or download a video      |
| POST   | `/api/audio`                    | Upload an audio track           |
| POST   | `/api/start`                    | Start a render job              |
| POST   | `/api/frame`                    | Send one raw RGBA frame         |
| POST   | `/api/finish`                   | Finalize encoding               |
| POST   | `/api/abort`                    | Cancel the active render        |

## Limitations

- Only one render can run at a time.
- Render speed depends on the device. High resolutions, high FPS, and long durations take considerably longer on mobile hardware.
- The browser performs the drawing, so the render stops if the tab is closed, the screen turns off, or the connection to the server is lost.
- Compositions cannot load external resources.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

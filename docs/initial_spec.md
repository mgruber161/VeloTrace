Great — these answers are enough to create the initial project prompt.

Below is a full, implementation-ready prompt you can give to an AI coding assistant or use as the project specification.

---

# Initial Project Prompt: VeloTrace

Build a client-side web application called **VeloTrace**.

VeloTrace lets a user upload a GPX file and generates a Strava-style animated route replay video. The app must run entirely in the browser with no backend, no server-side processing, and no file upload. It will be deployed as a static site on GitHub Pages.

The first version should be a reliable working prototype focused on smooth map animation and video export.

---

## 1. Product Summary

VeloTrace is a simple, clean, utility-focused web app where a user can:

1. Upload one `.gpx` file.
2. Preview an animated map replay of the activity.
3. Configure a small set of options.
4. Export a vertical video showing:
   - The route being drawn progressively.
   - A moving rider dot.
   - Current distance.
   - Current speed.
   - Current elevation.
   - Total ascent so far.
   - A final summary screen showing the full route and activity stats.

The app is intended for cyclists, runners, and general GPS activity users.

---

## 2. Non-Negotiable Constraints

### No backend

The app must be fully static and deployable to GitHub Pages.

Do not create:

- A server.
- API routes.
- Serverless functions.
- File upload endpoints.
- Database storage.
- User accounts.
- Cloud storage.

### Local processing

The GPX file must be processed locally in the browser.

The app may load external map tiles, but the user’s GPX file must not be uploaded anywhere.

Show a short trust message in the UI:

> Your file is processed locally in your browser.

### Primary export format

The primary target is MP4 using browser WebCodecs.

However, if MP4 export is not supported in the current browser, the app may fall back to WebM export.

If neither MP4 nor WebM export is available, show a clear error.

### Highest priority

The highest priority is:

> Smooth map animation and reliable export.

Avoid adding advanced features if they hurt smoothness or reliability.

---

## 3. App Name and Branding

App name:

> **VeloTrace**

Use the name only in the web app UI.

Do not add branding or a watermark to the exported video.

Visual style:

- Clean.
- Simple.
- Modern.
- Utility-focused.
- Light UI.
- Orange accent color.
- Slightly Strava-inspired, but not a clone.

Primary accent color:

```text
#FC4C02
```

Use a normal clean sans-serif font, for example:

- System UI font stack.
- Inter.
- Similar clean font.

No dark theme is required for MVP.

No analytics or tracking.

---

## 4. Technical Stack

Use:

- TypeScript.
- React.
- Vite.
- MapLibre GL JS for map rendering.
- WebCodecs plus an MP4 muxing library for MP4 export.
- MediaRecorder as a WebM fallback where appropriate.
- Web Workers for GPX parsing and heavy timeline calculations.
- Local storage for user settings.

The project should be deployable to GitHub Pages as a static build.

External CDNs are acceptable, but prefer bundling app dependencies with npm/Vite.

Map tiles will be loaded from external tile providers.

---

## 5. Core User Flow

### Step 1: Upload screen

Show a simple upload screen with:

- App name: VeloTrace.
- Drag-and-drop area.
- File picker button.
- “Load sample activity” button.
- Short help text:
  - Supported format: GPX.
  - Video is generated locally.
  - No account required.

### Step 2: Parsing

After the user selects a file:

- Parse the GPX locally.
- Extract track points.
- Calculate distance, time, speed, elevation, and ascent.
- Build a playback timeline.
- Show errors if the file is invalid.

If the file has no timestamps:

- Accept the file.
- Show a notice:
  
  > No timestamps found. Using simulated constant speed.

- Simulate movement along the route using the selected target video duration.

If the file has no elevation:

- Hide current elevation.
- Hide ascent.
- Hide elevation gain on the end screen.

### Step 3: Preview

Show a preview player with:

- Animated map replay.
- Play/pause button.
- Restart button.
- Simple progress indicator.
- Settings panel.

The preview should match the exported video as closely as possible.

### Step 4: Export

Provide an export button.

During export show:

- Progress percentage.
- Cancel button.
- Status text such as:
  
  > Rendering video…

After export completes:

- Automatically trigger download.
- Show a download button as a fallback.

---

## 6. Supported Input Files

For MVP:

- Support `.gpx` only.

Do not implement FIT, TCX, KML, or GeoJSON in the first version.

However, structure the parser code so other formats can be added later.

Future format priority:

1. GeoJSON.
2. TCX.
3. KML.
4. FIT probably never.

Accept only one file at a time.

Support:

- Drag and drop.
- File picker.
- Sample GPX file.

Include a sample cycling GPX file in the repository.

Sample activity requirements:

- Cycling activity.
- Approximately 45–60 minutes.
- Includes elevation.
- Includes timestamps.
- Interesting enough to show route movement.

---

## 7. GPX Parsing Requirements

Parse the following GPX data:

Required:

- Latitude.
- Longitude.
- Time.
- Elevation.

Not required for MVP:

- Heart rate.
- Cadence.
- Power.
- Temperature.

Ignore heart rate, cadence, and power for MVP.

However, if it is easy, keep the parser extensible so heart rate could be added later.

Parse:

- Track points.
- Multiple track segments.
- Pauses.
- GPS gaps.
- Very long activities.
- Large files as far as browser memory allows.

Use a Web Worker for parsing and timeline preparation.

Prefer efficient data structures:

- Typed arrays for latitude, longitude, time, elevation, cumulative distance.
- Avoid creating large numbers of unnecessary objects.
- Downsample route geometry for rendering if needed.

Downsampling rule:

- Automatically downsample the route for rendering performance.
- Preserve statistics and timeline accuracy as much as possible.
- The user should not need to configure this.

---

## 8. Activity Timeline and Playback Logic

The video must preserve real-time proportions during moving time.

This means:

- Faster sections should move faster.
- Slower sections should move slower.
- The entire moving activity should be compressed into the selected target duration.

Use moving time only.

Pauses should be skipped or heavily compressed.

### Target duration

The user selects one of these fixed target durations:

- 15 seconds.
- 30 seconds.
- 45 seconds.
- 60 seconds.

Default:

- 30 seconds.

The selected duration applies to the main route replay.

The final end screen is added after the selected duration.

Example:

- User selects 30 seconds.
- Main route animation: 30 seconds.
- End screen: 3 seconds.
- Final video: 33 seconds.

### Moving time mapping

Build a moving timeline from the GPX points.

Calculate cumulative moving distance and cumulative moving time.

Then map the original moving time to the selected target duration.

Example:

- Original moving time: 90 minutes.
- Selected video duration: 30 seconds.
- Playback speed multiplier: 180x.

Do not use a constant playback speed if timestamps are available.

### Pauses

Detect pauses using a combination of:

- Speed below a small threshold.
- No meaningful position movement.
- Track segment boundaries.
- Time gaps.

Pauses should be skipped or heavily compressed in the final video.

### GPS gaps

Handle GPS gaps gracefully.

If a gap is 60 seconds or less:

- Smoothly interpolate between the surrounding points.

If a gap is longer than 60 seconds:

- Treat it as a pause/gap and skip it.

### Missing timestamps

If the GPX file has no timestamps:

- Accept the file.
- Simulate constant speed along the route.
- Use the selected target duration.
- Show a warning that the activity is being simulated.

In this mode:

- Speed overlay can display the simulated constant speed.
- Distance progresses smoothly from start to finish.
- Real-time proportional playback is impossible.

---

## 9. Map Rendering Requirements

Use MapLibre GL JS.

The map must support two styles:

1. Standard OpenStreetMap-style map.
2. Satellite imagery.

Default map style:

- Standard.

Use free tile sources for MVP:

- OpenStreetMap raster tiles for standard map.
- Esri World Imagery tiles for satellite.

Show required attribution.

The exported video must include small attribution text in a corner.

Example attribution:

```text
© OpenStreetMap contributors
```

For satellite:

```text
© Esri
```

Attribution should be:

- Small.
- Semi-transparent.
- Readable.
- Not visually dominant.

### Map camera

The camera must follow the current rider position.

During the main ride:

- Use a fixed zoom level chosen automatically at the start.
- The rider dot should remain centered.
- Use smooth camera motion.
- Do not dynamically zoom in/out during the main ride unless necessary for reliability.

The starting zoom level should be chosen automatically based on:

- Route bounds.
- Point density.
- Local visibility.

Choose a zoom level that keeps the active local area visible.

Clamp the zoom to reasonable values for activity replays.

### Final zoom-out

At the end of the route:

- Zoom out over 3 seconds.
- Show the entire drawn route.
- Transition into the end screen.

The end screen should show:

- Full route drawn in orange.
- Activity title.
- Date.
- Total distance.
- Total elevation gain.
- Total moving time.

If elevation is missing:

- Hide total elevation gain.

If date is missing:

- Hide date.

---

## 10. Route Drawing Requirements

Draw the traveled route progressively.

Do not show the remaining route during the main playback.

During main playback:

- Show only the traveled portion.
- Use a strong orange line.
- The current position is shown as a simple orange dot.

Do not use:

- Cycling icon.
- Running icon.
- Athlete avatar.
- Direction arrow.

The rider marker should be:

- A simple dot.
- Orange.
- Optionally with a subtle white outline for visibility.

Route color:

```text
#FC4C02
```

The route line should be clearly visible on both standard and satellite maps.

At the end screen:

- Show the entire route drawn.
- Hide or soften the moving dot.
- Keep the route orange.

---

## 11. On-Screen Stats Overlay

Show a bottom-left stats box during the main route animation.

The stats box should contain:

1. Distance traveled.
2. Current speed.
3. Current elevation.
4. Total ascent so far.

Visibility rules:

- The user can toggle each stat individually.
- Toggles affect both preview and export.
- Settings should be saved in local storage.

If elevation data is missing:

- Hide elevation.
- Hide ascent.
- Disable those toggles.

### Units

Support a metric/imperial toggle.

Metric:

- Distance: km.
- Speed: km/h.
- Elevation: m.
- Ascent: m.

Imperial:

- Distance: mi.
- Speed: mph.
- Elevation: ft.
- Ascent: ft.

Default:

- Metric.

The unit toggle affects:

- Preview.
- Export.
- End screen summary.

### Speed calculation

Calculate speed from GPX timestamps and positions.

Use smoothing to avoid GPS jitter.

Use a 5-second moving average.

When paused or when smoothed speed is effectively zero:

- Show `0`.

If no timestamps are available:

- Show the simulated constant speed.

### Elevation and ascent calculation

Smooth elevation data before calculating ascent.

Use a 3-meter threshold for counting elevation gain.

Only count positive elevation gains above the threshold.

Display:

- Current elevation.
- Total ascent so far.

Do not display:

- Elevation profile chart.
- Grade/slope.
- Descent.

---

## 12. End Screen

There is no start screen.

There is an end screen.

The end screen is added after the selected route duration.

End screen duration:

- 3 seconds.

End screen content:

- Full route drawn in orange.
- Activity title.
- Date.
- Total distance.
- Total elevation gain.
- Total moving time.

Source rules:

- Activity title:
  - Use GPX name if available.
  - Otherwise use the file name without extension.
- Date:
  - Use the first GPX timestamp.
  - If unavailable, hide the date.
- Total distance:
  - Calculated from the GPX track.
- Total elevation gain:
  - Calculated using the smoothed ascent logic.
  - Hidden if elevation is missing.
- Total time:
  - Use moving time.

The end screen should be clean and readable.

It should not include app branding.

Map attribution must still remain visible.

---

## 13. Video Output Requirements

The exported video must be vertical.

Aspect ratio:

```text
9:16
```

Do not support landscape or square in MVP.

Resolution options:

- 720p vertical: `720x1280`
- 1080p vertical: `1080x1920`

Default resolution:

- 1080p vertical.

Frame rate:

Let the user choose between:

- 30 FPS.
- 60 FPS.

Default:

- 30 FPS.

If the user selects 60 FPS, show a small hint:

> Larger file and slower export.

No audio.

No music.

No voice.

No branding.

### Export formats

Primary format:

- MP4 using WebCodecs and MP4 muxing.

Fallback:

- WebM using MediaRecorder if MP4 export is unsupported.

If fallback is used:

- Clearly tell the user that the browser does not support MP4 export.
- Name the file with `.webm`.

If neither is supported:

- Show a clear error.

### Export rendering

Export should render frames as fast as possible, not necessarily in real time.

For MP4 export:

- Render deterministic frames.
- Use an exact output canvas size.
- Draw map frame.
- Draw route overlay.
- Draw rider dot.
- Draw stats overlay.
- Draw attribution.
- Encode frame using WebCodecs.
- Mux into MP4.

For WebM fallback:

- Use canvas capture and MediaRecorder.
- Real-time recording is acceptable if needed.

Show export progress as a percentage.

Do not show estimated time for MVP.

Allow the user to cancel export.

Download file name:

```text
activity-title.mp4
```

or for fallback:

```text
activity-title.webm
```

Sanitize the activity title for use as a file name.

If no valid title exists:

```text
velotrace-video.mp4
```

---

## 14. Settings Panel

The settings panel should be simple.

Include:

### Video settings

- Duration:
  - 15s.
  - 30s.
  - 45s.
  - 60s.
- Resolution:
  - 720p.
  - 1080p.
- Frame rate:
  - 30 FPS.
  - 60 FPS.

### Map settings

- Map style:
  - Standard.
  - Satellite.

### Units

- Metric.
- Imperial.

### Overlay toggles

Individual toggles for:

- Distance.
- Speed.
- Elevation.
- Ascent.

If elevation data is missing:

- Disable elevation and ascent toggles.

Settings should be saved in local storage.

Do not store the GPX file itself in local storage.

---

## 15. UI Pages and Components

The app can be a single-page application.

Main UI areas:

1. Header.
2. Upload area.
3. Settings panel.
4. Preview player.
5. Export panel.
6. Error/help area.

### Header

Show:

- VeloTrace name.
- Short tagline:

```text
Turn your GPX into a route replay video.
```

### Upload area

Show:

- Drag-and-drop box.
- Browse files button.
- Load sample button.
- Supported format text.
- Local processing note.

### Settings panel

Show settings after a file is loaded.

On mobile, settings may collapse into a disclosure or bottom sheet.

### Preview player

Show:

- Vertical video preview area.
- Play/pause button.
- Restart button.
- Progress bar.

The preview should use the selected settings live.

### Export panel

Show:

- Export button.
- Format notice if fallback is required.
- Progress bar.
- Cancel button.
- Download button after completion.

### Errors

Show friendly but clear errors for:

- Invalid file type.
- Corrupt or unreadable GPX.
- No track points found.
- Missing timestamps, if handled as a warning.
- Missing elevation, if handled as a notice.
- Browser does not support MP4 export.
- Export failed.
- File too large for available memory.

---

## 16. Performance Requirements

The app should handle large GPX files as far as browser memory allows.

Use performance protections:

- Parse in a Web Worker.
- Calculate timeline in a Web Worker.
- Use typed arrays where practical.
- Downsample route geometry for rendering.
- Avoid rebuilding large GeoJSON objects every frame if possible.
- Use efficient route progress updates.
- Debounce or batch UI updates where appropriate.

The preview must remain smooth.

Prioritize smooth map animation over advanced features.

For export:

- Wait for map tiles to load before capturing each frame where practical.
- Avoid capturing frames with blank map tiles if possible.
- If tile loading is slow, export may be slow.
- Show progress percentage during export.

---

## 17. Browser Support

Target modern browsers.

Primary export support:

- Chrome.
- Edge.
- Chromium-based browsers with WebCodecs support.

Preview should work in modern browsers where MapLibre works.

Export behavior:

- If MP4 export is supported, use MP4.
- If MP4 export is unsupported but WebM capture is supported, offer WebM fallback.
- If neither is supported, show an error.

The UI should be responsive and usable on mobile devices.

However, export reliability may be lower on mobile browsers.

If the browser is unsupported for export, show a helpful message.

---

## 18. Privacy and External Requests

Do not upload the GPX file anywhere.

Do not send activity data to a backend.

Do not include analytics.

External requests are acceptable only for:

- Map tiles.
- Fonts, if used.
- Possibly CDN assets, though bundling is preferred.

The app should be usable without accounts or login.

---

## 19. Visual Design Requirements

Use a clean, light, modern interface.

Suggested design direction:

- White or off-white background.
- Light gray cards.
- Dark gray text.
- Orange primary buttons.
- Rounded corners.
- Simple shadows.
- Clean spacing.
- Utility-focused layout.

Do not make it dark or overly sporty.

It may feel slightly Strava-inspired, but should remain simple.

The video overlay should be clean and readable.

Suggested overlay style:

- Bottom-left stats box.
- Semi-transparent dark or light background depending on readability.
- White or dark text depending on background.
- Orange accent for active rider/route.
- Small attribution in bottom-right or another unobtrusive corner.

No customizable colors in MVP.

No themes in MVP.

No custom branding in exported video.

---

## 20. Suggested Project Structure

Use a Vite React TypeScript project.

Example structure:

```text
src/
  components/
    App.tsx
    UploadPanel.tsx
    SettingsPanel.tsx
    PreviewPlayer.tsx
    ExportPanel.tsx
    ErrorBanner.tsx
    HelpText.tsx
  lib/
    gpx/
      parseGpx.ts
      gpxTypes.ts
    geo/
      distance.ts
      interpolate.ts
      downsample.ts
    timeline/
      buildTimeline.ts
      playback.ts
    stats/
      speed.ts
      elevation.ts
      ascent.ts
      units.ts
    render/
      mapRenderer.ts
      overlayRenderer.ts
      frameComposer.ts
    export/
      mp4Exporter.ts
      webmExporter.ts
      exportTypes.ts
    workers/
      gpxWorker.ts
  hooks/
    useSettings.ts
    useGpxActivity.ts
    usePreviewPlayer.ts
    useExporter.ts
  styles/
    app.css
  main.tsx
public/
  samples/
    cycling-sample.gpx
index.html
package.json
vite.config.ts
tsconfig.json
README.md
```

---

## 21. Implementation Notes

### GPX parsing

Parse GPX XML into a normalized activity structure.

Example:

```ts
interface ActivityPoint {
  lat: number;
  lon: number;
  time: number | null;
  ele: number | null;
}

interface ParsedActivity {
  title: string | null;
  startTime: number | null;
  points: ActivityPoint[];
  hasTime: boolean;
  hasElevation: boolean;
}
```

Then build a processed activity:

```ts
interface ProcessedActivity {
  title: string;
  date: number | null;
  hasTime: boolean;
  hasElevation: boolean;
  totalDistanceMeters: number;
  movingTimeSeconds: number;
  totalAscentMeters: number | null;
  timeline: TimelineSegment[];
  renderPath: RenderPoint[];
}
```

### Timeline

Create a timeline that maps video time to route position.

Example:

```ts
interface TimelineSample {
  videoTimeSeconds: number;
  distanceMeters: number;
  lat: number;
  lon: number;
  speedMetersPerSecond: number;
  elevationMeters: number | null;
  ascentMeters: number | null;
}
```

For export and preview, given a video time:

- Binary-search the timeline.
- Interpolate position.
- Interpolate displayed stats.
- Update map camera.
- Update route progress.

### Route progress

For route drawing:

- Keep a precomputed route line.
- Draw only the traveled portion.
- Avoid regenerating huge arrays every frame if possible.
- Use efficient slicing or precomputed segment indexes.

### Map export

For export:

- Use a canvas sized exactly to the selected resolution.
- Render the map into that canvas.
- Draw overlays on top.
- Capture frames.

For MapLibre:

- Use `preserveDrawingBuffer: true`.
- Disable unnecessary animations.
- Wait for map idle/tile loading where possible.
- Use deterministic camera updates.

### MP4 export

Use WebCodecs if available.

Check support before enabling MP4 export.

Use an MP4 muxing library such as:

- `mp4-muxer`
- or another maintained browser-side MP4 muxer.

Encode H.264 video where supported.

No audio track.

### WebM fallback

If MP4 is unavailable:

- Check whether `MediaRecorder` supports canvas capture.
- Prefer WebM output.
- Clearly label the fallback.

---

## 22. Error Handling Requirements

Handle these errors:

### Invalid file type

If the file is not `.gpx`:

> Please choose a GPX file.

### Corrupt or unreadable GPX

If parsing fails:

> This GPX file could not be read.

### No track points

If GPX parses but contains no track points:

> No track points were found in this GPX file.

### Missing timestamps

If timestamps are missing:

- Do not treat as fatal error.
- Show warning:

> No timestamps found. The route will be simulated at constant speed.

### Missing elevation

If elevation is missing:

- Do not treat as fatal error.
- Show notice:

> No elevation data found. Elevation and ascent are hidden.

### Unsupported export

If MP4 is unsupported but WebM is available:

> This browser does not support MP4 export. You can export as WebM.

If neither is available:

> Video export is not supported in this browser. Please try Chrome or Edge.

### Export failure

If export fails:

> Video export failed. Please try different settings or another browser.

### Large file/memory issue

If the file appears too large or processing fails:

> This file may be too large for your browser. Try a smaller GPX file.

---

## 23. Settings Persistence

Save user settings in local storage.

Settings to persist:

- Duration.
- Resolution.
- Frame rate.
- Map style.
- Units.
- Overlay visibility toggles.

Do not persist:

- GPX file.
- Activity data.
- Exported video.

Use a storage key such as:

```text
velotrace:settings
```

---

## 24. Sample Activity

Include a sample GPX file in:

```text
public/samples/cycling-sample.gpx
```

The sample should:

- Be a cycling activity.
- Last approximately 45–60 minutes.
- Include timestamps.
- Include elevation.
- Have a route interesting enough for a demo.

The sample button should load this file and immediately prepare the preview.

---

## 25. Out of Scope for MVP

Do not implement:

- User accounts.
- Cloud storage.
- Social sharing.
- Strava API integration.
- GPX editing.
- Route trimming.
- Multi-activity comparison.
- Paid features.
- Audio/music.
- Elevation profile chart.
- Custom route colors.
- Multiple themes.
- Shareable links.
- Frame image downloads.
- Multiple files at once.
- Landscape video.
- Square video.
- 1440p.
- FIT parsing.
- TCX parsing.
- KML parsing.
- GeoJSON parsing.

These may be added later.

---

## 26. Acceptance Criteria

The MVP is complete when:

1. The app loads as a static site.
2. A user can upload a GPX file using drag-and-drop or file picker.
3. A sample GPX can be loaded.
4. The GPX is parsed locally.
5. The preview shows a smooth animated route replay.
6. The map follows the rider dot.
7. The traveled route is drawn progressively in orange.
8. The rider is shown as a simple orange dot.
9. The video uses real-time proportional movement when timestamps exist.
10. Pauses are skipped or heavily compressed.
11. The user can choose 15s, 30s, 45s, or 60s.
12. The user can choose 720p or 1080p vertical resolution.
13. The user can choose 30 or 60 FPS.
14. The user can toggle metric/imperial units.
15. The user can toggle distance, speed, elevation, and ascent.
16. Missing elevation hides elevation and ascent.
17. Missing timestamps trigger simulated constant-speed playback with a warning.
18. The end screen appears after the selected duration.
19. The end screen lasts 3 seconds.
20. The end screen shows full route, title, date, distance, elevation gain, and moving time where available.
21. Export produces a vertical 9:16 video.
22. Export produces MP4 where supported.
23. Export falls back to WebM with notice where MP4 is unsupported.
24. Export includes overlays and map attribution.
25. Export can be canceled.
26. Export progress is shown.
27. The downloaded file is named from the activity title.
28. Settings persist in local storage.
29. The UI is responsive on mobile.
30. The app contains no backend and no analytics.

---

## 27. Deployment

The app must be buildable as a static site.

Use:

```bash
npm install
npm run dev
npm run build
npm run preview
```

The production build should be deployable to GitHub Pages.

Configure Vite appropriately for GitHub Pages base path if needed.

Provide a README with:

- Project description.
- Local development instructions.
- Build instructions.
- GitHub Pages deployment instructions.
- Browser support notes.
- Note that map tiles are loaded from external providers.

---

## 28. Suggested Development Phases

### Phase 1: Project scaffold

- Create Vite React TypeScript app.
- Add basic layout.
- Add upload UI.
- Add sample GPX.

### Phase 2: GPX parsing

- Parse GPX.
- Extract points.
- Detect missing time/elevation.
- Calculate distance and moving time.
- Handle errors.

### Phase 3: Timeline and stats

- Build moving timeline.
- Smooth speed.
- Calculate ascent.
- Handle pauses/gaps.
- Handle missing timestamps.

### Phase 4: Map preview

- Render map.
- Follow rider.
- Draw traveled route.
- Show rider dot.
- Implement final zoom-out.
- Add overlay stats.

### Phase 5: Settings

- Duration.
- Resolution.
- Frame rate.
- Map style.
- Units.
- Overlay toggles.
- Local storage persistence.

### Phase 6: Export

- MP4 export with WebCodecs.
- WebM fallback.
- Progress bar.
- Cancel.
- Download.
- Error handling.

### Phase 7: Polish and deployment

- Mobile responsiveness.
- Visual polish.
- Error messages.
- README.
- GitHub Pages deployment.

---

## 29. Final Guidance

When making implementation decisions, prioritize:

1. Smooth animation.
2. Reliable GPX parsing.
3. Reliable export.
4. Simple user experience.
5. Browser compatibility.
6. Code maintainability.

Do not add complex features unless they directly support the MVP.

The first version should feel like a polished working prototype, not a full editor.

Build VeloTrace as a free, static, client-side GPX route replay video generator.
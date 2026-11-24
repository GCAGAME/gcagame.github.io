# GCA: Grand City Adventures

A single-player WebGL 2 exploration and driving game set in the fictional Pacific Northwest county of Briar. Five missions connect a suburban driveway, a working parcel depot, the civic district, a harbor and a mountain lookout. After the campaign, the county stays open for driving, shopping and resident errands.

## Play

Play at **[gcagame.github.io](https://gcagame.github.io/)** in desktop Chrome or Edge with hardware acceleration enabled. This repository is the source for the gcagame.github.io user site. GitHub Pages serves index.html and the local asset folders from the root of main. The vendored Three.js renderer and native JavaScript modules run directly in the browser.

For an offline copy, follow the standalone build instructions below.

Choose **New Game**. Look around with the mouse or arrow keys, walk to the sedan, and press **E** when its prompt appears. Follow the orange route on the minimap to Civic Square. Bring the car to a complete stop inside the marked bay to collect the first reward.

## Normal and Hardcore modes

Select a mode above **New Game** or **Continue**. Normal Mode uses the original county, campaign and survival rules. Hardcore Mode adds armed encounters, dangerous traffic and county patrols to that same journey. Each mode has its own manual save and autosave. Earlier saves appear under Normal Mode.

In Hardcore, you start with 100 HP and a Rook Sidearm. On foot, hold the right mouse button to aim and the left to fire. Press **R** to reload, **Q** to cycle weapons, or **1–3** to select an owned weapon. Use **E** for doors, vehicles and other interactions. On a standard controller, use the left and right triggers to aim and fire, D-pad down to reload and the right shoulder button to cycle weapons. Driving controls stay the same.

The **Parcel Exchange Outfitters** counter inside the post office and **North Ridge Outfitters** on the back of the trailhead board sell weapons and ammunition for campaign money. Open the county map and choose either outfitter to set a route.

Witnesses can report gunfire, assaults, vehicle theft and deliberate ramming. The driveway sedan, registered cars and the off-roader issued for Mountain Exploration are authorized. A stolen police cruiser sends its position when taken. Stars show the strength of the response. Officers can lose sight of you and search the last reported location. Break contact long enough for stars to fall. When officers hold you at close range, or your health reaches zero, the recovery screen returns you to Cedar House. Arrest costs up to $25 and county rescue costs up to $15.

Under **Settings → World**, **Blood Effects** enables a brief burst of stylized particles. It starts off and is saved as a browser preference.

The browser captures the mouse during play. Click the world to recapture it. Arrow keys also control your view. Escape pauses the game. In an embedded preview that restricts mouse capture, open the HTML directly in a browser.

[View the front and rear interior comparisons for all five vehicles.](docs/vehicle-interiors/README.md)

## Controls

| On foot | Action |
| --- | --- |
| W A S D | Move |
| Mouse or arrow keys | Look |
| Shift / Ctrl | Sprint / crouch |
| Space | Jump |
| E or left mouse | Use the nearest prompted interaction |
| Right mouse, held | Focus |
| F / V | Flashlight / switch perspective |
| M / I / Tab | Map / inventory / objectives |
| Escape | Pause, resume or go back |

| Driving | Action |
| --- | --- |
| W / S | Accelerate / brake and reverse |
| A / D | Steer |
| Space | Handbrake |
| E | Exit when slow |
| C or V | Switch between chase and cabin cameras |
| H / L | Horn / headlights |
| U | Recover the vehicle onto nearby clear ground |

The map supports waypoints, zoom and drag. Clear a custom waypoint to follow the current mission route again. The shop is at the Parcel Exchange. Vending machines also sell provisions. Equipment, garage access and vehicle upgrades use money earned in the game.

## Foundry Row

Follow the Civic Square road west to the sawtooth-roofed **Foundry Motors** showroom. Press **E** at the door, then use the collections counter to browse five vehicles. Registered vehicles can be repainted, fitted with graphite rims, tuned, and collected from the marked bays outside. Keep a collection bay clear.

Speak to the motor club or the dispatch contact outside the showroom for two timed road races and two courier contracts. The objectives page tracks your current run. Survey rubbings can be found at the archive, waterfront lift and mountain lookout. A rubbing unlocks the trail 4×4 for purchase, and finishing a race unlocks the sports coupe. Vehicle registration, finishes, side work and rewards are included in saved journeys.

Cedar Grocery sells provisions. A meal at Juniper Kitchen restores health. Both have walk-in interiors. The public garage has a drive-through ground level. Most apartment and office floors are scenery.

Sprinting and swimming spend stamina. Walking, resting or drinking water restores it. A field jacket protects you in mountain snow. Cold water, long exposure and hard landings can cost health. Benches, water and first-aid kits help you recover. If health reaches zero, county rescue returns you home and charges up to $15.

## Missions

| Mission | Completion | Reward |
| --- | --- | ---: |
| Welcome to the City | Take the driveway sedan to Civic Square and park. | $150 |
| Delivery Driver | Talk to the dispatcher, accept the job, collect the parcel and deliver it on foot. | $220 |
| Mountain Exploration | Switch to the trailhead off-roader. Follow the marked junctions and stop at North Ridge Lookout. | $300 |
| City Discovery | Record two landmarks on foot and sign the depot register. | $180 |
| Night Drive | Start at Civic Square. Pass two checkpoints and park before the timer expires. Speeding and red lights cost time. An expired run can be retried. | $400 |

## Saving

Progress autosaves during play, when leaving the game and when the window loses focus. **Pause → Save Game** keeps a separate manual save. **Load Game** prefers the manual save. **Continue** loads the newest valid save. Both saves and settings use local browser storage. Reopen the same file in the same browser profile to continue. Changing from the standalone file to a locally served copy creates a separate browser storage origin.

### Move a saved journey

Saves belong to the browser profile and address where you played. To move your newest saved journey, serve this version at your previous localhost address and port, open **Main menu → Settings → Export Saved Journey**, then visit the official site in a browser profile with empty GCA save slots. Choose **Settings → Import Saved Journey**, select the JSON file and choose **Continue**. The transfer stays on your device. Keep the file as a backup. For a game previously opened as a standalone HTML file, back up that HTML and open the transfer-enabled standalone build at the exact same file path in the original browser profile to export.

## Rendering and performance

The world uses textured procedural architecture, instanced vegetation, streamed terrain, PBR materials, filmic tone mapping and dynamic shadows. Desktop GPUs supporting sRGB BC1 can use compressed surface textures. Other GPUs use the bundled WebP assets. Weather changes cloud cover, visibility, precipitation, road appearance and tire grip. Snow falls in the highlands. A continuous clock drives light, traffic signals operate in real time, and the night mission sets the clock to evening.

Settings include four quality presets plus individual controls for resolution, frame pacing, shadows, textures, reflections, screen-space ambient occlusion, color grading, field of view and camera behavior. **Display refresh** follows the browser's animation clock. Use the FPS readout and adaptive resolution to tune performance on your machine.

Vehicle and player physics run at 60 fixed ticks per second. Vehicle movement uses swept convex footprints, a spatial collision grid and vertical overlap checks. Rock footprints follow each transformed mesh. Driving into an obstacle stops the vehicle at contact and allows reversing away. Embedded vehicles recover automatically. While driving, press **U** for manual recovery.

Trees near the player use instanced trunk, branch and canopy meshes. Medium-distance trees use a lighter 3D mesh and distant trees retain photographic billboards. LOD distance thresholds expand with the preset. High and Ultra load additional grass and rock albedo and normal textures on demand. Ultra uses 2K surface color, up to a 4096-pixel shadow map, and larger ambient-occlusion and wet-reflection sampling budgets.

The game depicts a compact county. Selected buildings have accessible interiors. Vehicles use a bicycle steering model, surface-dependent traction and visual suspension. Reflections combine an environment map with a screen-space approximation on wet surfaces. The menu uses original key art. All movement, driving and mission scenes render live.

## Run or modify the source

The source edition uses native JavaScript modules and a locally bundled copy of Three.js r170. From this folder, run the following command with Python 3 installed.

~~~powershell
python -m http.server 8000 --bind 127.0.0.1
~~~

Open [the local game](http://127.0.0.1:8000/) in a desktop browser. For controller and scene inspection during development, append the query string ?inspect. This exposes the live game systems as window.briar.

| Source | Responsibility |
| --- | --- |
| src/main.js | Initialization, input, settings, animation loop, saving and loading |
| src/world*.js | Terrain, chunks, architecture, props, collision surfaces and wildlife |
| src/simulation.js and src/sim-models.js | Player movement, vehicles, cameras, traffic and pedestrians |
| src/campaign.js and src/navigation.js | Mission progression, rewards and road routing |
| src/interactions.js | World actions, shop, equipment, optional errands |
| src/survival.js | Stamina, exposure, falls and recovery |
| src/climate.js, src/rendering.js and src/surfaces.js | Weather, lighting, GPU texture loading and post-processing |
| src/audio.js | Procedural sound effects, engine and ambience |
| src/ui.js, src/ui-map.js, index.html and style.css | Interface and terrain-based maps |

To rebuild the standalone edition, install esbuild on your development machine and run **python build_offline.py**. Alternatively, supply an executable path using **--esbuild**. The script writes **Play GCA.html** beside this source folder by default. Use **--out** to choose a different output filename.

See **assets/SOURCES.md** for asset provenance and licenses.

## Verification

The source includes repeatable physics and browser checks. To run the browser checks, start the local server above and install the Python Playwright package on your development machine. The checks launch an isolated Chrome session.

~~~powershell
python tests/check_game.py
python tests/check_field.py
~~~

The first check covers the start menu, movement, vehicle controls, mission transitions, rewards, purchases and save/load. It places the player at later mission checkpoints to test the completion conditions. The second checks physical interactions, the lift, swimming, stamina, weather, lighting and route generation.

Run **python tests/hardcore-browser.py** against the same server to check mode isolation, weapon input and purchases, door cover, hit effects, arrest, death and saved recovery. **tests/hardcore-city.mjs** and **tests/hardcore-traffic.mjs** exercise the AI and vehicle controller with deterministic encounters. Bundle them using the Node/esbuild command below, substituting the desired test filename.

The driving regression advances the actual vehicle controller through the streets using steering, throttle and brake inputs. It verifies the first mission payout, the mountain switchbacks, staff entering and leaving work, and signal-controlled pedestrian crossings. With Node and esbuild installed, run it from the source folder.

~~~powershell
esbuild tests/drive-county.mjs --bundle --platform=node --format=esm --alias:three=./vendor/three.module.js --outfile=drive-check.mjs
node drive-check.mjs
~~~


Run **python tests/phase1.py** against the same local server for the vehicle impact, embedded-save recovery, fixed-tick and preset regressions. The tests also accept a standalone file URL. The project folder and browser storage keys retain the earlier game identifier for compatibility.

Run **python tests/phase1b.py** for the full opening mission in Chrome, camera controls, manual save/load, preset persistence and perimeter driving. The mission test supplies walking, steering, throttle and brake inputs along the existing streets. Independent edge cases start the player at saved positions close to each edge and corner. The terrain seam test can be bundled with the same Node/esbuild command as the driving test above, substituting **tests/terrain-seams.mjs** as the entry file.

### Foundry Row checks

With the local server running, these commands exercise the district doors, parking garage, high-speed impacts, races, purchases, customization, courier contracts and saved progress. The audio check renders the game's sound into a stereo buffer in Chrome.

~~~powershell
python tests/district.py http://127.0.0.1:8000/
python tests/activities.py http://127.0.0.1:8000/
python tests/activities.py http://127.0.0.1:8000/ --course cedar
python tests/audio.py
~~~

The race tests steer through the five gates and cross the finish line. The archive courier test walks the route and reloads a save while carrying the package. The harbor contract and distant survey plaques use saved positions near the interaction points. The fleet and pedestrian checks in **tests/fleet-traffic.mjs** and **tests/people.mjs** use the same Node build procedure as the county driving check above.

### Foundry Row performance

The previous standalone game and the Foundry Row edition ran sequentially in desktop Chrome on Intel UHD integrated graphics with a 1280×720 viewport. Each preset used its own rendering scale. The benchmark drove the same daylight route once to warm up the renderer, reset the drive, then sampled ten seconds with adaptive resolution disabled.

| Driving preset | Previous average FPS | Foundry Row average FPS |
| --- | ---: | ---: |
| Low | 59.8 | 48.2 |
| Medium | 37.2 | 30.1 |
| High | 25.9 | 23.1 |
| Ultra | 13.5 | 11.1 |

Frame pacing varies with available system memory. A separate first-pass test on this 8 GB computer experienced a 54-second stall. One reload with Ultra saved exceeded the 150-second startup test limit. First visits and results on other hardware can differ substantially from the warmed averages.

## Phase 1B terrain and boundary

The old skyline mesh overlapped the detailed ground and applied a 17-metre change in its height offset. The two surfaces could cross, and vehicle contact followed only the detailed surface. The new foothills, cliffs and distant ridges share one height function. Fine and coarse tiles meet along the same edge vertices and normals. Terrain close to the player uses the same six-metre triangular grid as ground contact. Coarse tiles use a 24-metre interior grid.

The existing map limits are 660 metres east and west, 690 metres north and 470 metres south of the origin. Pedestrians, rotated vehicle footprints and cameras respect these limits. Approaching at an angle leaves room to slide along the edge. The HUD message clears after moving back into the county. Distant ridges and trees beyond the boundary use visual geometry only.

Grass, trail soil, gravel and rock blend across trail shoulders, slopes and elevation bands. Near rock faces use slope-aware texture projection. Distant terrain uses broad material colours and a mipmapped mineral texture. The sun and sky balance shift with elevation and cloud cover, and the shadow camera moves in step with its depth map.

## Phase 1 verification results

These measurements describe the earlier Phase 1 build. The Phase 1B checks and measurements appear below.

Chrome on Intel UHD graphics, 1280×720 viewport, 6.8 seconds of downtown driving per preset following warmup. Adaptive resolution was disabled. These measurements apply to this route and hardware.

| Preset | Internal render size | Average FPS | 95th-percentile frame time |
| --- | --- | ---: | ---: |
| Low | 921×518 | 52.8 | 17.6 ms |
| Medium | 1280×720 | 42.5 | 33.9 ms |
| High | 1280×720 | 28.8 | 50.3 ms |
| Ultra | 1600×900 | 11.5 | 134.3 ms |

All five vehicle classes stopped and reversed clear in 20 rock-impact cases with mixed frame intervals. Each class was tested at 4 m/s, 15 m/s, stock maximum and upgraded maximum. Embedded-save recovery, manual recovery, frame-rate independence, the downtown drive, mountain switchbacks and all five mission completion conditions passed. The model uses a swept horizontal footprint and vertical bounds; the narrow phase does not simulate suspension or wheel contact against every rock triangle. Run **node tests/collision.mjs** for the analytical thin-wall and oblique-impact cases.

## Phase 1B verification results

Chrome on Intel UHD Graphics, Direct3D 11, 1280×720 viewport, adaptive resolution disabled. These are short samples on one computer. The downtown test holds the accelerator on the same route for approximately seven seconds after warm-up. Frame times include streaming and rendering.

| Preset | Internal resolution | Downtown average FPS | 95th-percentile frame time |
| --- | --- | ---: | ---: |
| Low | 921×518 | 54.6 | 17.2 ms |
| Medium | 1280×720 | 32.3 | 50.3 ms |
| High | 1280×720 | 22.7 | 66.7 ms |
| Ultra | 1600×900 | 11.8 | 116.8 ms |

At the playable border, with the camera facing the surrounding mountains on Medium, the 3.5-second stationary samples averaged 58.9 FPS north, 59.7 FPS east, 60.1 FPS south, 60.2 FPS west.

An earlier Low profiling run recorded one 8.55-second interval between animation frames. The cause was not isolated. The final Low repeat completed without that stall.

The opening mission progressed from looking around and walking to the driveway sedan through the approach and parking checkpoints at Civic Square. The final balance was $230 after the $150 payout. Camera switching on foot and in the car, jumping and landing, entry and exit, brakes, pause, all four settings presets, saved settings after reload, manual save/load and Continue were exercised in desktop Chrome.

Starting from saved edge fixtures, the test walked into and away from every boundary and drove the upgraded sports car towards each edge and corner starting at 285.12 km/h. Both directions of parallel travel passed on every edge. The test checked the whole rotated footprint and camera coordinates throughout, then verified reverse escape. The mesh check compared 180 perpendicular joins across mixed detail levels, including shared normals, vertex positions, triangle winding and covered area. The rock collision regression exercised all five vehicle classes at four speeds.

A separate back-to-back driving comparison opened the Phase 1 and Phase 1B offline builds in the same Chrome session with adaptive resolution disabled. Medium averaged 29.2 FPS in Phase 1 and 40.4 FPS in Phase 1B. High averaged 20.2 FPS in Phase 1 and 26.2 FPS in Phase 1B.

## Phase 1C graphics and verification

The meadows combine two grass scans at different orientations with dry-soil patches. Surface relief and roughness follow the material underfoot. Dirt routes use a one-metre wear mask baked from the existing road segments. Their surface blends into the terrain, including gravel shoulders, while the road data still drives gameplay and navigation. Exposed rock follows slope and elevation.

Boulders use three instanced scan variants, shared mineral and lichen textures, and two geometry detail levels. Collision hulls come from the full near mesh at its installed orientation. Recovery from a save embedded in a hillside rock checks that the entire footprint clears the original rock. Sun tint and intensity vary with the length of its path through the atmosphere, diffuse skylight responds to cloud cover, and shadow alignment follows the light-space texel grid. Valley haze, fog and snow profiles share the existing fog pass.

The comparison sheet shows actual 1280×720 renders from identical camera poses in both builds, on High with adaptive resolution off and the clock fixed at 15:30. The meadow, trail and boulder use clear weather. The range uses partly cloudy weather.

### Frame-rate sample

Both offline builds ran sequentially in desktop Chrome on Intel UHD Graphics with a 1280×720 viewport, adaptive resolution off, and the same daylight driving route. Each driving sample lasted approximately 6.8 seconds after warm-up. Results apply to this computer and scene.

| Preset | Phase 1B average FPS | Phase 1C average FPS | Phase 1C 95th-percentile frame time |
| --- | ---: | ---: | ---: |
| Low | 56.8 | 55.9 | 17.0 ms |
| Medium | 37.7 | 43.3 | 34.1 ms |
| High | 25.8 | 26.0 | 50.7 ms |
| Ultra | 11.3 | 13.8 | 100.3 ms |

The separate stationary woodland view beside the boulder averaged 27.7 FPS in Phase 1B and 26.0 FPS in Phase 1C on High.

The final standalone game passed the opening mission, entry and exit, driving and braking, jumping, camera controls, pause, manual saves, Continue, preset persistence and all four boundary edges and corners. The collision suite ran all five vehicles against a generated rock at four speeds and checked reverse escape, embedded-save recovery, manual recovery and fixed-step consistency. The repeatable browser checks are tests/phase1.py and tests/phase1b.py.

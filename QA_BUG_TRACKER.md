# GCA QA bug tracker

The comparison release is `6299881b3bb3a5c6471757a2dc53b8cc1f808c7b`. Browser runs use disposable Chrome profiles. Coordinates below are world X and Z in metres.

| ID | Severity | System and symptom | Status |
| --- | --- | --- | --- |
| GCA-003 | High | Building doors could close through an occupant | Verified |
| GCA-001 | Medium | Streamed buildings stretched and gable siding sheared | Verified |
| GCA-002 | Medium | Farm barn lacked convincing construction and ground contact | Verified |
| GCA-004 | Medium | Farm silo floated above the hillside | Verified |

## GCA-003 — Doorway obstruction

- **Reproduce.** Open the showroom door at approximately (−85, −69), stand in the threshold and close it. On the deployed release the player's stationary body changed from clear to inside the collider. Also approach a partly open door from its swing side.
- **Expected and observed.** An occupied door should pause and yield. The original solid rectangle stayed across the closed threshold until 79% open, then disappeared. The rendered panel continued moving independently and could close onto a person.
- **Repair.** The visible panel and its convex collision shape now share a transform. Before each animation increment the door checks the entire swept space against people and vehicles, including head clearance beneath the lifting garage door. It waits on contact and continues when clear. Saves retain the angle of a partially obstructed door. Depot employees request passage before entering the swing and wait for clearance.
- **Verification.** Tested all six animated entrances at 15, 30, 60 and 120 simulated updates per second. Covered 72 stationary player placements near hinge, centre and tip, six stationary NPC obstructions, 120 toggle commands and eight walking or sprinting approaches and escapes at the showroom. Checked the shape against the rendered panel during motion, restored partial poses, and confirmed the door finished closing after the occupant left. Both depot employees entered and left on schedule. Also reproduced a 0.497 m overlap when standing from a crouch under the lowering garage door. Standing and upward jumps now check the available headroom. Releasing crouch stays under the panel until it clears, and a jump stops at its underside.

## GCA-001 — Building proportions and texture distortion

- **Reproduce.** Inspect the office tower at (−40, −107) from two streets. The released model used horizontal, vertical and depth scales of 0.408, 0.973 and 0.707. Inspect a residential gable end. The texture coordinate at its centred apex pointed to the right-hand edge of the texture. Measured on the released geometry, all 60 sampled siding gables had displaced apex coordinates, by up to 2.55 texture repeats.
- **Expected and observed.** A building should retain the source model's proportions at both detail levels, and siding should follow its surface. Independent per-axis lot fitting stretched windows and floors. The shared polygon builder assigned rectangular texture coordinates to triangular and trapezoidal faces.
- **Repair.** Fit the original detailed meshes uniformly inside the existing plots. Both detail levels use the detailed asset's reference dimensions. Adjust corresponding solid footprints and retain a full-width slab and open ground level at the public garages. Project repeating materials onto the face plane using physical dimensions. Retain artist-supplied texture coordinates and per-face graphics.
- **Verification.** Matched two street views against the public release. The sampled tower now scales by 0.407716 in all three directions at both 18 m and 120 m. Checked the texture midpoint on all 58 residential gable triangles found in the rendered scene. Drove under the public parking deck and reversed out.

## GCA-002 — Farm barn exterior

- **Reproduce.** Approach (−168, 10) from the front and gable end and inspect from the hill. The old barn consisted of a siding box, a simple gable and a flat dark door rectangle. At the downhill side its base sat above the terrain.
- **Expected.** A recognisable timber barn with fitted doors, roof construction and a foundation in contact with the hillside.
- **Repair.** Kept the existing 15 × 10 m footprint, rural use and location. Added timber boards and battens with weathered paint over the existing wood grain, paired braced doors with a track and hardware, glazed windows, loft vents and a seamed gambrel roof. The concrete foundation extends beneath the sampled terrain and the solid footprint reaches its base. The artwork uses the existing static mesh batches and shadow system.
- **Verification.** Compared actual High-preset frames of the front, end and distant approach with matched camera poses, clear weather and 14:00 lighting. Window frames, door braces and roof profiles are visible in the close views. Checked all four foundation corners and the 15 × 10 m collider. The barn remains a closed exterior landmark.

## GCA-004 — Floating silo

- **Reproduce.** Look across the slope at (−156, 10). The original silo started at 4.184 m, but the terrain under its centre measures 2.589 m. The original square collider also occupied clear space beside the circular shell.
- **Expected.** The shell should meet the terrain all the way around and its footprint should follow the metal wall.
- **Repair.** Anchored the silo at its own site and extended the shell below the lowest point on its 14-sided rim. Its collision footprint uses the same ring.
- **Verification.** Measured all 14 rim points, centre collision and clearance outside the curved wall. Reviewed ground contact in the matched farm views.

## Exploration and gameplay

| Test | Coverage and observed result |
| --- | --- |
| World sampling | 72 grid cells, 69 road nodes, 58 road midpoints and 22 named/targeted visits, including overlapping destinations. The controller moved at all 221 stops. Sampled dirt, grass, paved roads and water. Covered residential streets, downtown, the farm, mountain trail, wooded areas, harbor bridge, public garage, dealership, shops, mission venues and parking. |
| Terrain and boundary | 180 terrain tile joins checked. Approached all four edges on foot and in a tuned car at up to 285 km/h. Drove into and reversed away from all four corners. Exercised boundary sliding, reverse and camera constraints. |
| Vehicles | Five vehicle types at low, medium, stock maximum and tuned maximum speed against a rock. Tested penetration recovery, manual unstuck, thin walls, oblique and reverse impacts. The tuned sports car stopped at a tree and market wall and reversed away. Exercised steering, handbrake, parking, entry/exit, cameras, trails and hills. |
| Campaign | Completed Welcome to the City ($150), Delivery Driver ($220), Mountain Exploration ($300), City Discovery ($180) and Night Drive ($400). Verified $1,330 final balance including the $80 starting balance. Ordinary controller inputs covered each objective route. The test staged the starts of the mountain, archive and night routes. Browser checks separately covered dialogue, markers, 12 timed failures and restarts, completed-campaign save and Continue. |
| Activities and traffic | Completed both five-gate races with steering, restarts and payouts ($95 and $120). Checked courier pickups/handoffs, survey rewards, grocery purchase, showroom registration, paint, wheels and upgrades. In 150 simulated seconds the traffic test sampled 55 stops, 52 resumptions and zero traffic overlaps or pedestrian contacts. Checked employee shifts, crossings, actor rig visibility and animation. |
| UI, audio and saves | New Game, walking and jumping, menus, HUD, map, objectives, inventory, manual save/load, Continue, purchased vehicles, money, equipment, upgrades and legacy place keys. Checked stereo traffic audio and door/reward cues. The intro completed in 9.14 s and passed all three skip controls, desktop/mobile layout, official images and Chrome's stored SVG favicon. |
| Repetition and assets | 24 vehicle entry/exit pairs, 48 camera switches, 12 manual save/load pairs and two cycles through all four presets in gameplay. Observed a newer automatic save in browser storage after the game timer fired. Checked streamed assets, shader/console errors and HTTP errors. Compared 195 public runtime and asset files against the base release, with text line endings normalized. Binary assets matched byte for byte. |

[Matched in-game views of the barn, silo and office tower](tests/evidence/farm-and-office.jpg)

## Performance

Measured rendered frames in headless Chrome at 1280 × 720 on a Windows machine with Intel UHD graphics and 8 GB of RAM. Each build ran two preset cycles at Foundry Row with clear weather, display-rate rendering and adaptive quality disabled. Each table cell contains the two observed FPS values.

| Preset | Public release FPS | Repaired build FPS | Shadow map | Draw distance |
| --- | --- | --- | --- | --- |
| Low | 59.1, 60.1 | 59.6, 59.8 | Off | 200 m |
| Medium | 54.8, 51.0 | 43.4, 46.7 | 1024 | 395 m |
| High | 30.4, 44.5 | 29.0, 31.1 | 2048 | 560 m |
| Ultra | 14.2, 15.3 | 14.0, 15.3 | 4096 | 800 m |

The two Ultra samples ended with 321 and 321 registered geometries and 120 and 120 textures. Reported JavaScript heap ranged from 61 to 78 MB across the final run. Total GPU memory in bytes remains unmeasured.

Ultra fell below 30 FPS on this machine in both builds. A separate repaired-build stress run briefly averaged 2 FPS after repeated preset changes. Substantial variation between samples limits the precision of a before/after comparison. The High and Ultra presets load higher-detail vegetation and larger shadows. Low disables shadows, ambient occlusion and reflections.

## How to repeat the checks

Serve the repository root over HTTP. The browser scripts use Python Playwright with Chrome, and create isolated browser sessions. Supply the base URL as the first argument. The following groups exercise different parts of the game.

- `tests/doors.py`, `tests/landmarks.py` and `tests/district.py` exercise the four repairs, including saved door angles, the downtown garage and both model detail levels.
- `tests/world-tour.py` samples the map, repeats controls and save/load, and measures rendered frames at Foundry Row. Each preset sample lasts at least 3.5 seconds after a warm-up.
- `tests/check_game.py`, `tests/check_field.py`, `tests/phase1.py`, `tests/phase1b.py`, `tests/activities.py`, `tests/audio.py` and `tests/branding.py` cover the browser interface, controls and existing game features.
- The Node checks are `tests/drive-county.mjs`, `tests/collision.mjs`, `tests/terrain-seams.mjs`, `tests/fleet-traffic.mjs` and `tests/people.mjs`. Bundle with esbuild for Node with the repository's vendored Three.js module aliased to `three`. Pass the repository root to the bundled people test so it can read the rig assets.
- `build_offline.py` produces the playable single-file release. The door, landmark, district and campaign/UI browser checks also take its file URL.

## Coverage limits

The routes used automated Chrome input, scripted controller steps and staged starts. Each sampled stop included a short movement check. Ground between grid points, individual tree trunks, every wall face, every camera direction and every possible traffic encounter remain outside exhaustive coverage. The game contains a harbor bridge and an open parking structure. No authored tunnel was found. Mobile viewport checks covered the intro and menu. Gameplay performance was measured on one Windows machine. Long-session memory growth and intermittent texture delays on other networks or GPUs remain unverified.

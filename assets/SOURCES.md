# Art and technology credits

## Environment photography

The following Poly Haven assets are distributed under CC0. The game includes locally resized and compressed derivatives. Compatible desktop GPUs use BC1 versions of selected surfaces. [Poly Haven license](https://polyhaven.com/license)

| Local surface | Original |
| --- | --- |
| Asphalt | [Asphalt 04](https://polyhaven.com/a/asphalt_04) |
| Lawns and meadows | [Grass Ground](https://polyhaven.com/a/grass_ground), [Leafy Grass](https://polyhaven.com/a/leafy_grass) |
| Brick walls | [Red Brick 03](https://polyhaven.com/a/red_brick_03) |
| Shingles | [Grey Roof 01](https://polyhaven.com/a/grey_roof_01) |
| Trail and loose gravel | [Brown Mud Rocks 01](https://polyhaven.com/a/brown_mud_rocks_01), [Gravel Floor](https://polyhaven.com/a/gravel_floor) |
| Exposed terrain rock | [Rock Face](https://polyhaven.com/a/rock_face) |
| Boulders, scanned geometry and surface maps | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01), [Mossy Rock](https://polyhaven.com/a/mossy_rock) |
| Paving | [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) |
| Timber | [Weathered Planks](https://polyhaven.com/a/weathered_planks) |
| Daylight sky | [Kloofendal 48d Partly Cloudy (Pure Sky), Greg Zaal and Jarod Guest](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) |
| Environment reflections | [Kloofendal 48d Partly Cloudy, Greg Zaal](https://polyhaven.com/a/kloofendal_48d_partly_cloudy) |
| Broadleaf tree silhouettes | [Tree Small 02](https://polyhaven.com/a/tree_small_02) |
| Fir tree silhouettes | [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) |

The foliage cutouts are orthographic renders of the two CC0 tree meshes. The original facade and night-window textures, neighborhood layouts, storefront shells, wildlife, terrain and signage were created for this game. Environmental audio, interaction sounds and vehicle engines use Web Audio synthesis.

## Foundry Row and city art

The catalog identifies the following tevy assets as CC0. The game uses local derivatives of its glTF files. Geometry is combined by material and compressed for transfer. Textures have mipmaps at runtime. [tevy catalog and license](https://tevy.dev/) · [Model records and original file hashes](https://tevy.dev/models.json)

| Use | Source model IDs |
| --- | --- |
| Buildings | apartment-block, office-tower, parking-garage, red-cottage |
| Store and restaurant | a-frame-chalkboard-sign, grocery-shelf-run, restaurant-booth-double, bentwood-cafe-chair, four-seat-restaurant-table |
| Sales floor | office-desk, potted-houseplant |
| Streets | parking-meter, street-gully-grate, fire-hydrant |
| Ground cover | grass-clump, bracken-fern |

The meadow uses aerial ground photography. The city uses the normal, roughness and occlusion channels from the same scans as its asphalt, brick and concrete color maps. [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) · [Poly Haven asset license](https://polyhaven.com/license)

## Menu artwork

The built-in image generation tool produced the original menu artwork in **assets/menu.webp**. It is displayed on the title screen. The playable world renders live in Three.js.

**Final generation prompt**

> Use case: photorealistic-natural. A wide 16:9 cinematic title-screen key art photograph for a premium grounded Pacific Northwest open-world road adventure, NO TEXT NO GRAPHICS. Composition: the left third is thick shadowed evergreens and subdued dark roadside asphalt, reserved for overlaid light title. Main subject on right: a subtly dusty burnished burnt-orange 1980s boxy four-wheel-drive SUV viewed from rear three-quarter, large, attractive, full vehicle visible, facing away towards a winding damp two-lane yellow-striped mountain highway, iconic square taillights, roof rack with small duffel and spare gear, believable tire tread, no logos. Parked near turnout. Beyond it, on right and upper middle, immense layers of lush pine-covered peaks and a sharp snowy Cascade summit in atmospheric mist; weather breaking, soft pale golden sidelight and a streak of low cloud. Forest-green shadows, cream mist, copper and ochre highlights. Cool film photography, natural highlight rolloff, warm sun-kissed edge on orange car paint, wonder and solitude. A real mountain roadside at dawn. No people, no letters, no labels, no copyright marks. Wide landscape, editorial travel photography.

## Software and typefaces

Three.js r170 is distributed under the MIT License. The full notice is in **vendor/THREE-LICENSE.txt**. [Three.js](https://threejs.org/)

Barlow Condensed and DM Sans are embedded locally under the SIL Open Font License. Notices accompany the fonts in **assets/fonts**. [Barlow](https://github.com/jpt/barlow) · [DM Sans](https://github.com/googlefonts/dm-fonts)


Phase 1 uses the CC0 Tree Small 02 leaf atlas and Fir Tree 01 twig and bark atlases on original instanced 3D geometry. The additional ground albedo and OpenGL normal maps are local derivatives of Leafy Grass and Rock Face, linked above.

The Phase 1B gravel surface is an original, seamless procedural aggregate texture. The terrain shader blends it with the existing grass, dirt and rock assets.

Phase 1C replaces the procedural gravel and the earlier trail surface with the scans listed above. The ground relief maps pack OpenGL normal X/Y and measured roughness into RGB. The boulder relief layer packs scanned displacement into the colour map's alpha channel. Stone meshes 01, 03 and 04 share the original scan atlas. Each has a 380-triangle close version and a 68-triangle distant version.

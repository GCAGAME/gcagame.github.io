# Vehicle art

The five close vehicle models and their distant counterparts derive from the following version 1 glTF assets by tevy. The source catalog distributes these assets under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

| GCA vehicle | Source model | Close triangles | Distant triangles |
| --- | --- | ---: | ---: |
| Meridian S4 | [Family Sedan](https://tevy.dev/models/family-sedan) | 22,302 | 1,299 |
| Boreal Touring | [SUV](https://tevy.dev/models/suv) | 9,322 | 763 |
| Veloce GT | [Supercar](https://tevy.dev/models/supercar) | 23,145 | 1,300 |
| Range C150 | [Pickup Truck](https://tevy.dev/models/pickup-truck) | 10,027 | 819 |
| Ridgeway 4×4 | [Offroad 4×4](https://tevy.dev/models/offroad-4x4) | 20,120 | 1,297 |

The source GLBs were decoded, reoriented, fitted to the existing vehicle dimensions, simplified and batched for the offline game. Wheel pivots, the three modeled driver-door hinges and available steering-column pivots follow the source hierarchy. Material colors, roughness and metalness derive from the source materials. Small texture and occlusion details are sampled into vertex colors for the batched fleet. The expedition 4×4 retains its body color, normal and roughness atlases. Paint masks, working light responses and graphite wheel finishes were adapted for gameplay.

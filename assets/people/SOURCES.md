# Grand City Adventures residents

The four civilian adults and their skeletal motion are adapted from the Microsoft Rocketbox Avatar Library, copyright 2020 Microsoft, licensed under the MIT License. The original rig and skin weights include individually modeled fingers, facial geometry, separate clothing and skin textures, and opacity-mapped hair. [Library at the version used](https://github.com/microsoft/Microsoft-Rocketbox/tree/0943055db6ec570bcef9f2c8b41c9e5467c808f9) · [License](LICENSE.md)

| Game asset | Original adult |
| --- | --- |
| Trail jacket (player and residents) | Male_Adult_07 |
| Rose shirt | Female_Adult_01 |
| Denim jacket | Male_Adult_12 |
| Linen shirt | Female_Adult_14 |

Adaptations include FBX-to-glTF conversion, an indexed lower-detail mesh, resampled motion tracks, WebP color and normal maps, roughness derived from the original specular textures, and foot cadence derived from the source's travel distance. All four GLBs contain both geometry levels and their own animation set. The character loader streams the first required instance of each style, then shares textures and geometry across additional residents.

The motion takes use the male and female versions of idle_neutral_01, idle_look_around_01, walk_neutral_01, run_neutral_01, crouch_idle, sit_chair_idle_neutral_01, sit_down_chair_left, sit_stand_up_chair_left, turn_left_90 and turn_right_90. Vehicle transfers adapt the library's chair motion to the driver's seat. Face and finger geometry is included, with body motion and hand animation. Dialogue currently uses text.

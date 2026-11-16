# Canopy tent calibration

The production definition remains empty deliberately: verified physical dimensions and UV calibration were not supplied. Do not replace them with nominal tent dimensions or synthetic UV values.

Required variants: `5x5`, `6.5x6.5`, `8x8`. Each needs all eight sections: roof-front/back/left/right and valance-front/back/left/right.

Target node `fabric`, material `fabric_Mat` by name, never primitive index. Leave `Inner_fabric` unchanged. Frame nodes `leg` and `mechanism` use `Metal_mat`. Preserve outer normal and roughness maps.

Each variant requires measured centimeter dimensions, normalized printable polygon, UV rectangle and oriented UV corners. The 8x8 atlas differs from the other sizes. Preview atlas is 2048 square and is not a print master. All synthetic fixtures belong in tests.

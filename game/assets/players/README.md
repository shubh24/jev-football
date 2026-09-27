# Player asset

`footballer.glb` is a football-kit derivative of **Superhero_Male_FullBody** and **Hair_Buzzed** from Quaternius Universal Base Characters, Standard edition.

- Publisher: https://quaternius.com/packs/universalbasecharacters.html
- Download: https://quaternius.itch.io/universal-base-characters
- Licence: CC0 1.0 Universal. The publisher's licence text is in `LICENSE-Quaternius.txt`.
- The free Standard pack was downloaded on 19 September 2026. No paid assets were used.
- The model is a generic person. It is not a likeness of the named footballers.

Preparation adds material regions and clean cuts for the jersey, shorts, socks, and boots. It adds shirt UV coordinates, retains the source skin weights, attaches hair to the head, and limits texture dimensions to 1024 pixels. The runtime replaces boot geometry and applies team colours. Both goalkeeper gloves and the existing shirt labels remain separate meshes.

To rebuild with Blender, extract the Standard ZIP, then run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/prepare-footballer.py -- '/path/to/Universal Base Characters[Standard]' '/absolute/path/to/assets/players/footballer.glb'
```

The preparation script fixes missing image filename aliases in the extracted source. Use a working copy of that source directory.

Three.js `GLTFLoader` loads the local file once. `SkeletonUtils.clone` gives each player an independent skeleton. The game maps its joint poses to the imported bones. Running motion is procedural, not motion capture. It follows player speed and simulation time. Goalkeepers retain the shared collision pose. Penalty mode retains its existing player renderer.

The current kit uses the base body surface. Dedicated cloth geometry, more body types, face variation, and motion capture remain possible later upgrades.

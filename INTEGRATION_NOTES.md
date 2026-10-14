# Integrationsanteckningar

## Arkitektur i korthet

- **Sidor:** `index.html` (labbet), `island/index.html` (Azshara Island) och `gallery/index.html` (tillgångsgalleri). Alla byggs av Vite (`vite.config.js`, `build.rollupOptions.input`).
- **Ön** (`src/island/`): `terrain.js` (höjdfält, vertexfärger, terrängtextur med höjd/gräs/skog/sand i RGBA), `vegetation.js` (procedurella träd med mera, instansierade i rutor om 64 m, vindpatch), `sky.js`, `water.js`, `weather.js`, `props.js`, `player.js` (hjälte och WoW-styrning), `post.js`, `main.js` (delade uniforms i `globals`, ljus och loop).
- **Tillgångar** (`src/assets/loader.js`): laddningskedjan för importerade glTF-modeller och texturer.

## Mappstruktur

```
public/assets/              runtime-filer, kopieras oförändrade till bygget
  manifest.json             register över importerade modeller och texturer
  models/nature/{trees,bushes,grass,rocks,mushrooms}/
  models/architecture/{buildings,ruins,modular}/
  models/props/{furniture,containers,decorations}/
  textures/{terrain,foliage,bark,stone,architecture}/
  previews/
assets/source/              originalarkiv (checkas inte in, se .gitignore)
assets/licenses/            licenstexter (checkas in)
public/decoders/            Draco- och Basis-avkodare (genereras av scripts/copy-decoders.mjs)
```

Byggets egna JS- och CSS-filer hamnar i `dist/static/`, så att de inte blandas med `dist/assets/`.

Originalarkiven hålls utanför git. Runtime-filerna (optimerade GLB och KTX2) checkas in om de är små. Git LFS finns i miljön men används inte i repot än. Det är värt att slå på (`git lfs track "*.glb" "*.ktx2"`) om runtime-filerna sammanlagt blir mer än några tiotal MB.

## Laddningskedjan

`createAssetLoader(renderer)` i `src/assets/loader.js` ger:

- `GLTFLoader` med `DRACOLoader`, `KTX2Loader` och `MeshoptDecoder`, som följer med three (r186). Inga nya beroenden.
- En cache per fil: varje `loadModel()` ger en klon som delar geometri och material.
- `stylize()` behåller de författade materialen men sätter grovhet till minst 0,65, metallness till högst 0,1 och normalskala 0,6. Löv- och gräsmaterial (namn som matchar `leaf|foliage|grass|fern`) får `alphaTest` 0,5 och `DoubleSide`, och sorteras inte som genomskinliga.
- `loadTexture()` sätter sRGB på färgtexturer och linjärt på datatexturer, repetition och anisotropi 8.
- `modelStats()` ger trianglar, vertexar, mesher, material, texturer och bounding box.
- `toInstanced(root, matrices)` gör om en modell till `InstancedMesh`, en per delmesh.
- `addWindWeights(root)` lägger till attributet `aWind` (0 vid roten och 1 i toppen, fladder på lövmaterial), så att vindpatchen `patchFoliage()` i `vegetation.js` fungerar på importerad vegetation.

Sökvägar räknas från sajtens rot, eftersom `BASE_URL` är `./` för GitHub Pages och inte fungerar från sidor i undermappar.

## Manifestet

```json
{
  "models": [
    {
      "id": "qn-tree-oak-1",
      "name": "Ek 1",
      "category": "nature/trees",
      "file": "models/nature/trees/qn_oak_1.glb",
      "creator": "Quaternius",
      "source": "https://quaternius.itch.io/stylized-nature-megakit",
      "license": "CC0 1.0 (verifierad ÅÅÅÅ-MM-DD)",
      "attribution": null,
      "originalFormat": "glTF",
      "convertedFormat": "GLB, Meshopt, KTX2",
      "intendedUse": "Sommarskog",
      "scale": 1,
      "material": { "minRoughness": 0.7 },
      "autumn": { "pattern": "leaf|leaves", "color": "#d9822b", "amount": 0.75 }
    }
  ],
  "textures": [
    { "id": "grass-summer", "file": "textures/terrain/grass_summer.ktx2", "kind": "color" }
  ]
}
```

En modell som läggs i manifestet syns direkt i galleriet under "Importerat".

## Konvertering och optimering

Verktyget är `@gltf-transform/cli`. Det körs med `npx` när det behövs och är inget beroende i projektet:

```sh
# FBX → glTF görs först i Blender (Arkiv → Exportera → glTF 2.0, +Y upp, tillämpa transformer)
npx @gltf-transform/cli optimize in.glb out.glb \
  --compress meshopt --texture-compress ktx2 --texture-size 1024
npx @gltf-transform/cli inspect out.glb   # kontrollera trianglar, texturer, minne
```

- **Meshopt** föredras framför Draco för vegetation, eftersom avkodningen är snabbare och den är kompatibel med instansiering.
- **KTX2 (UASTC för normalkartor, ETC1S för albedo)** sparar GPU-minne.
- **Skala och orientering** normaliseras bara om det behövs: +Y upp, 1 enhet = 1 m, pivot vid marken i stammens mitt.

## Prestandabudget (riktvärden för läget Hög)

| Område | Budget |
| --- | --- |
| Träd (en instans) | 1 500–4 000 trianglar nära, enklare variant på avstånd |
| Sten | 100–800 trianglar |
| Trianglar per bildruta, alla pass | under 5 M |
| Texturer per biom | högst cirka 8 st om 1024², i KTX2 |
| Draw calls | under 600 |

Mätaren nere till vänster på ön visar fps, ms och trianglar summerat över alla pass.

## Galleriet

`/gallery/` är ett utvecklarverktyg som inte påverkar spelet. Det har:

- kategorier i en lista
- orbit-kamera
- bounding box med mått i meter
- statistik över trianglar, vertexar, mesher, material och texturer
- materiallista med färgrutor och texturminiatyrer
- ljuslägena Dag, Gyllene timme, Mulet och Natt
- Sommar och Höst
- Hela kategorin, som ställer upp alla modeller sida vid sida
- Vind, som testar vindpatchen

## Styrning (WoW-stil)

Styrningen finns i `createInput()` i `src/island/player.js`:

| Inmatning | Effekt |
| --- | --- |
| Höger musknapp + dra | styr hjälten, som vänder sig efter kameran |
| Vänster musknapp + dra | fri mouselook |
| Båda musknapparna | spring framåt |
| A/D | sväng; med höger musknapp nedtryckt blir det strafe |
| Q/E | strafe |
| W/S | framåt/bakåt (bakåt går långsammare) |
| Shift | gå i stället för att springa |
| Space | hoppa |
| Scroll | zoom |

På pekskärm vrider ett drag kameran, och joysticken går relativt kameran.

## Kvar att göra när tillgångarna finns

1. Ladda ner arkiven manuellt, verifiera licenserna och fyll i `ASSET_LICENSES.md`.
2. Konvertera och optimera enligt ovan och registrera i manifestet.
3. Granska i galleriet: skala, silhuett, färg mot `ART_DIRECTION.md` och trianglar.
4. Ön: ladda valda modeller i `createVegetation()` och använd `toInstanced` och `addWindWeights` med samma placering i rutor som idag.
5. Terräng: lägg till texturer (gräs och jord först) i terrängmaterialet, blandade med de befintliga maskerna, med makrovariation och triplanar mappning bara på branta klippor.

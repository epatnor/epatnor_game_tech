# Tillgångskatalog

Katalogen över tillgångar som är planerade eller importerade. Licensstatus finns i `ASSET_LICENSES.md`, och tekniken för import i `INTEGRATION_NOTES.md`.

## Importerade

Inga än. Byggmiljön kunde inte ladda ner något (se `ASSET_LICENSES.md`). Galleriet (`/gallery/`) visar i stället öns befintliga procedurella modeller: lövträd (fyra varianter, varav en höstvariant), palmer, granar, buskar, stenar och hjälten.

## Planerade, i prioritetsordning

| Prio | Tillgång | Källa | Avsedd användning | Original | Runtime | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Stylized Nature MegaKit | Quaternius | 3+ trädvarianter, buskar, stenar, gräs, svampar för sommar- och höstskog | glTF/FBX/OBJ (enligt sidan) | GLB (Meshopt + KTX2) | Manuell nedladdning krävs |
| 2 | KayKit Forest Nature Pack | Kay Lousberg | Kompletterande träd och stenar, förtrollad skog | glTF/FBX | GLB | Manuell nedladdning krävs |
| 3 | Hand-Painted Terrain Textures | Voxel Core Lab | Gräs, jord, sand, sten för terrängen | PNG | KTX2 eller WebP | Manuell nedladdning, licens okänd |
| 4 | Stylized Nature Textures | oleekconder | Mossa, skogsbotten, bark | PNG | KTX2 eller WebP | Manuell nedladdning, licens okänd |
| 5 | Fantasy Props MegaKit | Quaternius | Tunnor, lådor, lyktor och skyltar i lägret | glTF/FBX | GLB | Manuell nedladdning krävs |
| 6 | Goblin Camp | ByndWalker | Tält och palissad för ett läger | ? | GLB | Licens okänd |
| 7 | Tree House Modular Set | Quin.GS | Byggnader i skogsbyn | ? | GLB | Licens okänd |
| 8 | Handpainted Stone | OpenGameArt | Klippor och murar | PNG | KTX2 eller WebP | Licens okänd |

Alla itch.io-paket laddas ner via knappen på respektive sida, eventuellt efter steget "No thanks, just take me to the downloads". Filnamnet är det som visas på nedladdningssidan. Spara arkivet oförändrat i `assets/source/<källa>/`.

## Första integrationen i ön (när tillgångarna finns)

- Tre eller fler trädvarianter ersätter eller kompletterar de procedurella lövträden i sommar- och höstskogen.
- Flera stenar och stenblock kompletterar de procedurella stenarna.
- Buskar och grästuvor placeras med samma placeringssystem (`sample()` i `src/island/vegetation.js`).
- Minst två terrängmaterial, gräs och stig/jord, blandas med de befintliga maskerna i terrängtexturen.
- Några föremål i lägret: tunnor, lådor och en lykta.

# Animerade karaktärer

Status och utvärdering av ett återanvändbart karaktärssystem för Azshara Island. Spelarens nuvarande styrning och spelmekanik är **inte ändrade**. Det sker först när förhandsgalleriet är godkänt.

## Vad som finns

| Del | Fil | Innehåll |
| --- | --- | --- |
| Testkaraktär | `src/characters/hero.js` | Procedurell, skinnad karaktär med 17 ben och ett material med vertexfärger (ett draw call för kroppen). Sju klipp: Idle, Walk, Run, Attack, Hit, Death, Spellcast. Färgpaletter för Krigare, Magiker och Jägare. |
| Utbytbara delar | `src/characters/hero.js` | Skinnade: tre frisyrer, mantel, axelskydd. Stela: svärd, yxa, stav, sköld, hjälm, trollkarlshatt. |
| Kontroller | `src/characters/controller.js` | `CharacterController` med `AnimationMixer`, övertoningar, fassynkade gångarter, stå/gå/spring efter fart, engångsklipp som återgår, död och återupplivning, socklar för stela tillbehör (`attach`) och skinnade delar som binds om efter bennamn (`setPart`). |
| Retargeting | `src/characters/retarget.js` | `renameClip` (byter bara namn) och `retargetClip` (bygger på `SkeletonUtils.retargetClip`, skalar höftens förflyttning efter höjdkvoten). |
| Galleri | `/characters/` | Karaktärsval, animationsval, rörelsefart, uppspelningshastighet, övertoningstid, utrustning, skelettvisning, orbit-kamera och GLB-rundtur. |

Testkaraktären är vår egen, så det finns ingen licensfråga. Den finns för att systemet ska gå att prova fullt ut innan de externa paketen kan laddas ner.

### Verifierat i headless Chromium

- Run och Attack roterar benen, och Attack återgår automatiskt till Run.
- **Retargeting:** "Jätten" har Mixamo-liknande bennamn (`mixamorig_LeftUpLeg` …) och andra proportioner. Den får alla sju klippen retargetade från standardskelettet, på cirka 20–40 ms, och de spelas korrekt.
- **GLB-rundtur:** karaktären exporteras med `GLTFExporter` och laddas tillbaka med `GLTFLoader`. Skelett, skinning och alla klipp överlever, och utrustningen fästs på de inlästa benen efter namn.
- Inga konsolfel.

## Utvärdering av de externa paketen

> Inget av paketen kunde laddas ner eller licensgranskas. Byggmiljöns nätverksregler blockerar itch.io. Uppgifterna nedan bygger på tidigare kunskap och är **inte verifierade**.

| Paket | Förväntat innehåll | Senast kända licens | Lämplighet |
| --- | --- | --- | --- |
| Quaternius – Universal Base Characters | Basfigurer med gemensam humanoid rigg, glTF/FBX | Oklart: CC0 eller Quaternius Asset License (QAL), se nedan | Bra bas för modulära kläder om riggen delas med outfits och animationsbiblioteket |
| Quaternius – Modular Fantasy Outfits | Skinnade klädesplagg mot samma rigg som basfigurerna | Oklart, som ovan | Passar `setPart()` direkt om bennamnen matchar |
| Quaternius – Universal Animation Library 2 | Stort bibliotek med klipp mot den universella riggen | Oklart, som ovan | Täcker troligen alla sju klippen, inklusive Spellcast |
| KayKit – Adventurers | Färdiga äventyrare med vapen, egen rigg | CC0 (troligen) | Mycket nära den önskade stilen, vapen fästs i handben |
| KayKit – Character Animations | Klipp för KayKits rigg | CC0 (troligen) | Fungerar med Adventurers direkt; mot Quaternius-riggen krävs retargeting |

### QAL eller CC0

Detta måste kontrolleras **per paket** i både texten på itch.io och licensfilen i zip-arkivet, eftersom de kan skilja sig åt. Om ett paket står under en licens som tillåter användning i spel men **förbjuder vidaredistribution av själva tillgångarna** (vilket en egen tillgångslicens ofta gör), gäller:

- Filerna får **inte** checkas in i det här publika repot. GitHub Pages skulle då göra dem fritt nedladdningsbara.
- Använd i stället de lokala platserna som git ignorerar: `public/assets/local/` och `public/assets/manifest.local.json`. Galleriet läser det lokala manifestet om det finns, och bygget i CI tar aldrig med dem.
- För en publik demo med sådana tillgångar krävs ett privat repo, eller ett bygge som hämtar filerna från en privat lagring. Det tar vi ställning till när licensen är känd.

CC0-paket (troligen KayKit) kan checkas in som optimerade GLB-filer.

### Retargeting mellan paketen

- **Samma rigg (KayKit Adventurers och KayKit Animations, Quaternius-paketen sinsemellan):** ingen retargeting behövs. Klippen spelas direkt, eller med `renameClip` om bara prefix skiljer.
- **Olika riggar (KayKit-klipp på Quaternius-figurer eller tvärtom):** `retargetClip` med en namnmappning `{ målben: källben }`. Viloposerna måste vara lika: skiljer de, som T-pose mot A-pose, behövs `localOffsets` per ben, eller så sätts båda i samma pose före sampling. Höftens förflyttning skalas efter höjdkvoten.
- Retargeting görs **en gång vid laddning**. Klippen kan sparas till GLB med `GLTFExporter`, som i rundturen, så att det inte behöver göras vid körning.

## Optimering för spel

- **Kroppen** är en `SkinnedMesh` med ett material. Utrustning delar material där det går.
- **Flera instanser:** klona med `SkeletonUtils.clone()`, som delar geometri och material, och använd en `AnimationMixer` per karaktär.
- **Animations-LOD:** karaktärer långt bort uppdaterar mixern mer sällan (t.ex. var tredje bildruta) och kastar inga skuggor. Det är inte implementerat än.
- `frustumCulled = false` på skinnade mesher undviker att de försvinner när de rör sig. För folkmassor är det bättre att ge varje karaktär en egen bounding sphere.
- **Klipp med Meshopt-komprimering** via `@gltf-transform/cli` (se `INTEGRATION_NOTES.md`). Rundturens GLB (cirka 0,8 MB för jätten) är okomprimerad och samplad i 30 fps.

## Nästa steg

1. **Du:** godkänn förhandsgalleriet, eller säg vad som ska ändras.
2. Ladda ner ett paket manuellt, i första hand KayKit Adventurers och Character Animations eftersom de troligen är CC0. Lägg det i `assets/source/kaykit/`, så verifierar jag licensen i filen.
3. Lägg in en riktig karaktär i galleriet via manifestet (`characters`), mappa klippnamnen (`DEFAULT_ALIASES` i `controller.js`) och prova utrustningen på dess ben.
4. Efter godkännande: byt hjälten på ön mot `CharacterController` och koppla rörelsefart, attack och träff till spelet.

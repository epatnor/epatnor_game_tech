# Tillgångslicenser

> **Uppdatering 2026-10-14:** tre KayKit-paket är nedladdade manuellt och licensgranskade. Alla tre är **CC0 1.0** enligt `License.txt` i respektive arkiv. Licenstexterna finns i `assets/licenses/`. Övriga källor nedan är fortfarande overifierade.
>
> **Ursprunglig status:** inga externa tillgångar är importerade än. Byggmiljön kunde inte nå någon av källorna (itch.io, kenney.nl, opengameart.org, poly.pizza m.fl.), eftersom miljöns nätverksregler blockerar dem. Därför har **ingen licens verifierats i dag**. Varje licens måste kontrolleras på källsidan innan tillgången läggs i `public/assets/manifest.json`.

## Regler

- Endast tillgångar som är **gratis att använda i spel, även kommersiellt**. CC0 föredras.
- Kontrollera **varje tillgångs aktuella licens** på källsidan. Anta inte att alla Quaternius-paket fortfarande är CC0.
- Spara licenstexten i `assets/licenses/<tillgång>.txt` och originalarkivet i `assets/source/` (som inte checkas in).
- Inga köp, och inga sätt att kringgå betalväggar, inloggning eller nedladdningsspärrar.
- Distribuera inte fristående tillgångar när licensen förbjuder det. Projektet publiceras på GitHub Pages, så runtime-filerna blir offentligt nedladdningsbara.

## Källor att verifiera

Kolumnen "Senast kända licens" bygger på tidigare kunskap och är **inte** en verifiering.

| Källa | Länk | Senast kända licens | Verifierad | Attribution |
| --- | --- | --- | --- | --- |
| Quaternius – Stylized Nature MegaKit (Free Standard) | https://quaternius.itch.io/stylized-nature-megakit | CC0 (troligen) | Nej | – |
| Quaternius – Fantasy Props MegaKit (Free Standard) | https://quaternius.itch.io/fantasy-props-megakit | CC0 (troligen) | Nej | – |
| Quin.GS – Tree House Modular Set (Free Set) | https://quin-gs.itch.io/treehouse | Okänd | Nej | ? |
| ByndWalker – Goblin Camp (Free Pack) | https://byndwalker.itch.io/lowpoly-goblin-camp | Okänd | Nej | ? |
| KayKit – Forest Nature Pack | https://kaylousberg.itch.io/kaykit-forest | CC0 (troligen) | Nej | – |
| Kenney | https://kenney.nl/assets | CC0 (troligen) | Nej | – |
| OpenGameArt | https://opengameart.org/ | Varierar per tillgång | Nej | Per tillgång |
| Poly Pizza | https://poly.pizza/ | Varierar per modell (CC0 eller CC-BY) | Nej | CC-BY kräver attribution |
| Voxel Core Lab – Hand-Painted Terrain Textures | https://voxelcorelab.itch.io/watercolor-terrain-textures | Okänd | Nej | ? |
| Stylized Nature Textures | https://oleekconder.itch.io/stylized-nature-textures | Okänd | Nej | ? |
| Kalponic Studio – Painterly Textures Vol. 2 (Free Edition) | https://kalponic-studio.itch.io/painterly-textures-vol-2 | Okänd | Nej | ? |
| OpenGameArt – Handpainted Stone | https://opengameart.org/content/handpainted-stone-texture | Okänd | Nej | ? |
| Poly Haven | https://polyhaven.com/textures | CC0 (troligen) | Nej | – |
| ambientCG | https://ambientcg.com/ | CC0 (troligen) | Nej | – |

Poly Haven och ambientCG är främst fotorealistiska. Enligt `ART_DIRECTION.md` ska de bara användas som underlag, till exempel som höjd- eller maskkartor, och inte som synliga albedotexturer.

## Importerade tillgångar

| Tillgång | Skapare | Källa | Licens | Verifierad | Attribution | Licensfil |
| --- | --- | --- | --- | --- | --- | --- |
| KayKit Skeletons 1.1 (FREE): fyra karaktärer, Rig_Medium-animationer (General, MovementBasic), vapen | Kay Lousberg | https://kaylousberg.itch.io/kaykit-skeletons | CC0 1.0 | 2026-10-14, License.txt i arkivet | Frivillig ("Kay Lousberg, www.kaylousberg.com") | `assets/licenses/KayKit_Skeletons_1.1_License.txt` |
| KayKit Forest Nature Pack 1.0 (FREE) | Kay Lousberg | https://kaylousberg.itch.io/kaykit-forest | CC0 1.0 | 2026-10-14, License.txt i arkivet | Frivillig | `assets/licenses/KayKit_Forest_Nature_Pack_1.0_License.txt` |
| KayKit RPG Tools Bits 1.0 (FREE) | Kay Lousberg | https://kaylousberg.itch.io/ | CC0 1.0 | 2026-10-14, License.txt i arkivet | Frivillig | `assets/licenses/KayKit_RPGToolsBits_1.0_License.txt` |

| KayKit Adventurers 2.0 (FREE): sex hjältar och vapen | Kay Lousberg | https://kaylousberg.itch.io/kaykit-adventurers | CC0 1.0 | 2026-10-14, License.txt i arkivet | Frivillig | `assets/licenses/KayKit_Adventurers_2.0_License.txt` |
| KayKit Character Animations 1.1: Rig_Medium General, MovementBasic, CombatMelee, Special | Kay Lousberg | https://kaylousberg.itch.io/kaykit-character-animations | CC0 1.0 | 2026-10-14, License.txt i arkivet | Frivillig | `assets/licenses/KayKit_Character_Animations_1.1_License.txt` |
| Quaternius Universal Animation Library (Standard) | Quaternius | https://quaternius.itch.io/universal-animation-library | **CC0 1.0** (inte QAL) | 2026-10-14, License.txt i arkivet | Frivillig | `assets/licenses/Quaternius_Universal_Animation_Library_Standard_License.txt` |

Eftersom de är CC0 får de ligga i det publika repot och publiceras på GitHub Pages. Forest Nature och RPG Tools Bits är granskade men inte importerade till runtime än.

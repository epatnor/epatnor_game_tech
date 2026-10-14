# Art direction – Azshara Island

Målet är en polerad, stiliserad fantasyvärld någonstans mellan **KayKit** och miljökonsten i **klassiska World of Warcraft**: handgjord, målerisk och lite lekfull högfantasy. Den ska inte se ut som en generisk low-poly-prototyp.

## Formspråk

- **Organiska silhuetter** med lätt överdrivna proportioner: tjocka stammar som smalnar av, svällande trädkronor, rundade stenblock.
- **Mer geometri än enkla primitiver** där silhuetten syns, som stammar, kronkanter och klippkanter. Platta, synliga polygonytor får inte vara den dominerande stilen.
- **Läsbarhet först:** stora, tydliga former på medelavstånd och en dämpad detaljnivå på nära håll.

## Färg och palett

Varma högdagrar och kalla skuggor. Mättade men harmoniska färger, inga neonfärger.

| Roll | Färg | Används till |
| --- | --- | --- |
| Sommargrönt ljust | `#9ccf55` | gräsets toppar, solbelysta kronor |
| Sommargrönt bas | `#5fae3c` | gräs, lövverk |
| Djupgrönt | `#2f6a22` | gräsrötter, skuggsidor |
| Höstockra | `#e0a030` | höstlöv |
| Höstrött | `#c8502a` | höstlöv, bär |
| Sand | `#f0dcaa` | strand |
| Jord/stig | `#b48d5c` | stigar, trä |
| Bark | `#6b4a30` | stammar, timmer |
| Kall sten | `#8d8a8f` | klippor, stenblock |
| Varm sten | `#a08470` | solbelysta klippor |
| Mossa | `#5c8a38` | ovansidor på sten |
| Förtrollad teal | `#2f8f86` | skuggor och accenter i den förtrollade skogen |
| Magisk accent | `#6ee7ff` | kristaller, glöd |

## Material

- `MeshStandardMaterial` med **grovhet 0,65 eller mer** och **metallness nära 0** för naturmaterial. Laddaren (`src/assets/loader.js`) gör detta automatiskt.
- **Målade albedotexturer** med breda penseldrag. Ingen fotorealism och inga starka procedurella mönster.
- **Normalkartor dämpas** (skala 0,6 som standard). Formen ska komma från geometri och målning, inte från mikrodetaljer.
- **Löv och gräskort** använder `alphaTest` (0,5), aldrig genomskinlighet med sortering.
- **Genomlysning (SSS)** på bladverk via vegetationspatchen (`patchFoliage`) ger det varma motljuset.

## Biomer

1. **Sommarskog:** livfulla gröna toner och varmt solljus. Ljusa gläntor med blommor.
2. **Höstskog:** ockra, bärnsten, rött och guld. Lägre solvinkel ser bäst ut.
3. **Förtrollad skog:** djupare gröna toner, teal i skuggorna och sparsamma magiska accenter (svampar och kristaller med svag glöd).
4. **Klippiga högländer:** kall grå sten med mossa på ovansidor, glesa granar och lite snö på topparna.
5. **Medeltida skogsby:** timmerhus, jordstigar och varmt ljus från fönster och lägereldar.

## Anpassa tillgångar från olika källor

- Justera **färgen i materialet** (lerp mot paletten) i stället för att lägga globala filter över hela bilden.
- Behåll författade texturer. Tona hellre än att ersätta.
- Skala till **verklig storlek**: en människa är cirka 1,7 m, ett lövträd 6–10 m och en dörr 2 m.
- Blanda inte stilar utan anpassning. En modell som sticker ut för mycket ska bort hellre än in.

## Undvik

Fotorealism, realistiska PBR-material, kraftigt brus och mikrodetaljer, onödigt högupplösta modeller, och platt skuggade primitiver som huvudstil.

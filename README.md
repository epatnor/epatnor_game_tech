# Game Tech Lab

En lekplats för grafikexperiment i [three.js](https://threejs.org/).

**Live:** https://epatnor.github.io/epatnor_game_tech/

## Experiment

| Experiment | Vad det visar |
| --- | --- |
| PBR & skuggor | `MeshStandardMaterial` med varierande metalness/roughness, PMREM-miljöljus, riktat ljus med skuggor |
| Egen shader | `ShaderMaterial` med simplex-brus i vertexshadern, normaler via `dFdx`/`dFdy`, fresnelkant |
| Instancing | Tiotusentals kuber i ett draw call med `InstancedMesh`, animerade per instans |
| Bloom | Efterbehandling med `EffectComposer`, `UnrealBloomPass` och `OutputPass` |

Välj experiment i panelen uppe till vänster, eller länka direkt med `#pbr`, `#shader`, `#instancing` eller `#bloom`. Reglagen uppe till höger (lil-gui) ändrar parametrarna live.

## Kom igång

```sh
npm install
npm run dev      # utvecklingsserver på http://localhost:5173
npm run build    # produktionsbygge till dist/
npm run preview  # servera dist/ lokalt
```

## Lägg till ett experiment

1. Skapa `src/experiments/mitt-experiment.js`:

   ```js
   import * as THREE from 'three';

   export default {
     id: 'mitt',
     title: 'Mitt experiment',
     description: 'Vad experimentet visar.',
     setup({ renderer, scene, camera, controls, gui }) {
       const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
       scene.add(mesh);
       return {
         update(dt, t) { mesh.rotation.y = t; }, // valfri
         // render(), resize(w, h), dispose() är också valfria
       };
     },
   };
   ```

2. Registrera det i `src/experiments/index.js`.

Ramen i `src/main.js` skapar ny scen, kamera, OrbitControls och GUI för varje experiment och städar upp geometrier, material och texturer när man byter.

## Publicering

Varje push till `main` byggs och publiceras på GitHub Pages via `.github/workflows/pages.yml`. Första gången måste Pages aktiveras: **Settings → Pages → Source: GitHub Actions**.

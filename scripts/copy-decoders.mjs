// Kopierar Draco- och Basis/KTX2-avkodarna från three till public/decoders,
// så att GLTFLoader kan ladda komprimerade modeller och texturer. Körs före dev och build.
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const libs = resolve(root, 'node_modules/three/examples/jsm/libs');
const out = resolve(root, 'public/decoders');
mkdirSync(out, { recursive: true });
cpSync(resolve(libs, 'draco/gltf'), resolve(out, 'draco'), { recursive: true });
cpSync(resolve(libs, 'basis'), resolve(out, 'basis'), { recursive: true });
console.log('Avkodare kopierade till public/decoders');

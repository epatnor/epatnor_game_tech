import pbr from './pbr.js';
import shader from './shader.js';
import instancing from './instancing.js';
import bloom from './bloom.js';

// Lägg till nya experiment här. Varje modul exporterar
// { id, title, description, setup(ctx) } där setup kan returnera
// { update(dt, t), render(), resize(w, h), dispose() }.
export const experiments = [pbr, shader, instancing, bloom];

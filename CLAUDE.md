# Game Tech Lab

three.js-lekplats för grafikexperiment (Vite, vanlig JavaScript). Svara på svenska.

- Experiment ligger i `src/experiments/` och registreras i `src/experiments/index.js`. Se README för formatet.
- `main` publiceras automatiskt till https://epatnor.github.io/epatnor_game_tech/ via `.github/workflows/pages.yml`.
- Verifiera ändringar med `npm run build`.

## Skärmdumpar

Skärmdumpar är billiga att ta men dyra för Claude att titta på, eftersom bilderna stannar i kontexten.

- Ta skärmdumpar med `npm run build && npx vite preview --port 4173 &` följt av `node scripts/screenshot.cjs [id ...]`. De hamnar i `screenshots/`, och konsolfel skrivs ut som text.
- **Som standard tittar Claude inte på skärmdumparna** (läs dem inte med Read). Skicka dem till användaren med SendUserFile och låt användaren bedöma utseendet.
- Kontrollera alltid konsolutskriften själv, eftersom den är billig text.
- Titta på en skärmdump bara om användaren ber om det, eller fråga först när det verkligen behövs.

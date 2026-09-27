// Capturas de verificación con Playwright (Chromium) sobre dist/visor.html abierto desde file://.
// Uso: NODE_PATH=$(npm root -g) node scripts/capturas.mjs [--rapido]
// Genera capturas/<viewport>-<tema>-<transportador>-<vista>.png y capturas/informe.json (errores de consola).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rapido = process.argv.includes('--rapido');
const RAIZ = resolve(new URL('..', import.meta.url).pathname);
const URL_VISOR = 'file://' + resolve(RAIZ, 'dist/visor.html');
const SALIDA = resolve(RAIZ, 'capturas');
mkdirSync(SALIDA, { recursive: true });

const VIEWPORTS = [
  { nombre: 'movil-412x915', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { nombre: 'escritorio-1440x900', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];
const TEMAS = ['light', 'dark'];
const TRANSPORTADORES = ['DAT', 'SERT', 'NET', 'VMAT2'];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const informe = { capturas: [], errores: [], avisos: [], tiempos: {} };

for (const vp of VIEWPORTS) {
  for (const tema of TEMAS) {
    const ctx = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor, colorScheme: tema, locale: 'es-MX' });
    const page = await ctx.newPage();
    const errores = [];
    page.on('console', (m) => { if (m.type() === 'error') errores.push(`[console.error] ${m.text()}`); if (m.type() === 'warning') informe.avisos.push(`${vp.nombre}/${tema}: ${m.text()}`); });
    page.on('pageerror', (e) => errores.push(`[pageerror] ${e.message}`));
    const t0 = Date.now();
    await page.goto(URL_VISOR);
    await page.waitForSelector('html[data-listo="1"]', { timeout: 60000 });
    informe.tiempos[`${vp.nombre}/${tema}/carga`] = Date.now() - t0;
    // si el sistema está en oscuro pero se guardó tema, forzamos el del contexto
    await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); document.querySelector('#btn-tema').dispatchEvent(new Event('noop')); }, tema);
    // aplicar tema real vía botón para que 3D lo tome: dos clics si hace falta
    const temaActual = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (temaActual !== tema) await page.click('#btn-tema');

    const captura = async (nombre) => {
      const ruta = resolve(SALIDA, `${vp.nombre}-${tema}-${nombre}.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      await page.screenshot({ path: ruta, fullPage: false });
      informe.capturas.push(ruta);
    };

    for (const tr of TRANSPORTADORES) {
      await page.click(`.transportadores .chip[data-tr="${tr}"]`);
      await page.click('.modos .seg[data-modo="esquema"]');
      await page.waitForTimeout(900);
      await captura(`${tr}-esquema`);
      if (!rapido) {
        // un fármaco inhibidor para ver el modo "fijo"
        const chips = await page.$$('#farmacos-chips .chip');
        if (chips[1]) { await chips[1].click(); await page.waitForTimeout(700); await captura(`${tr}-esquema-farmaco`); }
      }
      await page.click('.modos .seg[data-modo="estructura"]');
      await page.waitForSelector('#cargando.oculto', { timeout: 60000, state: 'attached' });
      const ids = await page.$$eval('#estructuras-chips .chip', (els) => els.map((e) => e.textContent.split(' ')[0]));
      for (let k = 0; k < ids.length; k++) {
        const t1 = Date.now();
        await page.click(`#estructuras-chips .chip:nth-child(${k + 1})`);
        await page.waitForSelector('#cargando.oculto', { timeout: 60000, state: 'attached' });
        await page.waitForTimeout(600);
        informe.tiempos[`${vp.nombre}/${tema}/${ids[k]}`] = Date.now() - t1;
        await captura(`${tr}-${ids[k]}-completa`);
        if (!rapido) {
          await page.click('#btn-sitio');
          await page.waitForTimeout(900);
          await captura(`${tr}-${ids[k]}-sitio`);
          // tocar el primer residuo de la lista
          const fila = await page.$('#contactos .fila');
          if (fila) { await fila.click(); await page.waitForTimeout(700); await captura(`${tr}-${ids[k]}-residuo`); }
        }
      }
      if (!rapido) {
        const t2 = Date.now();
        await page.click('#btn-morph');
        await page.waitForSelector('#cargando.oculto', { timeout: 60000, state: 'attached' });
        await page.waitForTimeout(500);
        informe.tiempos[`${vp.nombre}/${tema}/${tr}/morph`] = Date.now() - t2;
        await page.fill('#morph-t', '50');
        await page.dispatchEvent('#morph-t', 'input');
        await page.waitForTimeout(600);
        await captura(`${tr}-morph-50`);
        await page.click('#btn-morph');
      }
    }
    for (const e of errores) informe.errores.push(`${vp.nombre}/${tema}: ${e}`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(resolve(SALIDA, 'informe.json'), JSON.stringify(informe, null, 1));
console.log(`capturas: ${informe.capturas.length}; errores de consola: ${informe.errores.length}`);
for (const e of informe.errores) console.log('  ' + e);
console.log('tiempos (ms):', JSON.stringify(informe.tiempos));

// Comprueba que dist/visor.html no hace ninguna petición de red (todo incrustado).
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const page = await (await browser.newContext({ offline: true })).newPage();
const peticiones = [];
page.on('request', (r) => { if (!r.url().startsWith('file://')) peticiones.push(r.url()); });
await page.goto('file:///home/user/coqueta-/dist/visor.html');
await page.waitForSelector('html[data-listo="1"]');
await page.click('.modos .seg[data-modo="estructura"]');
await page.waitForSelector('#cargando.oculto', { state: 'attached' });
await page.waitForTimeout(1000);
console.log('peticiones externas:', peticiones.length, peticiones.slice(0, 5));
console.log('fuente cargada:', await page.evaluate(() => document.fonts.check("16px 'Atkinson Hyperlegible'")));
await browser.close();

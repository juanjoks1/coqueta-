import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file:///home/user/coqueta-/dist/visor.html');
await page.waitForSelector('html[data-listo="1"]');
await page.waitForTimeout(800);
console.log(await page.evaluate(() => {
  const c = document.querySelector('#vista-esquema canvas'); const el = document.querySelector('#vista-esquema');
  const anchos = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().width > 400).map((e) => e.tagName + '#' + e.id + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().width)).slice(0, 12);
  return { cont: [el.clientWidth, el.clientHeight], canvasAttr: [c.width, c.height], scrollW: document.documentElement.scrollWidth, anchos };
}));
await browser.close();

const { chromium } = require('playwright');

(async () => {
  console.log("Iniciando navegador...");
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log("Abriendo SICOP...");
  await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
    waitUntil: "networkidle"
  });

  console.log("Esperando que Angular cargue...");
  await page.waitForTimeout(5000);

  console.log("Título de la página:", await page.title());

  await browser.close();
  console.log("Scraper finalizado.");
})();

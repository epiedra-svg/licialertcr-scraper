const { chromium } = require('playwright');

(async () => {
  console.log("Iniciando navegador...");
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log("Abriendo SICOP...");
  await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
    waitUntil: "networkidle"
  });

  console.log("Esperando que Angular cargue la tabla...");
  await page.waitForTimeout(6000); // Espera 6 segundos para que Angular renderice

  // Selector de la tabla
  const rowSelector = "table tbody tr";

  console.log("Buscando la primera fila...");
  const firstRow = await page.$(rowSelector);

  if (!firstRow) {
    console.log("❌ No se encontró ninguna fila. Angular no cargó la tabla.");
  } else {
    const rowText = await firstRow.innerText();
    console.log("✔ Primera fila encontrada:");
    console.log(rowText);
  }

  await browser.close();
  console.log("Scraper finalizado.");
})();

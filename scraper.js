const { chromium } = require('playwright');

(async () => {
  console.log("Iniciando navegador...");
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log("Abriendo SICOP...");
  await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
    waitUntil: "networkidle"
  });

  console.log("Esperando que cargue la página inicial...");
  await page.waitForTimeout(5000);

  console.log("Buscando botón 'Consultar' por texto...");
  try {
    await page.getByRole("button", { name: "Consultar" }).click();
    console.log("✔ Click en 'Consultar' realizado.");
  } catch (e) {
    console.log("❌ No se pudo hacer clic en 'Consultar'.");
    console.log(e);
    await browser.close();
    return;
  }

  console.log("Esperando que carguen los resultados...");
  const rowSelector = "table tbody tr";

  try {
    await page.waitForSelector(rowSelector, { timeout: 15000 });
    const firstRow = await page.$(rowSelector);

    if (!firstRow) {
      console.log("❌ No se encontró ninguna fila después de consultar.");
    } else {
      const rowText = await firstRow.innerText();
      console.log("✔ Primera fila encontrada:");
      console.log(rowText);
    }
  } catch {
    console.log("❌ La tabla no apareció a tiempo.");
  }

  await browser.close();
  console.log("Scraper finalizado.");
})();

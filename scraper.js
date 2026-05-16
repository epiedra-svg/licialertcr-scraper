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
  await page.waitForTimeout(4000);

  console.log("Buscando botón 'Consultar'...");
  // Botón verde de Consultar
  const consultarButton = await page.$("button.btn.btn-success");

  if (!consultarButton) {
    console.log("❌ No se encontró el botón 'Consultar'.");
    await browser.close();
    return;
  }

  console.log("Haciendo clic en 'Consultar'...");
  await consultarButton.click();

  console.log("Esperando que carguen los resultados...");
  // Esperamos a que aparezca al menos una fila en la tabla
  const rowSelector = "table tbody tr";
  await page.waitForSelector(rowSelector, { timeout: 15000 }).catch(() => {});

  const firstRow = await page.$(rowSelector);

  if (!firstRow) {
    console.log("❌ No se encontró ninguna fila después de consultar.");
  } else {
    const rowText = await firstRow.innerText();
    console.log("✔ Primera fila encontrada:");
    console.log(rowText);
  }

  await browser.close();
  console.log("Scraper finalizado.");
})();

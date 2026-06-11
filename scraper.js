const { chromium } = require('playwright');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { execSync } = require('child_process');

(async () => {

  console.log("Iniciando navegador...");
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  console.log("Abriendo SICOP...");
  await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
    waitUntil: "domcontentloaded",
    timeout: 120000
  });

  // 🔥 AQUI VA EL FIX DEL ACORDEÓN (DENTRO DEL ASYNC)
  console.log("Esperando que aparezca el acordeón...");
  await page.waitForSelector("p-accordion-panel:nth-of-type(1)", {
    timeout: 60000
  });

  console.log("Acordeón detectado, intentando abrirlo...");

  const accordionButton = page.locator(
    "p-accordion-panel:nth-of-type(1) span[role='button']"
  );

  let panelAbierto = false;

  for (let i = 0; i < 5; i++) {
    try {
      await accordionButton.click();
      console.log(`✔ Click al acordeón (intento ${i + 1})`);

      await page.waitForSelector("#attr_cartelNm", {
        timeout: 2000,
        state: "visible"
      });

      panelAbierto = true;
      console.log("✔ Panel abierto correctamente");
      break;
    } catch {
      console.log(`⚠ Panel aún cerrado (intento ${i + 1})`);
    }
  }

  if (!panelAbierto) {
    console.log("❌ No se pudo abrir el panel después de varios intentos");
    await browser.close();
    process.exit(1);
  }

  // 🔥 AQUI SIGUE EL RESTO DEL SCRAPER

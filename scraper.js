console.log("Esperando que aparezca el acordeón...");

// Esperar a que el acordeón exista en el DOM
await page.waitForSelector("p-accordion-panel:nth-of-type(1)", {
  timeout: 60000
});

console.log("Acordeón detectado, intentando abrirlo...");

// Botón real del acordeón
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

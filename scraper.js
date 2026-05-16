const { chromium } = require('playwright');

(async () => {
  console.log("Iniciando navegador...");
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log("Abriendo SICOP...");
  await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
    waitUntil: "networkidle"
  });

  await page.waitForTimeout(5000);

  // Palabras clave
  const keywords = ["Agua", "Geo", "Pozo", "Ambient", "Mapa"];

  // Lista global de resultados
  let resultados = [];

  // Fecha de hoy en formato dd/mm/yyyy
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, "0");
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const anio = hoy.getFullYear();
  const fechaHoy = `${dia}/${mes}/${anio}`;

  console.log("Fecha de hoy:", fechaHoy);

  for (const palabra of keywords) {
    console.log(`\n🔎 Buscando concursos con: ${palabra}`);

    // Limpiar campo de descripción
    await page.fill("input[ng-model='searchData.description']", "");
    await page.waitForTimeout(500);

    // Escribir palabra clave
    await page.fill("input[ng-model='searchData.description']", palabra);
    await page.waitForTimeout(500);

    // Clic en Consultar
    try {
      await page.getByRole("button", { name: "Consultar" }).click();
      console.log("✔ Consultar presionado");
    } catch {
      console.log("❌ No se pudo presionar Consultar");
      continue;
    }

    // Esperar tabla
    const rowSelector = "table tbody tr";
    await page.waitForSelector(rowSelector, { timeout: 15000 }).catch(() => {});

    const filas = await page.$$(rowSelector);

    if (filas.length === 0) {
      console.log("❌ No hay filas para esta palabra");
      continue;
    }

    console.log(`Se encontraron ${filas.length} filas, filtrando por fecha de hoy...`);

    for (const fila of filas) {
      const textoFila = await fila.innerText();

      // Buscar fecha dentro del texto
      if (textoFila.includes(fechaHoy)) {
        resultados.push({
          palabra,
          texto: textoFila
        });
      }
    }
  }

  console.log("\n==============================");
  console.log("RESULTADOS FINALES");
  console.log("==============================");

  if (resultados.length === 0) {
    console.log("A esta hora no se encontraron concursos");
  } else {
    resultados.forEach((r, i) => {
      console.log(`\n${i + 1}. [${r.palabra}]`);
      console.log(r.texto);
    });
  }

  await browser.close();
  console.log("\nScraper finalizado.");
})();

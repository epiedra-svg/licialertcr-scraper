const { chromium } = require('playwright');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { execSync } = require('child_process');

(async () => {
  console.log("Iniciando navegador...");
  const browser = await chromium.launch({
    headless: process.env.CI ? true : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    console.log("Abriendo SICOP...");
    await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
      waitUntil: "domcontentloaded",
      timeout: 120000
    });

    console.log("Esperando que el input #elasticSearch esté disponible...");
    await page.waitForSelector("#elasticSearch", { timeout: 60000 });

    const keywords = ["Agua", "Geo", "Pozo", "Ambient", "Mapa"];

    let enviados = [];
    if (fs.existsSync("enviados.json")) {
      enviados = JSON.parse(fs.readFileSync("enviados.json", "utf8"));
    }

    let nuevos = [];

    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, "0");
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const anio = hoy.getFullYear();
    const fechaHoy = `${dia}/${mes}/${anio}`;

    console.log("Fecha de hoy:", fechaHoy);

    for (const palabra of keywords) {
      console.log(`\n🔎 Buscando concursos con: ${palabra}`);

      // 1. Limpiar y escribir en el nuevo campo #elasticSearch
      await page.locator("#elasticSearch").fill("");
      await page.locator("#elasticSearch").fill(palabra);

      // 2. Hacer clic en el nuevo botón de búsqueda
      // Nota: Incluye fallback (or) por si PrimeNG altera dinámicamente el prefijo "pn_id_12_" al recargar
      const selectorEspecifico = "#pn_id_12_accordioncontent_0 > div > div > form > div > div.col-lg-2.col-md-3.d-flex.align-items-center > p-button > button > span.p-button-label.ng-star-inserted";
      const botonBusqueda = page.locator(selectorEspecifico).or(page.locator("form p-button button"));

      try {
        await botonBusqueda.first().click({ force: true });
        console.log("✔ Botón de búsqueda presionado");
      } catch (err) {
        console.log("❌ No se pudo presionar el botón de búsqueda:", err.message);
        continue;
      }

      // 3. Esperar que la tabla procese los resultados
      const rowSelector = "table tbody tr";
      await page.waitForTimeout(2000); // Pausa breve para renderizado de Angular
      await page.waitForSelector(rowSelector, { timeout: 15000 }).catch(() => {});

      const filas = await page.$$(rowSelector);

      if (filas.length === 0) {
        console.log("❌ No hay filas para esta palabra");
        continue;
      }

      console.log(`Se encontraron ${filas.length} filas, filtrando por fecha de hoy...`);

      for (const fila of filas) {
        const textoFila = (await fila.innerText()).trim();

        if (textoFila.includes(fechaHoy)) {
          const yaEnEnviados = enviados.includes(textoFila);
          const yaEnNuevos = nuevos.some(n => n.texto === textoFila);

          if (!yaEnEnviados && !yaEnNuevos) {
            nuevos.push({
              palabra,
              texto: textoFila
            });
          }
        }
      }
    }

    console.log("\n==============================");
    console.log("RESULTADOS NUEVOS");
    console.log("==============================");

    if (nuevos.length === 0) {
      console.log("A esta hora no se encontraron concursos nuevos");
    } else {
      nuevos.forEach((r, i) => {
        console.log(`\n${i + 1}. [${r.palabra}]`);
        console.log(r.texto);
      });
    }

    if (nuevos.length > 0) {
      console.log("\n📧 Enviando correo...");

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const cuerpo = nuevos
        .map((r, i) => `${i + 1}. [${r.palabra}]\n${r.texto}`)
        .join("\n\n-------------------------------\n\n");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: `Nuevos concursos encontrados en SICOP (${fechaHoy})`,
        text: cuerpo
      });

      console.log("✔ Correo enviado");
    }

    if (nuevos.length > 0) {
      const nuevosTextos = nuevos.map(n => n.texto);
      const actualizados = [...enviados, ...nuevosTextos];
      fs.writeFileSync("enviados.json", JSON.stringify(actualizados, null, 2));

      console.log("✔ enviados.json actualizado");

      try {
        execSync("git config user.name 'github-actions'");
        execSync("git config user.email 'github-actions@github.com'");
        execSync("git add enviados.json");
        execSync("git commit -m 'Actualizar enviados.json'");
        execSync("git push");
        console.log("✔ Cambios subidos a Git");
      } catch (gitErr) {
        console.error("⚠️ Error en Git sync:", gitErr.message);
      }
    }

  } catch (error) {
    console.error("❌ Error durante el proceso de scraping:", error);
  } finally {
    await browser.close();
    console.log("\nScraper finalizado.");
  }
})();

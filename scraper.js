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

  // 1. Configurar User-Agent real para evitar bloqueo de bots en GitHub Actions
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  try {
    // 2. Entrar a SICOP
    console.log("Abriendo SICOP...");
    await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
      waitUntil: "domcontentloaded",
      timeout: 120000
    });

    // Esperar 5 segundos adicionales a que los scripts de Angular inicien
    await page.waitForTimeout(5000);

    console.log("Desplegando sección 'Búsqueda avanzada'...");

    // 3. Buscar el elemento tanto en la página principal como dentro de algún iframe
    let busquedaAvanzadaHeader = null;

    // Probar en la página principal primero
    const mainLocator = page.getByText(/búsqueda avanzada/i);
    if (await mainLocator.count() > 0) {
      busquedaAvanzadaHeader = mainLocator.first();
    } else {
      // Buscar dentro de los frames/iframes presentes en SICOP
      for (const frame of page.frames()) {
        const frameLocator = frame.getByText(/búsqueda avanzada/i);
        if (await frameLocator.count() > 0) {
          console.log(`✔ Sección encontrada dentro de un iframe (${frame.name() || 'sin nombre'})`);
          busquedaAvanzadaHeader = frameLocator.first();
          break;
        }
      }
    }

    if (!busquedaAvanzadaHeader) {
      throw new Error("No se encontró el elemento 'Búsqueda avanzada' ni en la página principal ni dentro de los iframes.");
    }

    await busquedaAvanzadaHeader.waitFor({ state: "visible", timeout: 30000 });
    await busquedaAvanzadaHeader.click({ force: true });

    // 4. Esperar al campo de texto dentro de la página o frame activo
    console.log("Esperando campo de texto #attr_cartelNm...");
    const inputCartel = page.locator("#attr_cartelNm").or(page.frameLocator('iframe').locator("#attr_cartelNm"));
    await inputCartel.first().waitFor({ state: "visible", timeout: 30000 });

    const keywords = ["Agua", "Geo", "Pozo", "Ambient", "Mapa"];

    let enviados = [];
    if (fs.existsSync("enviados.json")) {
      enviados = JSON.parse(fs.readFileSync("enviados.json", "utf8"));
    }

    let nuevos = [];

    // Fecha actual en Costa Rica (DD/MM/YYYY)
    const hoyCR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
    const dia = String(hoyCR.getDate()).padStart(2, "0");
    const mes = String(hoyCR.getMonth() + 1).padStart(2, "0");
    const anio = hoyCR.getFullYear();
    const fechaHoy = `${dia}/${mes}/${anio}`;

    console.log("Fecha de búsqueda (Costa Rica):", fechaHoy);

    for (const palabra of keywords) {
      console.log(`\n🔎 Buscando en Búsqueda Avanzada con: "${palabra}"`);

      await inputCartel.first().click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
      await inputCartel.first().pressSequentially(palabra, { delay: 100 });
      await inputCartel.first().dispatchEvent('input');

      // Botón "Consultar"
      const botonConsultar = page.getByRole("button", { name: /consultar/i })
                                  .or(page.locator("button:has-text('Consultar')"))
                                  .or(page.locator("span.p-button-label:has-text('Consultar')"));

      await botonConsultar.first().click({ force: true });
      console.log("✔ Botón 'Consultar' presionado");

      await page.waitForTimeout(3000);

      const rowSelector = "table tbody tr";
      await page.waitForSelector(rowSelector, { timeout: 15000 }).catch(() => {});

      const filas = await page.$$(rowSelector);
      console.log(`📊 Filas obtenidas para "${palabra}": ${filas.length}`);

      if (filas.length === 0) {
        console.log("❌ Sin resultados devueltos por la consulta");
        continue;
      }

      let agregadosHoy = 0;

      for (const fila of filas) {
        const textoFila = (await fila.innerText()).trim();

        if (textoFila.includes(fechaHoy)) {
          const yaEnEnviados = enviados.includes(textoFila);
          const yaEnNuevos = nuevos.some(n => n.texto === textoFila);

          if (!yaEnEnviados && !yaEnNuevos) {
            nuevos.push({ palabra, texto: textoFila });
            agregadosHoy++;
          }
        }
      }

      console.log(`✅ Concursos de hoy agregados para "${palabra}": ${agregadosHoy}`);
    }

    console.log("\n==============================");
    console.log(`TOTAL DE RESULTADOS NUEVOS: ${nuevos.length}`);
    console.log("==============================");

    if (nuevos.length === 0) {
      console.log("No hay concursos nuevos publicados hoy para las palabras especificadas.");
    } else {
      nuevos.forEach((r, i) => {
        console.log(`\n${i + 1}. [Palabra: ${r.palabra}]`);
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
        .map((r, i) => `${i + 1}. [Coincidencia: ${r.palabra}]\n${r.texto}`)
        .join("\n\n-------------------------------\n\n");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: `Nuevos concursos en SICOP (${fechaHoy})`,
        text: cuerpo
      });

      console.log("✔ Correo enviado");

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
    console.error("❌ Error en la ejecución:", error);
    // Guarda una captura de pantalla en la raíz para diagnosticar bloqueos visuales
    await page.screenshot({ path: "error.png", fullPage: true }).catch(() => {});
    console.log("📸 Captura de pantalla 'error.png' guardada.");
  } finally {
    await browser.close();
    console.log("\nScraper finalizado.");
  }
})();

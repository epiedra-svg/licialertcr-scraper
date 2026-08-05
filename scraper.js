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
    // 1. Entrar a SICOP
    console.log("Abriendo SICOP...");
    await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
      waitUntil: "domcontentloaded",
      timeout: 120000
    });

    // 2. Hacer clic en "Búsqueda avanzada"
    console.log("Desplegando sección 'Búsqueda avanzada'...");
    // Se usa selector por texto para evitar fallos si el ID dinámico pn_id_X cambia entre sesiones
    const busquedaAvanzadaHeader = page.locator("p-accordion-header").filter({ hasText: "Búsqueda avanzada" })
                                       .or(page.locator("#pn_id_6_accordionheader_1"));
    
    await busquedaAvanzadaHeader.first().click({ force: true });

    // 3. Esperar a que el input #attr_cartelNm sea visible dentro del acordeón
    const inputCartel = page.locator("#attr_cartelNm");
    await inputCartel.waitFor({ state: "visible", timeout: 30000 });

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

      // Escribir palabra en #attr_cartelNm activando eventos de Angular
      await inputCartel.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
      await inputCartel.pressSequentially(palabra, { delay: 100 });
      await inputCartel.dispatchEvent('input');

      // 4. Clic en el botón "Consultar"
      const botonConsultar = page.getByRole("button", { name: "Consultar" })
                                  .or(page.locator("button:has-text('Consultar')"))
                                  .or(page.locator("span.p-button-label:has-text('Consultar')"));

      await botonConsultar.first().click({ force: true });
      console.log("✔ Botón 'Consultar' presionado");

      // Esperar actualización de la tabla de resultados
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

        // Filtrar por la fecha de hoy
        if (textoFila.includes(fechaHoy)) {
          const yaEnEnviados = enviados.includes(textoFila);
          const yaEnNuevos = nuevos.some(n => n.texto === textoFila);

          if (!yaEnEnviados && !yaEnNuevos) {
            nuevos.push({
              palabra,
              texto: textoFila
            });
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

    // Envío de correos y persistencia si hay novedades
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
  } finally {
    await browser.close();
    console.log("\nScraper finalizado.");
  }
})();

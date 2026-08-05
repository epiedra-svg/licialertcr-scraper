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

    console.log("Esperando campo de búsqueda #elasticSearch...");
    const inputSearch = page.locator("#elasticSearch");
    await inputSearch.waitFor({ state: "visible", timeout: 60000 });

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
      console.log(`\n🔎 Buscando concursos con la palabra: "${palabra}"`);

      // 1. Limpiar e interactuar con Angular correctamente
      await inputSearch.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
      
      // Escribir simulando teclado real para activar los eventos de Angular
      await inputSearch.pressSequentially(palabra, { delay: 100 });

      // 2. Enviar la búsqueda presionando Enter
      await inputSearch.press("Enter");
      console.log("✔ Búsqueda enviada (Enter)");

      // 3. Pausa para permitir la recarga de datos via API/Angular
      await page.waitForTimeout(3000);

      const rowSelector = "table tbody tr";
      await page.waitForSelector(rowSelector, { timeout: 15000 }).catch(() => {});

      const filas = await page.$$(rowSelector);

      if (filas.length === 0) {
        console.log("❌ No se encontraron filas");
        continue;
      }

      let encontradosConPalabra = 0;

      for (const fila of filas) {
        const textoFila = (await fila.innerText()).trim();

        // VALIDACIÓN RIGUROSA: Debe ser de hoy Y contener explícitamente la palabra buscada
        const esDeHoy = textoFila.includes(fechaHoy);
        const contienePalabra = textoFila.toLowerCase().includes(palabra.toLowerCase());

        if (esDeHoy && contienePalabra) {
          encontradosConPalabra++;
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

      console.log(`Coincidencias reales para "${palabra}": ${encontradosConPalabra}`);
    }

    console.log("\n==============================");
    console.log(`RESULTADOS NUEVOS FILTRADOS: ${nuevos.length}`);
    console.log("==============================");

    if (nuevos.length === 0) {
      console.log("No se encontraron concursos nuevos que contengan las palabras clave.");
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
        .map((r, i) => `${i + 1}. [Coincidencia: ${r.palabra}]\n${r.texto}`)
        .join("\n\n-------------------------------\n\n");

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: `Nuevos concursos filtrados en SICOP (${fechaHoy})`,
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

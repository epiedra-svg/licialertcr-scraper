const { chromium } = require('playwright');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { execSync } = require('child_process');

(async () => {
  console.log("Iniciando navegador...");
  const browser = await chromium.launch({
    headless: false, // MODO HEADED
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  console.log("Abriendo SICOP...");
  await page.goto("https://www.sicop.go.cr/app/module/bid/public/tenders", {
    waitUntil: "networkidle"
  });

  console.log("Esperando que carguen los filtros...");

  // 🔥 FIX: Abrir el panel del acordeón donde está el input
  try {
    await page.locator("p-accordion-panel:nth-of-type(1) .p-accordion-header").click();
    console.log("✔ Panel de filtros expandido");
  } catch {
    console.log("⚠ No se pudo expandir el panel (puede que ya esté abierto)");
  }

  // Esperar el input visible
  await page.waitForSelector("#attr_cartelNm", { timeout: 30000 });

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

    // Asegurar que el panel esté abierto ANTES de cada búsqueda
    try {
      await page.locator("p-accordion-panel:nth-of-type(1) .p-accordion-header").click({ trial: true });
    } catch {}

    // Esperar input visible
    await page.waitForSelector("#attr_cartelNm", { timeout: 30000 });

    // Limpiar campo
    await page.fill("#attr_cartelNm", "");

    // Escribir palabra clave
    await page.fill("#attr_cartelNm", palabra);

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

      if (textoFila.includes(fechaHoy)) {
        if (!enviados.includes(textoFila)) {
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
      .join("\n\n");

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO,
      subject: "Nuevos concursos encontrados en SICOP",
      text: cuerpo
    });

    console.log("✔ Correo enviado");
  }

  if (nuevos.length > 0) {
    const nuevosTextos = nuevos.map(n => n.texto);
    const actualizados = [...enviados, ...nuevosTextos];
    fs.writeFileSync("enviados.json", JSON.stringify(actualizados, null, 2));

    console.log("✔ enviados.json actualizado");

    execSync("git config user.name 'github-actions'");
    execSync("git config user.email 'github-actions@github.com'");
    execSync("git add enviados.json");
    execSync("git commit -m 'Actualizar enviados.json'");
    execSync("git push");
  }

  await browser.close();
  console.log("\nScraper finalizado.");
})();

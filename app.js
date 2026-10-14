import * as pdfjsLib from "./lib/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./lib/pdf.worker.min.mjs", import.meta.url).href;

const $ = (id) => document.getElementById(id);
const el = {
  drop: $("drop"), file: $("file"), fileName: $("fileName"),
  title: $("title"), author: $("author"), dir: $("dir"), height: $("height"),
  quality: $("quality"), qv: $("qv"), gray: $("gray"),
  go: $("go"), cancel: $("cancel"), bar: $("bar"), status: $("status"), result: $("result"),
};

let pdfFile = null;
let cancelled = false;
let lastUrl = null;

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const pad = (n) => String(n).padStart(3, "0");

function setStatus(msg, isErr = false) {
  el.status.textContent = msg;
  el.status.classList.toggle("err", isErr);
}

function chooseFile(f) {
  if (!f) return;
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
    setStatus("That doesn't look like a PDF.", true);
    return;
  }
  pdfFile = f;
  el.fileName.textContent = f.name + " (" + (f.size / 1048576).toFixed(1) + " MB)";
  if (!el.title.value) el.title.value = f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  el.go.disabled = false;
  el.result.classList.add("hidden");
  setStatus("");
}

el.drop.addEventListener("click", () => el.file.click());
el.drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.file.click(); } });
el.file.addEventListener("change", () => chooseFile(el.file.files[0]));
["dragenter", "dragover"].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.remove("over"); }));
el.drop.addEventListener("drop", (e) => chooseFile(e.dataTransfer.files[0]));
el.quality.addEventListener("input", () => { el.qv.textContent = el.quality.value; });
el.cancel.addEventListener("click", () => { cancelled = true; });
el.go.addEventListener("click", convert);

function toGray(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode a page as JPEG."))), "image/jpeg", quality);
  });
}

async function convert() {
  if (!pdfFile) return;
  cancelled = false;
  el.go.disabled = true;
  el.cancel.classList.remove("hidden");
  el.bar.classList.remove("hidden");
  el.result.classList.add("hidden");
  el.bar.value = 0;

  const targetH = parseInt(el.height.value, 10);
  const quality = parseInt(el.quality.value, 10) / 100;
  const rtl = el.dir.value === "rtl";
  const title = el.title.value.trim() || "Untitled";
  const author = el.author.value.trim();

  let pdf;
  try {
    setStatus("Opening PDF…");
    const data = new Uint8Array(await pdfFile.arrayBuffer());
    const base = new URL("./lib/", import.meta.url).href;
    pdf = await pdfjsLib.getDocument({
      data,
      wasmUrl: base + "wasm/",
      cMapUrl: base + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: base + "standard_fonts/",
      iccUrl: base + "iccs/",
    }).promise;
  } catch (err) {
    console.error(err);
    setStatus("Could not open that PDF: " + (err && err.message ? err.message : err), true);
    finish();
    return;
  }

  const total = pdf.numPages;
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');

  const manifest = [];
  const spine = [];
  let firstSize = "";

  try {
    for (let i = 1; i <= total; i++) {
      if (cancelled) throw new Error("cancelled");
      setStatus(`Rendering page ${i} of ${total}…`);
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = targetH / base.height;
      const viewport = page.getViewport({ scale });
      const w = Math.round(viewport.width);
      const h = Math.round(viewport.height);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: el.gray.checked });
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      if (el.gray.checked) toGray(ctx, w, h);
      const blob = await canvasToJpeg(canvas, quality);
      canvas.width = canvas.height = 0;
      page.cleanup();

      const n = pad(i);
      if (i === 1) firstSize = `${w}x${h}`;
      zip.file(`OEBPS/images/${n}.jpg`, blob, { compression: "STORE" });
      zip.file(`OEBPS/p${n}.xhtml`,
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/>` +
        `<title>${i}</title><meta name="viewport" content="width=${w}, height=${h}"/>` +
        `<style>html,body{margin:0;padding:0;}img{width:${w}px;height:${h}px;display:block;}</style></head>` +
        `<body><img src="images/${n}.jpg" alt=""/></body></html>`);
      manifest.push(`<item id="i${n}" href="images/${n}.jpg" media-type="image/jpeg"${i === 1 ? ' properties="cover-image"' : ""}/>`);
      manifest.push(`<item id="p${n}" href="p${n}.xhtml" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="p${n}" properties="${i % 2 === 1 ? "page-spread-right" : "page-spread-left"}"/>`);
      el.bar.value = i / (total + 1);
      await new Promise((r) => setTimeout(r, 0));
    }

    zip.file("OEBPS/nav.xhtml",
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
      '<head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="p001.xhtml">Cover</a></li></ol></nav></body></html>');

    const uid = "urn:uuid:" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    const opf =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">` +
      `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<dc:identifier id="id">${uid}</dc:identifier><dc:title>${esc(title)}</dc:title>` +
      (author ? `<dc:creator>${esc(author)}</dc:creator>` : "") +
      `<dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>` +
      `<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:orientation">portrait</meta><meta property="rendition:spread">landscape</meta>` +
      `<meta name="fixed-layout" content="true"/><meta name="original-resolution" content="${firstSize}"/><meta name="book-type" content="comic"/><meta name="cover" content="i001"/>` +
      `</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest.join("")}</manifest>` +
      `<spine page-progression-direction="${rtl ? "rtl" : "ltr"}">${spine.join("")}</spine></package>`;
    zip.file("OEBPS/content.opf", opf);

    setStatus("Packaging EPUB…");
    const out = await zip.generateAsync(
      { type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE", streamFiles: true },
      (m) => { el.bar.value = (total + m.percent / 100) / (total + 1); }
    );

    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(out);
    const name = title.replace(/[\\/:*?"<>|]+/g, "").trim() + ".epub";
    el.result.innerHTML = "";
    const a = document.createElement("a");
    a.href = lastUrl;
    a.download = name;
    a.textContent = `Download ${name} (${(out.size / 1048576).toFixed(1)} MB)`;
    el.result.appendChild(a);
    el.result.classList.remove("hidden");
    el.bar.value = 1;
    setStatus(out.size > 200 * 1048576
      ? `Done, but ${(out.size / 1048576).toFixed(0)} MB is over Amazon's 200 MB limit. Try a smaller page height or lower quality.`
      : `Done: ${total} pages.`, out.size > 200 * 1048576);
    a.click();
  } catch (err) {
    if (err && err.message === "cancelled") setStatus("Cancelled.");
    else { console.error(err); setStatus("Conversion failed: " + (err && err.message ? err.message : err), true); }
  } finally {
    try { await pdf.destroy(); } catch (_) { /* ignore */ }
    finish();
  }
}

function finish() {
  el.go.disabled = !pdfFile;
  el.cancel.classList.add("hidden");
}

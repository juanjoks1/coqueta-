#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera dist/visor.html autocontenido a partir de src/, node_modules/ y datos/.

- Sustituye las etiquetas <script src="https://cdn.jsdelivr.net/npm/<paquete>@<versión>/..."> por el archivo
  local de node_modules con la MISMA versión (falla si package.json no coincide).
- Incrusta CSS, la fuente Atkinson Hyperlegible (woff2 en base64) y los módulos JS.
- Empaqueta datos/datos.json + datos/procesadas/*.pdb en un JSON comprimido con zlib y codificado en base64
  (se descomprime en el navegador con fflate).

Uso: python3 scripts/build.py
"""
import base64
import json
import os
import re
import sys
import zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, "src")
NM = os.path.join(RAIZ, "node_modules")
DATOS = os.path.join(RAIZ, "datos")
DIST = os.path.join(RAIZ, "dist")

LIBS = {  # data-lib -> (paquete npm, ruta dentro del paquete)
    "three": ("three", "build/three.min.js"),
    "3dmol": ("3dmol", "build/3Dmol-min.js"),
    "fflate": ("fflate", "umd/index.js"),
}
FUENTES = [  # (peso, archivo)
    (400, "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2"),
    (700, "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2"),
]


def leer(ruta, binario=False):
    with open(ruta, "rb" if binario else "r", encoding=None if binario else "utf-8") as f:
        return f.read()


def js_seguro(txt):
    return txt.replace("</script", "<\\/script")


def version_instalada(paquete):
    return json.loads(leer(os.path.join(NM, paquete, "package.json")))["version"]


def main():
    html = leer(os.path.join(SRC, "index.html"))

    # --- librerías fijadas
    def sustituir_lib(m):
        url, clave = m.group(1), m.group(2)
        paquete, ruta = LIBS[clave]
        mv = re.search(r"/npm/(?:@[^/]+/)?[^@/]+@([0-9][^/]*)/", url)
        if not mv:
            sys.exit(f"No se encontró versión en la URL {url}")
        v_url, v_local = mv.group(1), version_instalada(paquete)
        if v_url != v_local:
            sys.exit(f"Versión de {paquete}: URL {v_url} ≠ node_modules {v_local}")
        codigo = leer(os.path.join(NM, paquete, ruta))
        return f"<script data-lib=\"{clave}\" data-version=\"{v_local}\">\n{js_seguro(codigo)}\n</script>"

    html, n = re.subn(r'<script src="([^"]+)" data-lib="([^"]+)"></script>', sustituir_lib, html)
    if n != len(LIBS):
        sys.exit(f"Se esperaban {len(LIBS)} librerías, se sustituyeron {n}")

    # --- CSS + fuente
    css = leer(os.path.join(SRC, "estilos.css"))
    caras = []
    for peso, rel in FUENTES:
        b64 = base64.b64encode(leer(os.path.join(NM, rel), binario=True)).decode("ascii")
        caras.append("@font-face{font-family:'Atkinson Hyperlegible';font-style:normal;font-weight:%d;font-display:swap;"
                     "src:url(data:font/woff2;base64,%s) format('woff2');}" % (peso, b64))
    html = html.replace('<link rel="stylesheet" href="estilos.css" data-inline="css">',
                        "<style>\n" + "\n".join(caras) + "\n" + css + "\n</style>")

    # --- datos comprimidos
    datos = json.loads(leer(os.path.join(DATOS, "datos.json")))
    pdbs = {}
    for tr in datos["transportadores"].values():
        for e in tr["estructuras"]:
            pdbs[e["id"]] = leer(os.path.join(DATOS, e["archivo"]))
    paquete = json.dumps({"datos": datos, "pdbs": pdbs}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    comprimido = zlib.compress(paquete, 9)
    b64 = base64.b64encode(comprimido).decode("ascii")
    etiqueta_datos = f'<script data-paquete="zlib+base64" data-bytes="{len(paquete)}">window.__PAQUETE__="{b64}";</script>'

    # --- módulos propios
    def sustituir_js(m):
        nombre = m.group(1)
        codigo = leer(os.path.join(SRC, nombre))
        pref = etiqueta_datos + "\n" if nombre == "app.js" else ""
        return f"{pref}<script data-src=\"{nombre}\">\n{js_seguro(codigo)}\n</script>"

    html = re.sub(r'<script src="([^"]+\.js)" data-inline="js"></script>', sustituir_js, html)
    html = html.replace("<!-- Las versiones están fijadas.", "<!-- Archivo generado por scripts/build.py. Las versiones están fijadas.")

    os.makedirs(DIST, exist_ok=True)
    salida = os.path.join(DIST, "visor.html")
    with open(salida, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"dist/visor.html: {os.path.getsize(salida) / 1e6:.2f} MB "
          f"(datos {len(paquete) / 1e6:.2f} MB → {len(comprimido) / 1e6:.2f} MB comprimidos)")


if __name__ == "__main__":
    main()

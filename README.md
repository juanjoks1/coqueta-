# Visor 3D de transportadores de monoaminas (DAT, SERT, NET, VMAT2)

Visor web educativo en español, pensado para el celular (probado en 412×915) y escritorio. Dos modos:
**Esquema animado** (three.js) y **Estructura real** (3Dmol.js). El archivo final `dist/visor.html` es
autocontenido: se abre directo desde el archivo, sin servidor ni red.

## Cómo regenerar

```bash
pip install gemmi numpy               # Python 3.11
npm install                           # three 0.158.0, 3dmol 2.5.5, fflate 0.8.2, fuente Atkinson Hyperlegible (fijados)
python3 scripts/preparar_estructuras.py   # estructuras/*.cif -> datos/ (añade --sin-red para no intentar descargas)
python3 scripts/build.py                  # src/ + node_modules/ + datos/ -> dist/visor.html
node scripts/capturas.mjs                 # capturas de verificación en capturas/ (Playwright; --rapido para menos)
```

Si falta un mmCIF, `preparar_estructuras.py` intenta descargarlo de `files.rcsb.org` y, si no, del espejo
oficial del wwPDB en AWS Open Data (`pdbsnapshots`). Si hay red, también intenta OPM (orientación y espesor de
membrana) y UniProt (topología TM); lo que consigue queda en caché en `datos/opm/` y `datos/uniprot/`.

## De dónde sale cada dato

| Dato | Fuente | Medido / inferido |
|---|---|---|
| Coordenadas, ligandos, iones, nombres de compuestos, método, resolución, cita, mutaciones del constructo | `estructuras/*.cif` (wwPDB, instantánea 2026-01-01) | medido |
| Cadena del transportador | entidad con `_struct_ref` UniProt (Q01959, P31645, P23975, Q05940) | medido |
| Orientación en la membrana, espesor | OPM (`datos/opm/5i6x.pdb`, `5i71.pdb`, 30.6 / 31.6 Å) para SERT; para el resto normal estimada con los ejes de las hélices TM y espesor típico 30 Å | SERT medido; DAT/NET/VMAT2 **inferido** |
| Hélices TM1–TM12 | UniProt si hay caché; si no, geometría (cruces del plano medio de la membrana + hélices de `_struct_conf`) | **inferido** (en esta versión, geometría) |
| Contactos ≤ 4 Å y su tipo | distancias en las coordenadas; criterios en `CRIT` de `scripts/preparar_estructuras.py` | medido + regla |
| Compuertas (distancias) | átomos indicados por el usuario, medidos en las coordenadas | medido |
| Estado de compuerta y conformación | regla explícita (umbrales en `CRIT`; ver `datos/informe.md`) | **inferido** |
| Apertura MFS de VMAT2 | medida propia (centroides de extremos TM de las mitades N y C) | medida propia, comparación relativa |
| Morph | segunda estructura superpuesta sobre la primera por los Cα del andamio (TM3, 4, 8, 9; VMAT2: todos); cuadros interpolados linealmente en el navegador | **inferido** (no es una trayectoria física) |
| Esquema animado | representación didáctica; posiciones y tiempos no son datos | esquema |
| Fichas (gen, cromosoma, tamaño, estequiometría) y notas clínicas | `src/fichas.js`; conocimiento estándar de farmacología, sin dosis; gen/cromosoma/tamaño según UniProt de memoria del modelo (verificar) | texto |

Todo lo inferido aparece marcado en la interfaz (panel «Fuentes, medido frente a inferido» y etiquetas
«inferido» en las tablas). El resumen de compuertas, rangos TM, orientación y avisos está en `datos/informe.md`.

## Estructura del repositorio

- `estructuras/` · 8 mmCIF: 8Y2D, 8Y2G (DAT); 5I6X, 5I71 (SERT); 8HFF, 8ZP2 (NET); 8T69, 8T6A (VMAT2).
- `scripts/preparar_estructuras.py` · limpieza, orientación, TM, contactos, compuertas, morph → `datos/`.
- `scripts/build.py` · empaqueta todo en `dist/visor.html` (datos comprimidos con zlib + base64, librerías incrustadas).
- `scripts/capturas.mjs` · capturas con Playwright y registro de errores de consola (`capturas/informe.json`).
- `src/` · `index.html`, `estilos.css`, `app.js` (interfaz), `esquema.js` (three.js), `estructura.js` (3Dmol), `fichas.js` (contenido).
- `datos/` · salidas del procesamiento: `procesadas/*.pdb`, `datos.json`, `informe.md`, `opm/`.
- `dist/visor.html` · el visor.

## Notas

- Los códigos de ligando de 5 caracteres se renombran para el formato PDB: A1D5U → MPH, A1LX4 → ATX.
- Se eliminan Fab, nanocuerpos, lípidos, detergentes, glicanos, agua, hidrógenos y conformaciones alternativas.
- En VMAT2 el lado +y es el lumen vesicular; en los demás, el espacio extracelular. El N-terminal queda en el citosol.

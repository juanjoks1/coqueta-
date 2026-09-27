# Plan de trabajo (visor 3D de transportadores de monoaminas)

## Situación de partida
- El repositorio estaba vacío: no había `estructuras/` ni `referencia/`. Se descargaron los 8 mmCIF
  desde el espejo oficial del wwPDB en AWS Open Data (`pdbsnapshots`, instantánea 2026-01-01), porque
  `files.rcsb.org` está bloqueado por la política de red del entorno.
- OPM (`opm-assets.storage.googleapis.com`) sí es accesible: tiene 5I6X y 5I71. No tiene 8Y2D, 8Y2G,
  8HFF, 8ZP2, 8T69 ni 8T6A. UniProt (`rest.uniprot.org`) está bloqueado.

## Parte 1 · `scripts/preparar_estructuras.py`
1. Limpieza: cadena del transportador (identificada por `_struct_ref` UniProt), ligando, iones Na⁺/Cl⁻/K⁺.
   Se eliminan Fab/nanocuerpos, lípidos, detergentes, glicanos, agua, hidrógenos y conformaciones alternativas.
2. Orientación: OPM directa cuando existe (SERT); si no, normal de membrana estimada con los ejes de las
   hélices largas (autovector principal de Σ aᵢaᵢᵀ), iterando con la asignación TM. Extracelular/lumen → +y,
   N-terminal en citosol. La estimación geométrica se valida contra OPM en 5I6X/5I71 (ángulo entre normales).
3. TM1–TM12: UniProt si hay caché en `datos/uniprot/`; si no, geometría: cruces del plano medio de la membrana
   por la traza Cα suavizada, extendidos por la hélice anotada en `_struct_conf`. Debe dar 12; si no, aviso.
4. Contactos ≤ 4 Å con criterios explícitos (puente salino, puente de H, catión–π, apilamiento, hidrofóbico).
5. Compuertas: distancias pedidas + regla de inferencia explícita; comparación con la conformación esperada.
   VMAT2: apertura luminal/citosólica entre dominios N y C (medida propia, definida en el JSON).
6. Ligandos largos renombrados (A1D5U→MPH, A1LX4→ATX) en PDB de salida.
7. Morph: segunda estructura superpuesta sobre la primera con las hélices de andamio (TM3,4,8,9; VMAT2: todos
   los Cα comunes). Los cuadros intermedios se interpolan en el navegador (3Dmol `setCoordinates(...,'array')`).

## Parte 2 · `src/` + `scripts/build.py` → `dist/visor.html`
- Librerías fijadas desde npm: three 0.158.0 (UMD), 3Dmol 2.5.5, fflate 0.8.2, fuente Atkinson Hyperlegible
  (@fontsource 5.3.0) incrustada. Sin dependencias de red en el archivo final.
- Modo esquema (three.js): LeuT (12 hélices, TM1/TM6 partidas, acceso alternante con Na⁺/Cl⁻ y K⁺ en SERT);
  MFS para VMAT2 (rocker-switch, 2 H⁺). Fármacos: inhibidores fijan conformación; liberadores invierten.
- Modo estructura (3Dmol): hélices por grupo y numeradas, ligando en barras, iones esferas, membrana OPM/inferida,
  lista de contactos, clic en átomo, sitio de unión / vista completa, tabla de compuertas, morph.
- Fichas por transportador; móvil primero; claro/oscuro.

## Parte 3 · verificación
- Playwright: 412×915 y 1440×900, claro y oscuro, cada transportador y estructura; consola sin errores.

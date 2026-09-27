/* Lógica de la interfaz. Sin dependencias además de three, 3Dmol y fflate (globales). */
'use strict';

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const estado = { tr: 'DAT', modo: 'esquema', farmaco: 'ninguno', estructura: null, velocidad: 1 };
  let DATOS = null, PDBS = null, esquema = null, estructura = null;

  // ------------------------------------------------------------ tema
  function temaActual() {
    const forzado = document.documentElement.getAttribute('data-theme');
    if (forzado) return forzado;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function aplicarTema(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('tema', t); } catch (e) { /* sin almacenamiento */ }
    $('#btn-tema').textContent = t === 'dark' ? '☀' : '☾';
    const p = paleta();
    if (esquema) esquema.setTema(p);
    if (estructura) estructura.setTema(p);
  }
  function paleta() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    const oscuro = temaActual() === 'dark';
    return {
      bg: v('--bg-2'), fg: v('--fg'), fg2: v('--fg-2'), haz: v('--haz'), andamio: v('--andamio'), perif: v('--perif'),
      mitadN: v('--mitadN'), mitadC: v('--mitadC'), bucle: oscuro ? '#5a6570' : '#b9c0c7', membrana: oscuro ? '#8a94a0' : '#6b7480',
      ligandoEsquema: 'greenCarbon', proteinaEsquema: oscuro ? 'whiteCarbon' : 'grayCarbon', resaltadoEsquema: 'magentaCarbon',
    };
  }

  // ------------------------------------------------------------ carga de datos
  function base64aBytes(b64) {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function cargarDatos() {
    if (window.__PAQUETE__) {
      const bytes = fflate.unzlibSync(base64aBytes(window.__PAQUETE__));
      const paquete = JSON.parse(fflate.strFromU8(bytes));
      window.__PAQUETE__ = null;
      return paquete;
    }
    // modo desarrollo (servidor http local): lee datos/ directamente
    const datos = await (await fetch('../datos/datos.json')).json();
    const pdbs = {};
    for (const tr of Object.values(datos.transportadores)) for (const e of tr.estructuras) pdbs[e.id] = await (await fetch('../datos/' + e.archivo)).text();
    return { datos, pdbs };
  }

  // ------------------------------------------------------------ utilidades de render
  const h = (tag, attrs, ...hijos) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null) el.setAttribute(k, v);
    }
    for (const c of hijos.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const etq = (txt, cls) => h('span', { class: 'etq ' + (cls || '') }, txt);
  const TIPO_COLOR = { 'puente salino': '#d7263d', 'puente de hidrógeno': '#2f6fd0', 'catión–π': '#8e5bd6',
    'apilamiento aromático (paralelo)': '#f39c12', 'apilamiento aromático (en T)': '#f39c12', 'hidrofóbico': '#7c8a95',
    'van der Waals (≤ 4 Å, sin tipo específico)': '#b9c0c7' };
  const nombreLig = (l) => window.NOMBRES_LIGANDO[l.codigo] || l.nombre;
  const colorTipo = (t) => { for (const [k, c] of Object.entries(TIPO_COLOR)) if (t.startsWith(k)) return c; return '#999'; };
  const esMovil = () => window.innerWidth < 900;
  const fmt = (x, d) => (x == null ? '—' : Number(x).toFixed(d == null ? 1 : d));

  let toastTimer = null;
  function toast(txt) {
    const t = $('#toast'); t.textContent = txt; t.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
  }

  // ------------------------------------------------------------ paneles
  function renderFicha() {
    const f = window.FICHAS[estado.tr], t = DATOS.transportadores[estado.tr];
    const cont = $('#ficha'); cont.innerHTML = '';
    cont.append(h('h2', null, `${f.nombre} (${f.sigla})`));
    const dl = h('dl', { class: 'ficha' });
    const filas = [['Gen', f.gen], ['UniProt', t.uniprot], ['Cromosoma', f.cromosoma], ['Tamaño', f.tamano], ['Familia', f.familia],
      ['Localización', f.localizacion], ['Estequiometría', f.estequiometria], ['Sustratos', f.sustrato], ['Ciclo', f.ciclo],
      ['Estructuras', t.estructuras.map((e) => `${e.id}: ${nombreLig(e.ligando)} · ${e.metodo}${e.resolucion ? ' ' + fmt(e.resolucion, 2) + ' Å' : ''}`).join(' · ')]];
    for (const [k, v] of filas) dl.append(h('dt', null, k), h('dd', null, v));
    cont.append(dl, h('p', { class: 'peq' }, f.nota), h('p', { class: 'peq' }, f.fuente_ficha));
  }

  function renderFarmacos() {
    const lista = window.FARMACOS[estado.tr];
    const cont = $('#farmacos-chips'); cont.innerHTML = '';
    if (!lista.some((x) => x.id === estado.farmaco)) estado.farmaco = 'ninguno';
    for (const fm of lista) {
      cont.append(h('button', { class: 'chip peq', 'aria-pressed': String(fm.id === estado.farmaco), onclick: () => { estado.farmaco = fm.id; renderFarmacos(); configurarEsquema(); } }, fm.nombre));
    }
    const fm = lista.find((x) => x.id === estado.farmaco);
    const nota = $('#farmaco-nota'); nota.innerHTML = '';
    if (fm.accion === 'sustrato') {
      nota.append(h('p', { class: 'peq' }, 'Ciclo de transporte sin fármaco. Elige un fármaco para ver cómo altera el ciclo. El esquema es didáctico: posiciones y tiempos no están a escala.'));
      return;
    }
    const est = fm.estructura ? DATOS.transportadores[estado.tr].estructuras.find((e) => e.id === fm.estructura) : null;
    nota.append(h('p', null, h('strong', null, fm.accion === 'inhibidor' ? 'Inhibidor. ' : 'Liberador (sustrato). '), fm.mecanismo));
    if (fm.accion === 'inhibidor') {
      const fila = h('p', { class: 'peq' }, 'Conformación mostrada: ', h('strong', null, fm.conformacion), ' ');
      if (est && est.conformacion.inferida && est.conformacion.coincide) fila.append(etq(`medida en ${est.id}`, 'medido'));
      else if (est) fila.append(etq(`esperada para ${est.id}; medida propia relativa`, 'inferido'));
      else fila.append(etq('no medida aquí: típica de su clase', 'inferido'));
      nota.append(fila);
    }
    nota.append(h('p', { class: 'peq' }, h('strong', null, 'Nota clínica: '), fm.clinica));
    if (est) nota.append(h('p', null, h('button', { class: 'chip peq', onclick: () => { cambiarModo('estructura'); seleccionarEstructura(est.id); if (esMovil()) $('#lienzo').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, `Ver estructura ${est.id}`)));
  }

  function estructuraActual() {
    const t = DATOS.transportadores[estado.tr];
    return t.estructuras.find((e) => e.id === estado.estructura) || t.estructuras[0];
  }

  function renderContactos() {
    const e = estructuraActual(); const cont = $('#contactos'); cont.innerHTML = '';
    const ley = h('div', { class: 'leyenda' });
    for (const [k, c] of Object.entries(TIPO_COLOR)) ley.append(h('span', { style: `--c:${c}` }, k.replace(' (≤ 4 Å, sin tipo específico)', '')));
    cont.append(h('p', { class: 'peq' }, `${e.id}: ${nombreLig(e.ligando)} (${e.ligando.codigo}${e.ligando.codigo_pdb !== e.ligando.codigo ? ', renombrado ' + e.ligando.codigo_pdb : ''}). Toca un residuo para acercarte.`), ley);
    e.ligando.copias.forEach((c, k) => {
      const enc = h('h3', null, c.etiqueta === 'S1' && e.ligando.copias.length === 1 ? 'Sitio central S1' : `Sitio ${c.etiqueta} (y = ${fmt(c.y_centro)} Å ${c.y_centro > 12 ? '· vestíbulo extracelular' : '· central'})`,
        ' ', h('button', { class: 'chip peq', onclick: () => { if (estructura) estructura.verSitio(k); if (esMovil()) $('#lienzo').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'Ver sitio'));
      cont.append(enc);
      if (c.iones_cercanos.length) cont.append(h('p', { class: 'peq' }, 'Iones cerca: ' + c.iones_cercanos.map((i) => `${({ NA: 'Na⁺', CL: 'Cl⁻', K: 'K⁺' })[i.ion]} a ${fmt(i.d_ligando)} Å`).join(', ')));
      const ul = h('ul', { class: 'lista' });
      for (const r of c.residuos) {
        const tm = e.tm.find((t) => r.resi >= t.ini && r.resi <= t.fin);
        const b = h('button', { class: 'fila', 'data-resi': r.resi, onclick: (ev) => {
          $$('#contactos .fila').forEach((x) => x.setAttribute('aria-pressed', 'false')); ev.currentTarget.setAttribute('aria-pressed', 'true');
          if (estructura) estructura.enfocarResiduo(r.resi, k);
          if (esMovil()) $('#lienzo').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } },
          h('span', { class: 'punto', style: `background:${colorTipo(r.tipo_principal)}` }),
          h('span', { style: 'flex:1' }, h('strong', null, `${r.resn[0]}${r.resn.slice(1).toLowerCase()}${r.resi}`), tm ? h('small', null, ` · TM${tm.n}`) : h('small', null, ' · bucle'),
            h('br'), h('small', null, r.tipos.join(', '))),
          h('small', null, `${fmt(r.dmin, 2)} Å`));
        ul.append(h('li', null, b));
      }
      cont.append(ul);
    });
    cont.append(h('p', { class: 'peq' }, 'Criterios geométricos (Å): puente salino N⁺–O carboxilato ≤ 4.0; puente de H N/O–N/O ≤ 3.5 (sólo distancia); catión–π N⁺–centroide ≤ 6.0 y ángulo ≤ 40°; apilamiento centroide–centroide ≤ 5.5 (paralelo, ≤ 30°) o ≤ 6.0 (en T, ≥ 60°); hidrofóbico C–C ≤ 4.0.'));
  }

  function renderCompuertas() {
    const e = estructuraActual(); const cont = $('#compuertas'); cont.innerHTML = '';
    const conf = e.conformacion;
    cont.append(h('p', null, h('strong', null, `${e.id}: `), 'conformación esperada ', h('strong', null, conf.esperada), '. ',
      conf.inferida ? ['Inferida por regla: ', h('strong', null, conf.inferida), ' ', etq(conf.coincide ? 'coincide' : conf.coincide === false ? 'no coincide' : 'comparación', conf.coincide ? 'medido' : 'inferido')] : ''));
    if (conf.motivo) cont.append(h('p', { class: 'peq' }, 'Motivo: ' + conf.motivo + '.'));
    if (conf.titulo_pdb_menciona) cont.append(h('p', { class: 'peq' }, `El título del depósito PDB menciona: «${conf.titulo_pdb_menciona}».`));
    if (e.compuertas.length) {
      const tabla = h('table', null, h('thead', null, h('tr', null, ...['Compuerta', 'Átomos', 'Distancia', 'Estado'].map((x) => h('th', null, x)))));
      const tb = h('tbody');
      for (const c of e.compuertas) {
        tb.append(h('tr', null, h('td', null, c.nombre, h('br'), h('small', null, c.lado)), h('td', null, c.par || '—'),
          h('td', null, c.distancia == null ? '—' : `${fmt(c.distancia, 2)} Å`, h('br'), h('small', null, c.umbral ? `umbral ≤ ${c.umbral} Å` : (c.nota || ''))),
          h('td', null, c.estado)));
      }
      tabla.append(tb); cont.append(h('div', { class: 'tabla-scroll' }, tabla));
      cont.append(h('p', { class: 'peq' }, 'Regla: tapa aromática (Tyr OH – Phe CZ) > 8 Å → abierto hacia fuera; si está cerrada: puente salino intracelular roto → abierto hacia dentro, formado → ocluido; si no se pudo medir el intracelular, Na⁺ resuelto → ocluido, sin Na⁺ → abierto hacia dentro. Los umbrales son explícitos y la conclusión es inferida.'));
    }
    if (e.apertura_mfs) {
      cont.append(h('p', null, `Apertura entre dominios N y C (medida propia): lado luminal ${fmt(e.apertura_mfs.luminal, 2)} Å, lado citosólico ${fmt(e.apertura_mfs.citosolica, 2)} Å.`),
        h('p', { class: 'peq' }, 'Definición: distancia entre los centroides de los Cα con |y| > 8 Å de las hélices TM1–6 y TM7–12, en cada lado de la membrana. Sirve para comparar las dos estructuras de VMAT2 entre sí, no como clasificación absoluta.'));
    }
    const mo = DATOS.transportadores[estado.tr].morph;
    if (mo) cont.append(h('p', { class: 'peq' }, `Cambio conformacional ${mo.base} → ${mo.movil}: RMSD de todos los Cα comunes ${fmt(mo.rmsd_todos_ca, 2)} Å tras superponer ${mo.superposicion} (RMSD ${fmt(mo.rmsd_andamio, 2)} Å, ${mo.n_ca} Cα).`));
  }

  function renderTM() {
    const e = estructuraActual(); const cont = $('#tm'); cont.innerHTML = '';
    const p = paleta();
    const grupos = e.grupos;
    const ley = h('div', { class: 'leyenda' });
    for (const [nombre, lista] of Object.entries(grupos)) {
      const col = DATOS.transportadores[estado.tr].plegamiento === 'MFS' ? (nombre.startsWith('mitad N') ? p.mitadN : p.mitadC) : nombre === 'haz central' ? p.haz : nombre === 'andamio' ? p.andamio : p.perif;
      ley.append(h('span', { style: `--c:${col}` }, `${nombre}: TM${lista.join(', ')}`));
    }
    cont.append(ley);
    const tabla = h('table', null, h('thead', null, h('tr', null, ...['TM', 'Residuos', 'n', 'Inclinación', 'Sentido'].map((x) => h('th', null, x)))));
    const tb = h('tbody');
    for (const t of e.tm) {
      let col = p.perif;
      if (DATOS.transportadores[estado.tr].plegamiento === 'MFS') col = t.n <= 6 ? p.mitadN : p.mitadC;
      else if (grupos['haz central'].includes(t.n)) col = p.haz; else if (grupos['andamio'].includes(t.n)) col = p.andamio;
      tb.append(h('tr', null, h('td', null, h('span', { class: 'punto', style: `background:${col};display:inline-block;vertical-align:-1px;margin-right:6px` }), `TM${t.n}`),
        h('td', null, `${t.ini}–${t.fin}`), h('td', null, String(t.residuos)), h('td', null, `${fmt(t.inclinacion)}°`), h('td', null, t.direccion)));
    }
    tabla.append(tb); cont.append(h('div', { class: 'tabla-scroll' }, tabla));
    cont.append(h('p', { class: 'peq' }, 'Fuente de los rangos: ', e.tm_fuente, '. ', etq(DATOS.transportadores[estado.tr].uniprot_disponible ? 'UniProt' : 'inferido (geometría)', DATOS.transportadores[estado.tr].uniprot_disponible ? 'medido' : 'inferido'),
      ' Inclinación = ángulo del eje de la hélice con la normal de la membrana.'));
  }

  function renderFuentes() {
    const e = estructuraActual(); const t = DATOS.transportadores[estado.tr]; const cont = $('#fuentes'); cont.innerHTML = '';
    const o = e.orientacion;
    const ul = h('ul');
    ul.append(h('li', null, h('strong', null, 'Coordenadas: '), `PDB ${e.id} (${e.metodo}${e.resolucion ? ', ' + fmt(e.resolucion, 2) + ' Å' : ''}), cadena ${e.cadena}, residuos ${e.residuos[0]}–${e.residuos[1]}${e.huecos.length ? ', huecos ' + e.huecos.map((x) => x[0] + '–' + x[1]).join(', ') : ''}. `, etq('medido', 'medido'), ' «', e.titulo, '»',
      e.cita && e.cita.doi ? [' · ', h('a', { href: 'https://doi.org/' + e.cita.doi, target: '_blank', rel: 'noopener' }, `${e.cita.revista} ${e.cita.anio}`)] : ''));
    ul.append(h('li', null, h('strong', null, 'Orientación en la membrana: '), o.fuente, ' — ', o.detalle, '. ', etq(o.inferido ? 'inferido' : 'medido (OPM)', o.inferido ? 'inferido' : 'medido'),
      o.angulo_geometria_vs_opm != null ? ` La estimación geométrica se desvía ${fmt(o.angulo_geometria_vs_opm)}° de OPM en esta estructura.` : ''));
    ul.append(h('li', null, h('strong', null, 'Espesor de membrana: '), `${fmt(o.espesor)} Å — ${o.espesor_fuente}. `, etq(o.inferido ? 'inferido' : 'medido', o.inferido ? 'inferido' : 'medido')));
    ul.append(h('li', null, h('strong', null, 'Hélices TM: '), e.tm_fuente, '. ', etq(t.uniprot_disponible ? 'UniProt' : 'inferido', t.uniprot_disponible ? 'medido' : 'inferido')));
    ul.append(h('li', null, h('strong', null, 'Contactos: '), 'distancias medidas en las coordenadas; la clasificación por tipo usa los criterios geométricos indicados (sin hidrógenos: puentes de H sólo por distancia). ', etq('medido + regla', 'medido')));
    if (e.compuertas.length) ul.append(h('li', null, h('strong', null, 'Compuertas: '), 'distancias medidas; estado y conformación por regla explícita. ', etq('inferido', 'inferido')));
    if (e.apertura_mfs) ul.append(h('li', null, h('strong', null, 'Apertura MFS: '), 'medida propia con definición explícita; comparación relativa entre 8T69 y 8T6A. ', etq('inferido', 'inferido')));
    if (t.morph) ul.append(h('li', null, h('strong', null, 'Morph: '), `${t.morph.movil} superpuesta sobre ${t.morph.base} con ${t.morph.superposicion}; cuadros intermedios por ${t.morph.interpolacion}. `, etq('inferido', 'inferido')));
    if (e.mutaciones.length) ul.append(h('li', null, h('strong', null, 'Diferencias con UniProt en el constructo: '), e.mutaciones.map((m) => `${m.uniprot}${m.resi}${m.pdb} (${m.detalle.replace(/'/g, '')})`).join(', '), '. ', etq('del archivo PDB', 'medido')));
    ul.append(h('li', null, h('strong', null, 'Ligando: '), `${e.ligando.nombre} (código ${e.ligando.codigo}${e.ligando.codigo_pdb !== e.ligando.codigo ? ', renombrado ' + e.ligando.codigo_pdb + ' para el formato PDB' : ''}); nombre tomado de _chem_comp del archivo.`));
    ul.append(h('li', null, h('strong', null, 'Iones resueltos: '), e.iones.length ? e.iones.map((i) => i.simbolo).join(', ') : 'ninguno en el depósito'));
    ul.append(h('li', null, h('strong', null, 'Esquema animado: '), 'representación didáctica; posiciones de hélices y tiempos no son datos medidos. ', etq('esquema', 'inferido')));
    ul.append(h('li', null, h('strong', null, 'Ficha: '), window.FICHAS[estado.tr].fuente_ficha, ' Notas clínicas: farmacología estándar, sin dosis.'));
    cont.append(ul, h('p', { class: 'peq' }, `Datos generados: ${DATOS.generado}. Archivos: estructuras/*.cif (wwPDB), datos/opm/*.pdb (OPM), scripts/preparar_estructuras.py.`));
  }

  function renderPaneles() {
    renderFicha(); renderFarmacos(); renderContactos(); renderCompuertas(); renderTM(); renderFuentes();
    const enEstructura = estado.modo === 'estructura';
    $('#panel-farmacos').hidden = enEstructura;
    $('#panel-contactos').hidden = !enEstructura;
    $('#panel-compuertas').hidden = false;
    $('#panel-tm').hidden = false;
  }

  // ------------------------------------------------------------ esquema
  function configurarEsquema() {
    if (!esquema) return;
    const f = window.FICHAS[estado.tr];
    const farmaco = window.FARMACOS[estado.tr].find((x) => x.id === estado.farmaco);
    esquema.configurar({ plegamiento: DATOS.transportadores[estado.tr].plegamiento, transportador: estado.tr, farmaco,
      colorSustrato: { DAT: '#e64d7b', SERT: '#e8a33d', NET: '#3ca7d9', VMAT2: '#e64d7b' }[estado.tr] });
    $('#lado-arriba').textContent = f.lados[0]; $('#lado-abajo').textContent = f.lados[1];
  }

  // ------------------------------------------------------------ estructura
  function renderChipsEstructuras() {
    const t = DATOS.transportadores[estado.tr]; const cont = $('#estructuras-chips'); cont.innerHTML = '';
    for (const e of t.estructuras) {
      cont.append(h('button', { class: 'chip peq', 'aria-pressed': String(e.id === estado.estructura), onclick: () => seleccionarEstructura(e.id) },
        `${e.id} · ${nombreLig(e.ligando)}`));
    }
  }
  function seleccionarEstructura(id) {
    estado.estructura = id;
    renderChipsEstructuras();
    if (estado.modo !== 'estructura') return;
    $('#cargando').classList.remove('oculto');
    // dar un cuadro al navegador para pintar el indicador
    requestAnimationFrame(() => setTimeout(() => {
      if (estado.modo !== 'estructura') { $('#cargando').classList.add('oculto'); return; }
      try {
        estructura.cargar(estado.tr, id);
        salirMorphUI();
      } catch (err) {
        console.error(err); $('#aviso3d').textContent = 'No se pudo mostrar la estructura: ' + err.message; $('#aviso3d').classList.add('visible');
      }
      $('#cargando').classList.add('oculto');
      renderContactos(); renderCompuertas(); renderTM(); renderFuentes();
      const e = estructuraActual();
      $('#fase').textContent = `${e.id} · ${window.FICHAS[estado.tr].sigla} + ${nombreLig(e.ligando)} · ${e.conformacion.esperada}${e.conformacion.coincide ? ' (medido)' : ''}`;
      $('#btn-morph').disabled = !estructura.morphDisponible();
    }, 20));
  }
  function salirMorphUI() {
    $('#btn-morph').setAttribute('aria-pressed', 'false'); $('#morph-rango').hidden = true; $('#btn-morph-anim').hidden = true;
  }

  // ------------------------------------------------------------ navegación
  function cambiarTransportador(tr) {
    estado.tr = tr; estado.farmaco = 'ninguno';
    estado.estructura = DATOS.transportadores[tr].estructuras[0].id;
    $$('.transportadores .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tr === tr)));
    document.documentElement.style.setProperty('--acento', { DAT: '#b3512a', SERT: '#7a4bb8', NET: '#1f7fa8', VMAT2: '#b83a6a' }[tr]);
    renderPaneles(); renderChipsEstructuras();
    if (estado.modo === 'esquema') configurarEsquema(); else seleccionarEstructura(estado.estructura);
  }

  function cambiarModo(modo) {
    estado.modo = modo;
    $$('.modos .seg').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === modo)));
    const enEsq = modo === 'esquema';
    $('#vista-esquema').hidden = !enEsq; $('#vista-estructura').hidden = enEsq;
    $('#ctl-esquema').hidden = !enEsq; $('#ctl-estructura').hidden = enEsq;
    $('#aviso3d').classList.remove('visible');
    renderPaneles();
    if (enEsq) {
      if (estructura && estructura.viewer) { estructura.salirMorph(); estructura.viewer.stopAnimate(); }
      if (!esquema) {
        try { esquema = new window.Esquema($('#vista-esquema'), { onFase: (t) => { $('#fase').textContent = t; } }); esquema.setTema(paleta()); }
        catch (err) { console.error(err); $('#aviso3d').textContent = 'WebGL no disponible para el esquema: ' + err.message; $('#aviso3d').classList.add('visible'); return; }
      }
      esquema.redimensionar(); configurarEsquema(); esquema.play(); $('#btn-play').setAttribute('aria-pressed', 'true'); $('#btn-play').textContent = '⏸ Pausa';
    } else {
      if (esquema) esquema.pause();
      if (!estructura) {
        estructura = new window.Estructura($('#vista-estructura'), DATOS, PDBS, { onClickAtomo: (txt) => toast(txt) });
        estructura.setTema(paleta());
      }
      seleccionarEstructura(estado.estructura || DATOS.transportadores[estado.tr].estructuras[0].id);
    }
  }

  function enlazarControles() {
    $('#btn-tema').addEventListener('click', () => aplicarTema(temaActual() === 'dark' ? 'light' : 'dark'));
    $$('.transportadores .chip').forEach((b) => b.addEventListener('click', () => cambiarTransportador(b.dataset.tr)));
    $$('.modos .seg').forEach((b) => b.addEventListener('click', () => cambiarModo(b.dataset.modo)));
    $('#btn-play').addEventListener('click', (ev) => {
      const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
      ev.currentTarget.setAttribute('aria-pressed', String(on)); ev.currentTarget.textContent = on ? '⏸ Pausa' : '▶ Reproducir';
      if (esquema) { if (on) esquema.play(); else esquema.pause(); }
    });
    $('#btn-velocidad').addEventListener('click', (ev) => {
      estado.velocidad = estado.velocidad >= 2 ? 0.5 : estado.velocidad * 2;
      ev.currentTarget.textContent = `Velocidad ×${estado.velocidad}`; if (esquema) esquema.setVelocidad(estado.velocidad);
    });
    $('#btn-tm-esquema').addEventListener('click', (ev) => {
      const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true'; ev.currentTarget.setAttribute('aria-pressed', String(on)); if (esquema) esquema.setMostrarTM(on);
    });
    $('#btn-sitio').addEventListener('click', () => { estructura && estructura.verSitio(0); salirMorphUI(); });
    $('#btn-completa').addEventListener('click', () => { estructura && estructura.vistaCompleta(); salirMorphUI(); $$('#contactos .fila').forEach((x) => x.setAttribute('aria-pressed', 'false')); });
    $('#btn-membrana').addEventListener('click', (ev) => { const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true'; ev.currentTarget.setAttribute('aria-pressed', String(on)); estructura && estructura.setMembrana(on); });
    $('#btn-etiquetas').addEventListener('click', (ev) => { const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true'; ev.currentTarget.setAttribute('aria-pressed', String(on)); estructura && estructura.setEtiquetas(on); });
    const anim = h('button', { class: 'boton', id: 'btn-morph-anim', hidden: '' }, '▶ Animar');
    $('#morph-rango').before(anim);
    $('#btn-morph').addEventListener('click', (ev) => {
      if (!estructura) return;
      const btn = ev.currentTarget;
      const on = btn.getAttribute('aria-pressed') !== 'true';
      if (on) {
        const mo = DATOS.transportadores[estado.tr].morph;
        $('#cargando').classList.remove('oculto');
        requestAnimationFrame(() => setTimeout(() => {
          const ok = estructura.entrarMorph();
          $('#cargando').classList.add('oculto');
          if (!ok) return;
          btn.setAttribute('aria-pressed', 'true');
          $('#morph-rango').hidden = false; anim.hidden = false; anim.textContent = '▶ Animar'; anim.setAttribute('aria-pressed', 'false');
          $('#morph-a').textContent = mo.base; $('#morph-b').textContent = mo.movil; $('#morph-t').value = 0;
          $('#fase').textContent = `Morph ${mo.base} → ${mo.movil} (interpolación lineal, no física). Superposición: ${mo.superposicion}.`;
        }, 20));
      } else { estructura.salirMorph(); salirMorphUI(); }
    });
    $('#morph-t').addEventListener('input', (ev) => { estructura && estructura.morphSetT(ev.target.value / 100); anim.textContent = '▶ Animar'; anim.setAttribute('aria-pressed', 'false'); });
    anim.addEventListener('click', () => {
      if (!estructura || !estructura.morphActivo) return;
      const on = anim.getAttribute('aria-pressed') !== 'true';
      anim.setAttribute('aria-pressed', String(on)); anim.textContent = on ? '⏸ Detener' : '▶ Animar'; estructura.morphAnimar(on);
    });
    window.addEventListener('resize', () => { if (estructura && estado.modo === 'estructura') estructura.resize(); });
  }

  async function iniciar() {
    let temaGuardado = null;
    try { temaGuardado = localStorage.getItem('tema'); } catch (e) { /* nada */ }
    aplicarTema(temaGuardado || temaActual());
    const paq = await cargarDatos();
    DATOS = paq.datos; PDBS = paq.pdbs;
    window.__DATOS__ = DATOS; // para inspección/pruebas
    enlazarControles();
    estado.estructura = DATOS.transportadores[estado.tr].estructuras[0].id;
    renderChipsEstructuras();
    document.documentElement.style.setProperty('--acento', '#b3512a');
    cambiarModo('esquema');
    const avisos = [];
    for (const [k, t] of Object.entries(DATOS.transportadores)) for (const e of t.estructuras) for (const a of e.avisos) avisos.push(`${e.id}: ${a}`);
    if (avisos.length) { $('#aviso3d').textContent = 'Avisos del procesamiento: ' + avisos.join(' · '); $('#aviso3d').classList.add('visible'); }
    document.documentElement.setAttribute('data-listo', '1');
  }

  iniciar().catch((err) => { console.error(err); $('#fase').textContent = 'Error al iniciar: ' + err.message; });
})();

/* Contenido educativo: fichas por transportador y fármacos.
   Farmacología estándar, sin dosis. Lo estructural (conformaciones medidas) viene de datos.json;
   aquí sólo se indica qué estructura, si la hay, respalda cada fármaco. */
'use strict';

window.FICHAS = {
  DAT: {
    nombre: 'Transportador de dopamina',
    sigla: 'DAT',
    gen: 'SLC6A3',
    cromosoma: '5p15.33',
    tamano: '620 aminoácidos',
    familia: 'SLC6 (plegamiento LeuT, 12 hélices TM)',
    localizacion: 'Membrana plasmática de terminales dopaminérgicas (estriado, núcleo accumbens, corteza prefrontal); también en dendritas y soma.',
    estequiometria: '2 Na⁺ + 1 Cl⁻ cotransportados con 1 dopamina (electrogénico).',
    sustrato: 'Dopamina (también noradrenalina y anfetaminas como sustratos).',
    ciclo: 'Acceso alternante: la conformación abierta hacia fuera une Na⁺, Cl⁻ y dopamina; se ocluye; se abre hacia dentro y libera todo al citosol.',
    nota: 'Recapta la dopamina liberada y termina la señal. Blanco de psicoestimulantes (cocaína, metilfenidato, anfetamina).',
    lados: ['Extracelular', 'Citosol'],
    fuente_ficha: 'Gen, cromosoma y tamaño según UniProt Q01959 (de memoria del modelo: no se pudo consultar UniProt en esta sesión; verificar). Estequiometría: farmacología estándar.',
  },
  SERT: {
    nombre: 'Transportador de serotonina',
    sigla: 'SERT',
    gen: 'SLC6A4',
    cromosoma: '17q11.2',
    tamano: '630 aminoácidos',
    familia: 'SLC6 (plegamiento LeuT, 12 hélices TM)',
    localizacion: 'Membrana plasmática de neuronas serotoninérgicas (núcleos del rafe), plaquetas, epitelio intestinal, placenta.',
    estequiometria: '1 Na⁺ + 1 Cl⁻ hacia dentro con 1 serotonina; 1 K⁺ hacia fuera en el regreso (electroneutro).',
    sustrato: 'Serotonina (5-HT); MDMA y fenfluramina también son sustratos.',
    ciclo: 'Igual que DAT, pero el K⁺ intracelular se une a la conformación abierta hacia dentro y acelera el retorno a la conformación abierta hacia fuera.',
    nota: 'Blanco de los ISRS, los IRSN y muchos tricíclicos. Su inhibición eleva la serotonina sináptica.',
    lados: ['Extracelular', 'Citosol'],
    fuente_ficha: 'Gen, cromosoma y tamaño según UniProt P31645 (de memoria del modelo; verificar). Estequiometría con K⁺: farmacología estándar.',
  },
  NET: {
    nombre: 'Transportador de noradrenalina',
    sigla: 'NET',
    gen: 'SLC6A2',
    cromosoma: '16q12.2',
    tamano: '617 aminoácidos',
    familia: 'SLC6 (plegamiento LeuT, 12 hélices TM)',
    localizacion: 'Membrana plasmática de terminales noradrenérgicas (locus coeruleus, sistema simpático), médula suprarrenal. En corteza prefrontal también recapta dopamina.',
    estequiometria: '1 Na⁺ + 1 Cl⁻ cotransportados con 1 noradrenalina.',
    sustrato: 'Noradrenalina (y dopamina, con afinidad incluso mayor).',
    ciclo: 'Acceso alternante como DAT. En 8HFF hay dos noradrenalinas: una en el sitio central (S1) y otra en el vestíbulo extracelular (S2).',
    nota: 'Blanco de atomoxetina, IRSN, tricíclicos, bupropión y anfetaminas.',
    lados: ['Extracelular', 'Citosol'],
    fuente_ficha: 'Gen, cromosoma y tamaño según UniProt P23975 (de memoria del modelo; verificar). Estequiometría: farmacología estándar.',
  },
  VMAT2: {
    nombre: 'Transportador vesicular de monoaminas 2',
    sigla: 'VMAT2',
    gen: 'SLC18A2',
    cromosoma: '10q25.3',
    tamano: '514 aminoácidos',
    familia: 'SLC18 (superfamilia MFS, 12 hélices TM en dos mitades de 6)',
    localizacion: 'Membrana de vesículas sinápticas de neuronas monoaminérgicas (dopamina, noradrenalina, serotonina, histamina) y de gránulos cromafines.',
    estequiometria: 'Antiporte: 1 monoamina hacia el lumen vesicular por 2 H⁺ hacia el citosol. El gradiente de H⁺ lo genera la V-ATPasa.',
    sustrato: 'Dopamina, noradrenalina, serotonina, histamina; también anfetaminas.',
    ciclo: 'Balanceo (rocker-switch): las mitades N y C giran alrededor del sitio central y lo exponen alternativamente al citosol o al lumen.',
    nota: 'Carga las vesículas para la exocitosis. Blanco de tetrabenazina, valbenazina, deutetrabenazina y reserpina.',
    lados: ['Lumen vesicular', 'Citosol'],
    fuente_ficha: 'Gen, cromosoma y tamaño según UniProt Q05940 (de memoria del modelo; verificar). Estequiometría 2 H⁺ : 1 amina: farmacología estándar.',
  },
};

/* Fármacos por transportador.
   accion: 'inhibidor' fija una conformación; 'liberador' entra como sustrato e invierte el transporte.
   conformacion: la que se muestra en el esquema. Si `estructura` existe, esa conformación se tomó de la
   medida en datos.json de esa estructura; si no, es la típica de su clase y se marca como no medida. */
window.FARMACOS = {
  DAT: [
    { id: 'ninguno', nombre: 'Sin fármaco (dopamina)', accion: 'sustrato' },
    { id: 'cocaina', nombre: 'Cocaína', accion: 'inhibidor', conformacion: 'abierto hacia fuera',
      mecanismo: 'Inhibidor competitivo no selectivo de DAT, NET y SERT: ocupa el sitio central S1 y estabiliza la conformación abierta hacia fuera.',
      clinica: 'Uso médico limitado como anestésico local tópico. Alto potencial de abuso: la elevación de dopamina en el núcleo accumbens explica el refuerzo.' },
    { id: 'metilfenidato', nombre: 'Metilfenidato', accion: 'inhibidor', conformacion: 'abierto hacia fuera', estructura: '8Y2G',
      mecanismo: 'Inhibidor de DAT y NET. En 8Y2G el dexmetilfenidato ocupa el sitio central del DAT en la conformación abierta hacia fuera.',
      clinica: 'Trastorno por déficit de atención e hiperactividad (TDAH) y narcolepsia. Efectos adversos comunes: insomnio, disminución del apetito, taquicardia.' },
    { id: 'bupropion', nombre: 'Bupropión', accion: 'inhibidor', conformacion: 'abierto hacia fuera',
      mecanismo: 'Inhibidor de DAT y NET de baja potencia; no actúa sobre SERT. Conformación mostrada: la típica de los inhibidores del sitio S1 (no medida aquí).',
      clinica: 'Depresión mayor y cese del tabaquismo. Menor disfunción sexual que los ISRS; riesgo de convulsiones en pacientes predispuestos.' },
    { id: 'modafinilo', nombre: 'Modafinilo', accion: 'inhibidor', conformacion: 'abierto hacia fuera',
      mecanismo: 'Inhibidor de DAT de afinidad relativamente baja, considerado atípico. Conformación mostrada: la típica de los inhibidores del sitio S1 (no medida aquí).',
      clinica: 'Narcolepsia, somnolencia por apnea del sueño y trastorno del sueño por turnos.' },
    { id: 'anfetamina', nombre: 'Anfetamina', accion: 'liberador',
      mecanismo: 'Sustrato del DAT: entra al citosol, se acumula, inhibe VMAT2 y promueve el transporte inverso (eflujo de dopamina por el propio DAT).',
      clinica: 'TDAH y narcolepsia. Potencial de abuso; efectos simpaticomiméticos (hipertensión, taquicardia, hipertermia).' },
  ],
  SERT: [
    { id: 'ninguno', nombre: 'Sin fármaco (serotonina)', accion: 'sustrato' },
    { id: 'escitalopram', nombre: 'Escitalopram', accion: 'inhibidor', conformacion: 'abierto hacia fuera', estructura: '5I71',
      mecanismo: 'ISRS: S-enantiómero del citalopram. En 5I71 ocupa el sitio central del SERT en la conformación abierta hacia fuera.',
      clinica: 'Depresión mayor y trastorno de ansiedad generalizada. Efectos de clase: náusea, disfunción sexual, riesgo de síndrome serotoninérgico con otros serotoninérgicos.' },
    { id: 'isrs', nombre: 'Otros ISRS (paroxetina, fluoxetina, sertralina)', accion: 'inhibidor', conformacion: 'abierto hacia fuera', estructura: '5I6X',
      mecanismo: 'Inhibidores selectivos de la recaptura de serotonina. La paroxetina (5I6X) ocupa el sitio central del SERT en la conformación abierta hacia fuera.',
      clinica: 'Depresión, trastornos de ansiedad, trastorno obsesivo-compulsivo, trastorno de pánico, TEPT. La paroxetina es la más anticolinérgica y con más síndrome de retirada; la fluoxetina tiene la vida media más larga.' },
    { id: 'clomipramina', nombre: 'Clomipramina', accion: 'inhibidor', conformacion: 'abierto hacia fuera',
      mecanismo: 'Antidepresivo tricíclico con inhibición muy potente del SERT; su metabolito desmetilclomipramina inhibe NET. Conformación mostrada: la típica de los inhibidores del sitio S1 (no medida aquí).',
      clinica: 'Trastorno obsesivo-compulsivo (referencia histórica), depresión. Efectos anticolinérgicos, sedación, cardiotoxicidad en sobredosis.' },
    { id: 'mdma', nombre: 'MDMA', accion: 'liberador',
      mecanismo: 'Sustrato de SERT (y de NET/DAT): entra al citosol, inhibe VMAT2 y provoca liberación masiva de serotonina por transporte inverso.',
      clinica: 'Sin uso clínico aprobado (en investigación para TEPT). Riesgos: hipertermia, hiponatremia, síndrome serotoninérgico.' },
  ],
  NET: [
    { id: 'ninguno', nombre: 'Sin fármaco (noradrenalina)', accion: 'sustrato' },
    { id: 'atomoxetina', nombre: 'Atomoxetina', accion: 'inhibidor', conformacion: 'abierto hacia fuera', estructura: '8ZP2',
      mecanismo: 'Inhibidor selectivo del NET. En 8ZP2 ocupa el sitio central del NET en la conformación abierta hacia fuera.',
      clinica: 'TDAH (no estimulante, sin potencial de abuso). Metabolismo por CYP2D6; puede elevar la presión arterial y la frecuencia cardiaca.' },
    { id: 'irsn', nombre: 'Venlafaxina y duloxetina (IRSN)', accion: 'inhibidor', conformacion: 'abierto hacia fuera',
      mecanismo: 'Inhibidores de la recaptura de serotonina y noradrenalina. La venlafaxina inhibe SERT con más potencia que NET; la duloxetina es más equilibrada. Conformación mostrada: típica de inhibidores del sitio S1 (no medida aquí).',
      clinica: 'Depresión y trastornos de ansiedad; duloxetina también en dolor neuropático diabético y fibromialgia. La venlafaxina puede elevar la presión arterial y tiene síndrome de retirada marcado.' },
    { id: 'desipramina', nombre: 'Desipramina', accion: 'inhibidor', conformacion: 'abierto hacia fuera',
      mecanismo: 'Antidepresivo tricíclico con preferencia por NET (amina secundaria). Conformación mostrada: típica de inhibidores del sitio S1 (no medida aquí).',
      clinica: 'Depresión (uso actual limitado). Menos sedante y anticolinérgica que los tricíclicos terciarios; cardiotoxicidad en sobredosis.' },
    { id: 'anfetamina', nombre: 'Anfetamina', accion: 'liberador',
      mecanismo: 'Sustrato del NET: entra al citosol y provoca eflujo de noradrenalina por transporte inverso; también inhibe VMAT2.',
      clinica: 'TDAH y narcolepsia. Efectos simpaticomiméticos periféricos por la liberación de noradrenalina.' },
  ],
  VMAT2: [
    { id: 'ninguno', nombre: 'Sin fármaco (monoamina)', accion: 'sustrato' },
    { id: 'tetrabenazina', nombre: 'Tetrabenazina', accion: 'inhibidor', conformacion: 'ocluido hacia el lumen', estructura: '8T69',
      mecanismo: 'Inhibidor reversible de VMAT2: se une al sitio central e impide la carga vesicular de monoaminas (depleción presináptica). Conformación mostrada según la esperada para 8T69.',
      clinica: 'Corea de la enfermedad de Huntington. Efectos adversos: depresión e ideación suicida, parkinsonismo, sedación, acatisia.' },
    { id: 'valbenazina', nombre: 'Valbenazina y deutetrabenazina', accion: 'inhibidor', conformacion: 'ocluido hacia el lumen', estructura: '8T69',
      mecanismo: 'Valbenazina es profármaco de la (+)-α-dihidrotetrabenazina; deutetrabenazina es tetrabenazina deuterada (metabolismo más lento). Comparten el sitio de la tetrabenazina (inferido por el mismo farmacóforo).',
      clinica: 'Discinesia tardía (ambas) y corea de Huntington (deutetrabenazina). Perfil similar a tetrabenazina con dosificación más cómoda.' },
    { id: 'reserpina', nombre: 'Reserpina', accion: 'inhibidor', conformacion: 'abierto al citosol', estructura: '8T6A',
      mecanismo: 'Inhibidor de VMAT1 y VMAT2 de acción prolongada (unión casi irreversible): depleta las monoaminas de las vesículas. En 8T6A se une a la conformación abierta al citosol.',
      clinica: 'Antihipertensivo de uso histórico. Efectos adversos: depresión, congestión nasal, bradicardia, síntomas extrapiramidales.' },
    { id: 'anfetamina', nombre: 'Anfetamina', accion: 'liberador',
      mecanismo: 'Base débil que entra a la vesícula, disipa el gradiente de H⁺ e inhibe VMAT2: las monoaminas salen de la vesícula al citosol y de ahí, por transporte inverso en DAT/NET/SERT, a la sinapsis.',
      clinica: 'TDAH y narcolepsia. La depleción vesicular contribuye a la tolerancia y a la neurotoxicidad con uso crónico.' },
  ],
};

/* Nombres en español de los ligandos; el nombre original de _chem_comp se conserva en datos.json. */
window.NOMBRES_LIGANDO = {
  LDP: 'dopamina', A1D5U: 'dexmetilfenidato', '8PR': 'paroxetina', '68P': 'escitalopram', LNR: 'noradrenalina',
  A1LX4: 'atomoxetina', YHL: 'tetrabenazina', YHR: 'reserpina',
};

window.ESQUEMA_TEXTOS = {
  LeuT: {
    fases: [
      'Abierto hacia fuera: Na⁺, Cl⁻ y el sustrato entran por el vestíbulo extracelular al sitio central S1.',
      'Ocluido: la tapa aromática (Tyr/Phe) y el puente salino cierran el lado extracelular; el sustrato queda atrapado.',
      'Abierto hacia dentro: el haz (TM1, 2, 6, 7) gira respecto al andamio (TM3, 4, 8, 9); el Na2 se libera y el sustrato cae al citosol.',
      'Retorno: el transportador vacío vuelve a abrirse hacia fuera.',
    ],
    retornoK: 'Retorno: el K⁺ citosólico se une a la forma abierta hacia dentro y acelera el regreso a la forma abierta hacia fuera.',
    inhibidor: 'Inhibidor unido en S1: el transportador queda fijo en la conformación «{conf}»; el sustrato no puede entrar.',
    liberador: 'Liberador: entra como sustrato, se acumula en el citosol y el transportador funciona al revés (eflujo).',
  },
  MFS: {
    fases: [
      'Abierto al citosol: 2 H⁺ salen al citosol y la monoamina citosólica entra al sitio central.',
      'Balanceo (rocker-switch): las mitades N y C giran alrededor del sitio central.',
      'Abierto al lumen: la monoamina se libera dentro de la vesícula y 2 H⁺ del lumen ocupan el sitio.',
      'Balanceo de regreso al citosol con los 2 H⁺ unidos.',
    ],
    inhibidor: 'Inhibidor unido en el sitio central: VMAT2 queda fijo en la conformación «{conf}»; la vesícula no se carga.',
    liberador: 'Anfetamina: base débil que disipa el gradiente de H⁺; las monoaminas escapan de la vesícula al citosol.',
  },
};

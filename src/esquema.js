/* Esquema animado (three.js r158, global THREE).
   Plegamiento LeuT (DAT/SERT/NET): 12 hélices, haz (TM1,2,6,7) que gira respecto al andamio (TM3,4,8,9);
   TM1 y TM6 partidas en el centro. Plegamiento MFS (VMAT2): dos mitades de 6 hélices en balanceo.
   Las posiciones de las hélices son esquemáticas (no a escala ni tomadas de coordenadas reales). */
'use strict';

(function () {
  const H = 1.5;          // semiespesor de la membrana (unidades de escena)
  const L = 3.4;          // largo de una hélice
  const R = 0.24;         // radio de una hélice

  // Posiciones esquemáticas (x, z) vistas desde arriba.
  const POS_LEUT = {
    1: [-0.55, 0.35], 2: [-1.15, 0.75], 6: [-0.55, -0.45], 7: [-1.15, -0.85],
    3: [0.45, 0.6], 4: [1.1, 1.0], 8: [0.45, -0.5], 9: [1.1, -0.95],
    5: [-0.2, 1.45], 10: [-0.2, -1.55], 11: [1.75, 0.3], 12: [2.25, -0.45],
  };
  const POS_MFS = {
    1: [-0.35, 0.9], 2: [-0.95, 1.1], 3: [-1.5, 0.5], 4: [-1.5, -0.5], 5: [-0.95, -1.1], 6: [-0.35, -0.9],
    7: [0.35, 0.9], 8: [0.95, 1.1], 9: [1.5, 0.5], 10: [1.5, -0.5], 11: [0.95, -1.1], 12: [0.35, -0.9],
  };
  const HAZ = [1, 2, 6, 7], ANDAMIO = [3, 4, 8, 9];
  const SITIO = { x: -0.05, y: 0.1, z: 0.05 };

  function suave(a) { a = Math.max(0, Math.min(1, a)); return a * a * (3 - 2 * a); }
  // Interpola una pista de claves [[t, v...], ...] con t en [0,1] (suavizado entre claves)
  function pista(claves, t) {
    if (t <= claves[0][0]) return claves[0].slice(1);
    for (let i = 1; i < claves.length; i++) {
      if (t <= claves[i][0]) {
        const a = claves[i - 1], b = claves[i];
        const f = suave((t - a[0]) / (b[0] - a[0] || 1));
        return a.slice(1).map((v, k) => v + (b[k + 1] - v) * f);
      }
    }
    return claves[claves.length - 1].slice(1);
  }

  class Esquema {
    constructor(el, opciones) {
      this.el = el;
      this.op = Object.assign({ onFase: () => {} }, opciones);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      el.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      this.camera.position.set(0, 2.7, 8.6);
      this.camera.lookAt(0, -0.1, 0);
      this.t = 0; this.velocidad = 1; this.reproduciendo = true; this.mostrarTM = true;
      this._ultimo = null; this._faseTxt = '';
      this.ro = new ResizeObserver(() => this.redimensionar());
      this.ro.observe(el);
      this.redimensionar();
      this._arrastre = null;
      this.giro = 0;
      const dom = this.renderer.domElement;
      dom.addEventListener('pointerdown', (e) => { this._arrastre = { x: e.clientX, g: this.giro }; dom.setPointerCapture(e.pointerId); });
      dom.addEventListener('pointermove', (e) => { if (this._arrastre) { this.giro = this._arrastre.g + (e.clientX - this._arrastre.x) * 0.01; this._dibujar(); } });
      dom.addEventListener('pointerup', () => { this._arrastre = null; });
      dom.addEventListener('pointercancel', () => { this._arrastre = null; });
      this.renderer.setAnimationLoop((ms) => this._paso(ms));
    }

    redimensionar() {
      const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
      this.renderer.setSize(w, h, true);
      this.camera.aspect = w / h;
      // que quepan ~7 unidades de ancho
      const d = this.camera.position.length();
      const fovH = 2 * Math.atan(3.6 / (d * this.camera.aspect)) * 180 / Math.PI;
      this.camera.fov = Math.max(36, fovH);
      this.camera.updateProjectionMatrix();
      this._dibujar();
    }

    setTema(paleta) { this.paleta = paleta; if (this.cfg) this.configurar(this.cfg); }
    play() { this.reproduciendo = true; }
    pause() { this.reproduciendo = false; }
    setVelocidad(v) { this.velocidad = v; }
    setMostrarTM(v) { this.mostrarTM = v; for (const s of this.etiquetas || []) s.visible = v; this._dibujar(); }

    dispose() {
      this.renderer.setAnimationLoop(null);
      this.ro.disconnect();
      this._limpiar();
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }

    _limpiar() {
      this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    }

    _material(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }); }

    _etiqueta(texto, color) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const g = c.getContext('2d');
      g.font = 'bold 40px Atkinson Hyperlegible, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color; g.fillText(texto, 64, 34);
      const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      s.scale.set(0.56, 0.28, 1);
      s.visible = this.mostrarTM;
      this.etiquetas.push(s);
      return s;
    }

    _helice(n, color, partida) {
      const g = new THREE.Group();
      if (partida) {
        const mitad = L / 2 - 0.22;
        const geo = new THREE.CylinderGeometry(R, R, mitad, 14, 1);
        const a = new THREE.Mesh(geo, this._material(color)); a.position.y = mitad / 2 + 0.22; a.rotation.z = 0.28;
        const b = new THREE.Mesh(geo, this._material(color)); b.position.y = -(mitad / 2 + 0.22); b.rotation.z = -0.28;
        g.add(a, b);
      } else {
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 14, 1), this._material(color)));
      }
      const e = this._etiqueta('' + n, this.paleta.fg); e.position.y = L / 2 + 0.42; g.add(e);
      return g;
    }

    _esfera(r, color, opacidad) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.4, transparent: true, opacity: opacidad == null ? 1 : opacidad }));
      m.visible = false; this.scene.add(m); return m;
    }
    _capsula(color) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 6, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.35, transparent: true, opacity: 1 }));
      m.rotation.z = Math.PI / 2; m.visible = false; this.scene.add(m); return m;
    }

    _membrana() {
      const mat = new THREE.MeshBasicMaterial({ color: this.paleta.fg2, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      for (const y of [H, -H]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 4.6), mat); p.rotation.x = -Math.PI / 2; p.position.y = y; this.scene.add(p);
      }
      const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.25); this.scene.add(hemi);
      const luz = new THREE.DirectionalLight(0xffffff, 1.1); luz.position.set(3, 6, 5); this.scene.add(luz);
      const luz2 = new THREE.DirectionalLight(0xffffff, 0.35); luz2.position.set(-4, -2, -3); this.scene.add(luz2);
    }

    /* cfg: { plegamiento:'LeuT'|'MFS', transportador, farmaco:{accion, conformacion, id}, colores } */
    configurar(cfg) {
      this.cfg = cfg;
      this._limpiar();
      this.etiquetas = [];
      this.raiz = new THREE.Group(); this.scene.add(this.raiz);
      this._membrana();
      const p = this.paleta;
      if (cfg.plegamiento === 'LeuT') {
        this.haz = new THREE.Group(); this.andamio = new THREE.Group();
        this.raiz.add(this.haz, this.andamio);
        for (let n = 1; n <= 12; n++) {
          const [x, z] = POS_LEUT[n];
          const col = HAZ.includes(n) ? p.haz : ANDAMIO.includes(n) ? p.andamio : p.perif;
          const h = this._helice(n, col, n === 1 || n === 6);
          h.position.set(x, 0, z);
          (HAZ.includes(n) ? this.haz : this.andamio).add(h);
        }
        // compuertas: tapa aromática (arriba) y puente salino interno (abajo)
        this.tapa = [this._esfera(0.13, p.andamio), this._esfera(0.13, p.haz)];
        this.puerta = [this._esfera(0.11, p.andamio), this._esfera(0.11, p.haz)];
        for (const s of [...this.tapa, ...this.puerta]) { s.visible = true; s.material.opacity = 0.9; }
      } else {
        this.mitadN = new THREE.Group(); this.mitadC = new THREE.Group();
        this.raiz.add(this.mitadN, this.mitadC);
        for (let n = 1; n <= 12; n++) {
          const [x, z] = POS_MFS[n];
          const h = this._helice(n, n <= 6 ? p.mitadN : p.mitadC, false);
          h.position.set(x, 0, z);
          (n <= 6 ? this.mitadN : this.mitadC).add(h);
        }
      }
      // partículas
      this.sustrato = this._esfera(0.23, cfg.colorSustrato || '#e64d7b');
      this.na = [this._esfera(0.13, '#e0b000'), this._esfera(0.13, '#e0b000')];
      this.cl = this._esfera(0.16, '#2fa860');
      this.k = this._esfera(0.15, '#8e5bd6');
      this.h = [this._esfera(0.1, '#ff6b6b'), this._esfera(0.1, '#ff6b6b')];
      this.farmaco = this._capsula(cfg.farmaco && cfg.farmaco.accion === 'liberador' ? '#f39c12' : '#d7263d');
      this.extras = [];
      for (let i = 0; i < 5; i++) this.extras.push(this._esfera(0.15, cfg.colorSustrato || '#e64d7b'));
      for (let i = 0; i < 6; i++) this.extras.push(this._esfera(0.08, '#ff6b6b'));
      this._pistas = this._construirPistas(cfg);
      this.t = 0; this._faseTxt = '';
      this._dibujar();
    }

    // Devuelve { periodo, s(t), particulas: [{mesh, claves:[[t,x,y,vis]...]}], fase(t) }
    _construirPistas(cfg) {
      const f = cfg.farmaco || { accion: 'sustrato' };
      const T = window.ESQUEMA_TEXTOS[cfg.plegamiento];
      const S = SITIO;
      const nNa = cfg.transportador === 'DAT' ? 2 : 1;
      const P = [];
      const parti = (mesh, claves) => P.push({ mesh, claves });
      const confS = { 'abierto hacia fuera': 1, 'ocluido': 0, 'abierto hacia dentro': -1,
                      'ocluido hacia el lumen': 0.25, 'abierto al citosol': -1, 'abierto al lumen': 1 };

      if (cfg.plegamiento === 'LeuT') {
        if (f.accion === 'inhibidor') {
          const s = confS[f.conformacion] == null ? 1 : confS[f.conformacion];
          parti(this.farmaco, [[0, S.x, S.y, 1]]);
          for (let i = 0; i < nNa; i++) parti(this.na[i], [[0, S.x - 0.35, S.y + 0.45 - 0.6 * i, 1]]);
          parti(this.cl, [[0, S.x + 0.4, S.y + 0.35, 1]]);
          // el sustrato intenta entrar y rebota
          parti(this.sustrato, [[0, 0.1, 3.2, 1], [0.45, 0.05, 1.95, 1], [0.9, 0.1, 3.2, 1], [1, 0.1, 3.2, 0]]);
          return { periodo: 3.2, s: () => s, particulas: P,
            fase: () => T.inhibidor.replace('{conf}', f.conformacion) };
        }
        if (f.accion === 'liberador') {
          // entra el liberador (cara externa), se libera dentro; luego el sustrato citosólico sale (eflujo)
          const s = [[0, 1], [0.17, 1], [0.26, 0], [0.34, 0], [0.42, -1], [0.62, -1], [0.72, 0], [0.8, 1], [1, 1]];
          parti(this.farmaco, [[0, 0.2, 3.2, 1], [0.17, S.x, S.y, 1], [0.42, S.x, S.y, 1], [0.5, S.x, -3.2, 1], [0.52, S.x, -3.2, 0]]);
          for (let i = 0; i < nNa; i++) parti(this.na[i], [[0, -0.5 + 0.3 * i, 3.4, 1], [0.17, S.x - 0.35, S.y + 0.45 - 0.6 * i, 1], [0.42, S.x - 0.35, S.y + 0.45 - 0.6 * i, 1], [0.5, S.x - 0.5, -3.3, 1], [0.52, S.x - 0.5, -3.3, 0]]);
          parti(this.cl, [[0, 0.6, 3.5, 1], [0.17, S.x + 0.4, S.y + 0.35, 1], [0.42, S.x + 0.4, S.y + 0.35, 1], [0.5, S.x + 0.5, -3.3, 1], [0.52, S.x + 0.5, -3.3, 0]]);
          parti(this.sustrato, [[0.5, -0.3, -3.2, 0], [0.52, -0.3, -3.2, 1], [0.62, S.x, S.y, 1], [0.8, S.x, S.y, 1], [0.92, 0.1, 3.3, 1], [0.94, 0.1, 3.3, 0]]);
          return { periodo: 14, s: (t) => pista(s, t)[0], particulas: P,
            fase: (t) => t < 0.42 ? T.liberador + ' (entra el liberador)' : t < 0.52 ? T.liberador + ' (se libera al citosol)' : T.liberador + ' (transporte inverso: el sustrato citosólico sale)' };
        }
        // ciclo normal
        const s = [[0, 1], [0.21, 1], [0.33, 0], [0.46, 0], [0.58, -1], [0.79, -1], [0.92, 0], [1, 1]];
        parti(this.sustrato, [[0, 0.2, 3.2, 1], [0.21, S.x, S.y, 1], [0.58, S.x, S.y, 1], [0.72, S.x, -3.2, 1], [0.74, S.x, -3.2, 0]]);
        for (let i = 0; i < nNa; i++) parti(this.na[i], [[0, -0.5 + 0.3 * i, 3.4, 1], [0.21, S.x - 0.35, S.y + 0.45 - 0.6 * i, 1], [0.6, S.x - 0.35, S.y + 0.45 - 0.6 * i, 1], [0.74, S.x - 0.5, -3.3, 1], [0.76, S.x - 0.5, -3.3, 0]]);
        parti(this.cl, [[0, 0.6, 3.5, 1], [0.21, S.x + 0.4, S.y + 0.35, 1], [0.62, S.x + 0.4, S.y + 0.35, 1], [0.76, S.x + 0.5, -3.3, 1], [0.78, S.x + 0.5, -3.3, 0]]);
        if (cfg.transportador === 'SERT') {
          parti(this.k, [[0, 0.1, 1.2, 1], [0.08, 0.2, 3.3, 1], [0.1, 0.2, 3.3, 0], [0.7, 0.1, -3.2, 0], [0.72, 0.1, -3.2, 1], [0.8, S.x, S.y, 1], [1, S.x, S.y, 1]]);
        }
        return { periodo: 12, s: (t) => pista(s, t)[0], particulas: P,
          fase: (t) => t < 0.21 ? T.fases[0] : t < 0.46 ? T.fases[1] : t < 0.79 ? T.fases[2] : (cfg.transportador === 'SERT' ? T.retornoK : T.fases[3]) };
      }

      // ---- MFS (VMAT2)
      if (f.accion === 'inhibidor') {
        const s = confS[f.conformacion] == null ? 0 : confS[f.conformacion];
        parti(this.farmaco, [[0, 0, S.y, 1]]);
        parti(this.sustrato, [[0, 0.1, -3.2, 1], [0.45, 0.05, -1.95, 1], [0.9, 0.1, -3.2, 1], [1, 0.1, -3.2, 0]]);
        return { periodo: 3.2, s: () => s, particulas: P, fase: () => T.inhibidor.replace('{conf}', f.conformacion) };
      }
      if (f.accion === 'liberador') {
        // anfetamina: transportador fijo abierto al citosol con el fármaco; H⁺ del lumen desaparecen, aminas escapan
        parti(this.farmaco, [[0, 0, S.y, 1]]);
        for (let i = 0; i < 6; i++) {
          const x = -2.6 + i * 1.05, y0 = 2.1 + (i % 3) * 0.35;
          parti(this.extras[5 + i], [[0, x, y0, 1], [0.25 + 0.08 * i, x, y0, 1], [0.45 + 0.08 * i, x + 0.3, y0 + 0.6, 0]]);
        }
        for (let i = 0; i < 5; i++) {
          const x = (i % 2 ? 2.9 : -2.9) + (i - 2) * 0.15, y0 = 2.2 + i * 0.25;
          parti(this.extras[i], [[0, x, y0, 1], [0.3 + 0.1 * i, x, y0, 1], [0.7 + 0.06 * i, x, -3.2, 1], [0.72 + 0.06 * i, x, -3.2, 0]]);
        }
        return { periodo: 9, s: () => -1, particulas: P, fase: () => T.liberador };
      }
      const s = [[0, -1], [0.2, -1], [0.32, 1], [0.62, 1], [0.74, -1], [1, -1]];
      parti(this.sustrato, [[0.06, 0, -3.2, 0], [0.08, 0, -3.2, 1], [0.2, 0, S.y, 1], [0.32, 0, S.y, 1], [0.44, 0.1, 3.2, 1], [0.46, 0.1, 3.2, 0]]);
      for (let i = 0; i < 2; i++) {
        parti(this.h[i], [[0, -0.3 + 0.6 * i, S.y + 0.3, 1], [0.1, -0.5 + 1.0 * i, -3.2, 1], [0.12, 0, -3.2, 0], [0.4, -0.4 + 0.8 * i, 3.2, 0], [0.42, -0.4 + 0.8 * i, 3.2, 1], [0.52, -0.3 + 0.6 * i, S.y + 0.3, 1], [1, -0.3 + 0.6 * i, S.y + 0.3, 1]]);
      }
      return { periodo: 12, s: (t) => pista(s, t)[0], particulas: P,
        fase: (t) => t < 0.2 ? T.fases[0] : t < 0.32 ? T.fases[1] : t < 0.62 ? T.fases[2] : T.fases[3] };
    }

    _paso(ms) {
      if (this._ultimo == null) this._ultimo = ms;
      const dt = Math.min(0.1, (ms - this._ultimo) / 1000); this._ultimo = ms;
      if (!this.cfg || document.hidden) return;
      if (this.reproduciendo) { this.t = (this.t + dt * this.velocidad / this._pistas.periodo) % 1; this._dibujar(); }
    }

    _dibujar() {
      if (!this.cfg || !this._pistas) { this.renderer.render(this.scene, this.camera); return; }
      const t = this.t, pk = this._pistas;
      const s = pk.s(t);
      this.raiz.rotation.y = this.giro;
      if (this.cfg.plegamiento === 'LeuT') {
        this.haz.rotation.z = 0.3 * s;
        const ab = Math.max(0, s), ad = Math.max(0, -s);
        this.tapa[0].position.set(-0.32 - 0.4 * ab, 1.35, 0.15); this.tapa[1].position.set(0.32 + 0.4 * ab, 1.35, 0.15);
        this.puerta[0].position.set(-0.3 - 0.4 * ad, -1.35, 0.1); this.puerta[1].position.set(0.3 + 0.4 * ad, -1.35, 0.1);
        for (const m of [...this.tapa, ...this.puerta]) m.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.giro);
      } else {
        this.mitadN.rotation.z = 0.26 * s; this.mitadC.rotation.z = -0.26 * s;
      }
      for (const p of pk.particulas) {
        const [x, y, vis] = pista(p.claves, t);
        p.mesh.visible = vis > 0.02;
        p.mesh.material.opacity = Math.min(1, vis);
        p.mesh.position.set(x, y, 0.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.giro);
      }
      const txt = pk.fase(t);
      if (txt !== this._faseTxt) { this._faseTxt = txt; this.op.onFase(txt); }
      this.renderer.render(this.scene, this.camera);
    }
  }

  window.Esquema = Esquema;
})();

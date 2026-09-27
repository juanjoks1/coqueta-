/* Modo "estructura real" con 3Dmol.js 2.5.5 (global $3Dmol).
   Recibe los PDB procesados (orientados: membrana ⟂ y, extracelular/lumen hacia +y) y datos.json. */
'use strict';

(function () {
  const COLOR_ION = { NA: '#e0b000', CL: '#2fa860', K: '#8e5bd6' };
  const RADIO_ION = { NA: 1.0, CL: 1.2, K: 1.2 };

  class Estructura {
    constructor(el, datos, pdbs, opciones) {
      this.el = el; this.datos = datos; this.pdbs = pdbs;
      this.op = Object.assign({ onClickAtomo: () => {}, onListo: () => {} }, opciones);
      this.viewer = null; this.paleta = null;
      this.mostrarMembrana = true; this.mostrarEtiquetas = true;
      this.resaltado = null; this.morphActivo = false; this.animando = false;
      this.modelo = null; this.modeloMorph = null; this.est = null; this.tr = null;
    }

    setTema(paleta) {
      this.paleta = paleta;
      if (this.viewer) { this.viewer.setBackgroundColor(paleta.bg); this._decorar(); this.viewer.render(); }
    }

    _crear() {
      if (this.viewer) return;
      this.viewer = $3Dmol.createViewer(this.el, { backgroundColor: this.paleta.bg, antialias: true, disableFog: false });
      const self = this;
      // detección de toque simple: 3Dmol ya distingue clic de arrastre
      this.viewer.setClickable({}, true, function (atomo) { self._clic(atomo); });
    }

    resize() { if (this.viewer) { this.viewer.resize(); this.viewer.render(); } }

    /* Carga una estructura por id (p. ej. '8Y2D'); tr es la clave del transportador. */
    cargar(tr, id) {
      this._crear();
      const t = this.datos.transportadores[tr];
      const est = t.estructuras.find((e) => e.id === id);
      this.tr = tr; this.est = est; this.trDatos = t;
      this.viewer.stopAnimate(); this.animando = false; this.morphActivo = false;
      this.viewer.removeAllModels(); this.viewer.removeAllShapes(); this.viewer.removeAllLabels();
      this.resaltado = null;
      this.modelo = this.viewer.addModel(this.pdbs[id], 'pdb');
      this.modeloMorph = null;
      this._estilos();
      this._decorar();
      this.viewer.zoomTo({ model: this.modelo });
      this.viewer.render();
      this.op.onListo(est);
    }

    _colorTM(n) {
      const p = this.paleta;
      if (this.trDatos.plegamiento === 'MFS') return n <= 6 ? p.mitadN : p.mitadC;
      const g = this.est.grupos;
      if (g['haz central'].includes(n)) return p.haz;
      if (g['andamio'].includes(n)) return p.andamio;
      return p.perif;
    }
    colorResiduo(resi) {
      for (const tm of this.est.tm) if (resi >= tm.ini && resi <= tm.fin) return this._colorTM(tm.n);
      return this.paleta.bucle;
    }
    tmDeResiduo(resi) {
      for (const tm of this.est.tm) if (resi >= tm.ini && resi <= tm.fin) return tm.n;
      return null;
    }

    _estilos(modelo) {
      const v = this.viewer, m = modelo || this.modelo, lig = this.est.ligando.codigo_pdb;
      v.setStyle({ model: m }, { cartoon: { color: this.paleta.bucle, opacity: 1 } });
      for (const tm of this.est.tm) v.setStyle({ model: m, resi: tm.ini + '-' + tm.fin }, { cartoon: { color: this._colorTM(tm.n) } });
      v.setStyle({ model: m, resn: lig }, { stick: { radius: 0.3, colorscheme: this.paleta.ligandoEsquema } });
      for (const ion of Object.keys(COLOR_ION)) v.setStyle({ model: m, resn: ion }, { sphere: { radius: RADIO_ION[ion], color: COLOR_ION[ion] } });
    }

    _decorar() {
      const v = this.viewer;
      if (!this.est) return;
      v.removeAllShapes(); v.removeAllLabels();
      const semi = (this.est.orientacion.espesor || 30) / 2;
      const p = this.paleta;
      if (this.mostrarMembrana) {
        for (const y of [semi, -semi]) {
          v.addBox({ center: { x: 0, y, z: 0 }, dimensions: { w: 95, h: 0.6, d: 95 }, color: p.membrana, alpha: 0.35 });
        }
      }
      if (this.mostrarEtiquetas) {
        const m = this.morphActivo ? this.modeloMorph : this.modelo;
        for (const tm of this.est.tm) {
          const ats = m.selectedAtoms({ atom: 'CA', resi: tm.ini + '-' + tm.fin });
          if (!ats.length) continue;
          // impares en el extremo extracelular/luminal, pares en el citosólico: reparte las etiquetas
          const arriba = tm.n % 2 === 1;
          let ext = ats[0];
          for (const a of ats) if (arriba ? a.y > ext.y : a.y < ext.y) ext = a;
          v.addLabel('TM' + tm.n, { position: { x: ext.x, y: ext.y + (arriba ? 2.5 : -2.5), z: ext.z }, fontColor: p.fg, fontSize: 12,
            backgroundColor: this._colorTM(tm.n), backgroundOpacity: 0.85, borderThickness: 0, inFront: false });
        }
      }
      this._marcarSitios();
    }

    _marcarSitios() {
      const v = this.viewer, p = this.paleta;
      for (const c of this.est.ligando.copias) {
        if (this.est.ligando.copias.length > 1) {
          v.addLabel(c.etiqueta, { position: { x: c.centro[0] + 3, y: c.centro[1] + 3, z: c.centro[2] }, fontColor: p.fg, fontSize: 12,
            backgroundColor: p.bg, backgroundOpacity: 0.8, borderThickness: 0 });
        }
      }
    }

    setMembrana(v) { this.mostrarMembrana = v; this._decorar(); this.viewer.render(); }
    setEtiquetas(v) { this.mostrarEtiquetas = v; this._decorar(); this.viewer.render(); }

    verSitio(copia) {
      const c = (this.est.ligando.copias[copia || 0]);
      const lig = this.est.ligando.codigo_pdb;
      this._salirMorph();
      this._quitarResaltado();
      const sel = { resn: lig, resi: c.resi };
      // residuos de contacto en barras
      const resis = c.residuos.map((r) => r.resi);
      this.viewer.setStyle({ model: this.modelo, resi: resis, not: { atom: ['N', 'C', 'O'] } }, { stick: { radius: 0.18, colorscheme: this.paleta.proteinaEsquema } });
      for (const tm of this.est.tm) this.viewer.addStyle({ model: this.modelo, resi: resis.filter((r) => r >= tm.ini && r <= tm.fin) }, { cartoon: { color: this._colorTM(tm.n) } });
      this.viewer.addStyle({ model: this.modelo, resi: resis.filter((r) => this.tmDeResiduo(r) == null) }, { cartoon: { color: this.paleta.bucle } });
      this._sitioActivo = true;
      this.viewer.zoomTo(sel, 600);
      this.viewer.render();
    }

    vistaCompleta() {
      this._salirMorph();
      this._quitarResaltado();
      this._estilos();
      this._sitioActivo = false;
      this.viewer.zoomTo({ model: this.modelo }, 600);
      this.viewer.render();
    }

    enfocarResiduo(resi, copia) {
      this._salirMorph();
      this._quitarResaltado();
      const r = this.est.ligando.copias[copia || 0].residuos.find((x) => x.resi === resi);
      const lig = this.est.ligando.codigo_pdb;
      this.viewer.addStyle({ model: this.modelo, resi: resi }, { stick: { radius: 0.32, colorscheme: this.paleta.resaltadoEsquema } });
      const ats = this.modelo.selectedAtoms({ resi: resi, atom: 'CA' });
      if (ats.length) {
        const a = ats[0];
        const tm = this.tmDeResiduo(resi);
        this._etiquetaResaltado = this.viewer.addLabel((r ? r.resn : '') + resi + (tm ? ' · TM' + tm : ''),
          { position: { x: a.x, y: a.y + 2, z: a.z }, fontColor: this.paleta.bg, backgroundColor: this.paleta.fg, backgroundOpacity: 0.9, fontSize: 13, borderThickness: 0 });
      }
      this.resaltado = resi;
      this.viewer.zoomTo({ or: [{ resi: resi }, { resn: lig }] }, 500);
      this.viewer.render();
    }

    _quitarResaltado() {
      if (this.resaltado != null) {
        this.viewer.setStyle({ model: this.modelo, resi: this.resaltado }, { cartoon: { color: this.colorResiduo(this.resaltado) } });
        if (this._sitioActivo) {
          this.viewer.addStyle({ model: this.modelo, resi: this.resaltado, not: { atom: ['N', 'C', 'O'] } }, { stick: { radius: 0.18, colorscheme: this.paleta.proteinaEsquema } });
        }
        if (this._etiquetaResaltado) { this.viewer.removeLabel(this._etiquetaResaltado); this._etiquetaResaltado = null; }
        this.resaltado = null;
      }
    }

    _clic(atomo) {
      if (!atomo) return;
      const tm = this.tmDeResiduo(atomo.resi);
      const lig = this.est.ligando;
      let que;
      if (atomo.resn === lig.codigo_pdb) que = `Ligando ${lig.nombre} (${lig.codigo}) · átomo ${atomo.atom} (${atomo.elem})`;
      else if (COLOR_ION[atomo.resn]) que = `Ion ${({ NA: 'Na⁺', CL: 'Cl⁻', K: 'K⁺' })[atomo.resn]} (resi ${atomo.resi})`;
      else que = `${atomo.resn}${atomo.resi} · átomo ${atomo.atom} (${atomo.elem})${tm ? ' · TM' + tm : ' · bucle/terminal'}`;
      if (this._etiquetaClic) this.viewer.removeLabel(this._etiquetaClic);
      this._etiquetaClic = this.viewer.addLabel(que, { position: { x: atomo.x, y: atomo.y, z: atomo.z }, fontColor: this.paleta.bg, backgroundColor: this.paleta.fg,
        backgroundOpacity: 0.92, fontSize: 12, borderThickness: 0, inFront: true });
      this.viewer.render();
      this.op.onClickAtomo(que, atomo);
    }

    /* ---- Morph: la 2.ª estructura del par está superpuesta sobre la 1.ª (andamio) por el script Python.
       Aquí se interpolan linealmente los átomos comunes. */
    morphDisponible() { return !!(this.trDatos && this.trDatos.morph); }

    prepararMorph(nCuadros) {
      const mo = this.trDatos.morph;
      if (!mo || this.modeloMorph) return this.modeloMorph;
      const soloProteina = (txt) => txt.split('\n').filter((l) => l.startsWith('ATOM') || l.startsWith('TER') || l.startsWith('END')).join('\n');
      const pa = soloProteina(this.pdbs[mo.base]), pb = soloProteina(this.pdbs[mo.movil]);
      const mA = this.viewer.addModel(pa, 'pdb');
      const mB = this.viewer.addModel(pb, 'pdb');
      const atsA = mA.selectedAtoms({}), atsB = mB.selectedAtoms({});
      const idx = new Map();
      for (const b of atsB) idx.set(b.chain + '|' + b.resi + '|' + b.resn + '|' + b.atom, b);
      const cuadros = [];
      const N = nCuadros || 12;
      for (let k = 0; k < N; k++) {
        const f = k / (N - 1);
        const fr = new Array(atsA.length);
        for (let i = 0; i < atsA.length; i++) {
          const a = atsA[i], b = idx.get(a.chain + '|' + a.resi + '|' + a.resn + '|' + a.atom);
          fr[i] = b ? [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f] : [a.x, a.y, a.z];
        }
        cuadros.push(fr);
      }
      this.viewer.removeModel(mB);
      mA.setCoordinates(cuadros, 'array');
      this.modeloMorph = mA;
      this.nCuadros = N;
      this._estilosMorph();
      mA.hide();
      return mA;
    }

    _estilosMorph() {
      const v = this.viewer, m = this.modeloMorph;
      v.setStyle({ model: m }, { cartoon: { color: this.paleta.bucle } });
      for (const tm of this.est.tm) v.setStyle({ model: m, resi: tm.ini + '-' + tm.fin }, { cartoon: { color: this._colorTM(tm.n) } });
    }

    entrarMorph() {
      if (!this.morphDisponible()) return false;
      this._quitarResaltado();
      const inicio = performance.now();
      this.prepararMorph(12);
      this.modelo.hide();
      this.modeloMorph.show();
      this.morphActivo = true;
      this.viewer.setFrame(0);
      this._decorar();
      this.viewer.zoomTo({ model: this.modeloMorph }, 400);
      this.viewer.render();
      this.tiempoMorph = performance.now() - inicio;
      return true;
    }

    morphSetT(f) {
      if (!this.morphActivo) return;
      const k = Math.round(f * (this.nCuadros - 1));
      this.viewer.stopAnimate(); this.animando = false;
      this.viewer.setFrame(k).then ? this.viewer.setFrame(k).then(() => this.viewer.render()) : this.viewer.render();
    }

    morphAnimar(on) {
      if (!this.morphActivo) return;
      if (on) { this.viewer.animate({ loop: 'backAndForth', interval: 90 }); this.animando = true; }
      else { this.viewer.stopAnimate(); this.animando = false; }
    }

    _salirMorph() {
      if (!this.morphActivo) return;
      this.viewer.stopAnimate(); this.animando = false;
      this.modeloMorph.hide(); this.modelo.show();
      this.morphActivo = false;
      this._decorar();
      this.viewer.render();
    }
    salirMorph() { this._salirMorph(); }
  }

  window.Estructura = Estructura;
})();

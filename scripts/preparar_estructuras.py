#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Procesa los mmCIF de `estructuras/` y genera `datos/` para el visor.

Uso:
    python3 scripts/preparar_estructuras.py            # procesa todo
    python3 scripts/preparar_estructuras.py --sin-red  # no intenta UniProt/OPM

Salidas:
    datos/procesadas/<ID>.pdb   estructura limpia y orientada (cadena, ligando, iones)
    datos/datos.json            metadatos, TM, contactos, compuertas, morph
    datos/informe.md            resumen legible (compuertas, TM, inferido vs medido)

Todo lo que se marca "inferido" en datos.json proviene de una regla geométrica
definida en este archivo, no de una base de datos externa.
"""
import argparse
import datetime as _dt
import json
import math
import os
import sys
import urllib.request
from collections import defaultdict

import gemmi
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_ESTRUCTURAS = os.path.join(RAIZ, "estructuras")
DIR_DATOS = os.path.join(RAIZ, "datos")
DIR_PROC = os.path.join(DIR_DATOS, "procesadas")
DIR_OPM = os.path.join(DIR_DATOS, "opm")
DIR_UNIPROT = os.path.join(DIR_DATOS, "uniprot")

URL_RCSB = "https://files.rcsb.org/download/{id}.cif"
URL_WWPDB_AWS = ("https://pdbsnapshots.s3.us-west-2.amazonaws.com/20260101/pub/pdb/"
                 "data/structures/divided/mmCIF/{mid}/{idl}.cif.gz")
URL_OPM = "https://opm-assets.storage.googleapis.com/pdb/{idl}.pdb"
URL_UNIPROT = "https://rest.uniprot.org/uniprotkb/{acc}.json"

# --------------------------------------------------------------------------
# Configuración: qué se procesa y qué se mide (todo lo pedido por el usuario)
# --------------------------------------------------------------------------
IONES = {"NA": "Na⁺", "CL": "Cl⁻", "K": "K⁺"}

TRANSPORTADORES = {
    "DAT": {
        "uniprot": "Q01959", "gen": "SLC6A3", "plegamiento": "LeuT",
        "andamio": [3, 4, 8, 9], "haz": [1, 2, 6, 7],
        "estructuras": [
            {"id": "8Y2D", "ligando": "LDP", "pdb_nombre": "LDP",
             "esperada": "ocluido"},
            {"id": "8Y2G", "ligando": "A1D5U", "pdb_nombre": "MPH",
             "esperada": "abierto hacia fuera"},
        ],
        "compuertas": [
            {"nombre": "Compuerta extracelular Tyr156–Phe320", "lado": "extracelular",
             "a": (156, "TYR", ["OH"]), "b": (320, "PHE", ["CZ"]), "tipo": "aromatica"},
            {"nombre": "Puente salino extracelular Arg85–Asp476", "lado": "extracelular",
             "a": (85, "ARG", ["NE", "NH1", "NH2"]), "b": (476, "ASP", ["OD1", "OD2"]), "tipo": "salino"},
            {"nombre": "Puente salino intracelular Arg60–Asp436", "lado": "intracelular",
             "a": (60, "ARG", ["NE", "NH1", "NH2"]), "b": (436, "ASP", ["OD1", "OD2"]), "tipo": "salino"},
        ],
    },
    "SERT": {
        "uniprot": "P31645", "gen": "SLC6A4", "plegamiento": "LeuT",
        "andamio": [3, 4, 8, 9], "haz": [1, 2, 6, 7],
        "estructuras": [
            {"id": "5I6X", "ligando": "8PR", "pdb_nombre": "8PR",
             "esperada": "abierto hacia fuera"},
            {"id": "5I71", "ligando": "68P", "pdb_nombre": "68P",
             "esperada": "abierto hacia fuera"},
        ],
        "compuertas": [
            {"nombre": "Compuerta extracelular Tyr176–Phe335", "lado": "extracelular",
             "a": (176, "TYR", ["OH"]), "b": (335, "PHE", ["CZ"]), "tipo": "aromatica"},
            {"nombre": "Puente salino extracelular Arg104–Glu493", "lado": "extracelular",
             "a": (104, "ARG", ["NE", "NH1", "NH2"]), "b": (493, "GLU", ["OE1", "OE2"]), "tipo": "salino"},
        ],
    },
    "NET": {
        "uniprot": "P23975", "gen": "SLC6A2", "plegamiento": "LeuT",
        "andamio": [3, 4, 8, 9], "haz": [1, 2, 6, 7],
        "estructuras": [
            {"id": "8HFF", "ligando": "LNR", "pdb_nombre": "LNR",
             "esperada": "abierto hacia dentro"},
            {"id": "8ZP2", "ligando": "A1LX4", "pdb_nombre": "ATX",
             "esperada": "abierto hacia fuera"},
        ],
        "compuertas": [
            {"nombre": "Compuerta extracelular Tyr152–Phe317", "lado": "extracelular",
             "a": (152, "TYR", ["OH"]), "b": (317, "PHE", ["CZ"]), "tipo": "aromatica"},
            {"nombre": "Puente salino extracelular Arg81–Asp473", "lado": "extracelular",
             "a": (81, "ARG", ["NE", "NH1", "NH2"]), "b": (473, "ASP", ["OD1", "OD2"]), "tipo": "salino"},
        ],
    },
    "VMAT2": {
        "uniprot": "Q05940", "gen": "SLC18A2", "plegamiento": "MFS",
        "andamio": [], "haz": [],
        "estructuras": [
            {"id": "8T69", "ligando": "YHL", "pdb_nombre": "YHL",
             "esperada": "ocluido hacia el lumen"},
            {"id": "8T6A", "ligando": "YHR", "pdb_nombre": "YHR",
             "esperada": "abierto al citosol"},
        ],
        "compuertas": [],
    },
}

# Criterios geométricos explícitos (Å, grados)
CRIT = {
    "contacto_max": 4.0,          # residuo en contacto si algún átomo pesado ≤ 4.0 Å del ligando
    "puente_salino": 4.0,         # N cargado del ligando – O carboxilato (Asp/Glu) ≤ 4.0 Å
    "puente_h": 3.5,              # N/O ligando – N/O proteína ≤ 3.5 Å (sólo distancia, no hay H)
    "cation_pi_d": 6.0,           # N cargado – centroide anillo aromático ≤ 6.0 Å
    "cation_pi_ang": 40.0,        # ángulo(normal del anillo, N–centroide) ≤ 40°
    "apil_paralelo_d": 5.5,       # centroide–centroide ≤ 5.5 Å y ángulo entre planos ≤ 30°
    "apil_paralelo_ang": 30.0,
    "apil_t_d": 6.0,              # centroide–centroide ≤ 6.0 Å y ángulo entre planos ≥ 60°
    "apil_t_ang": 60.0,
    "hidrofobico": 4.0,           # C ligando – C proteína ≤ 4.0 Å
    "enlace_max": 1.95,           # dos átomos pesados están enlazados si d ≤ 1.95 Å (ligando)
    "compuerta_salino_cerrada": 4.5,  # puente salino formado si min(N–O) ≤ 4.5 Å
    "compuerta_aromatica_cerrada": 8.0,  # Tyr OH–Phe CZ ≤ 8 Å: tapa aromática cerrada (valores medidos: 5.3–7.0 cerrada; 13–15 abierta)
    "membrana_semiespesor_corte": 14.0,  # |y| < 14 Å define la "losa" para detectar cruces TM
    "membrana_extension": 18.0,   # una hélice TM se extiende mientras |y| < 18 Å (membrana + cabezas polares)
    "tm_min_residuos": 12,
    "espesor_tipico": 30.0,       # sólo si OPM no está disponible (marcado como inferido)
}

AROMATICOS = {
    "PHE": [["CG", "CD1", "CD2", "CE1", "CE2", "CZ"]],
    "TYR": [["CG", "CD1", "CD2", "CE1", "CE2", "CZ"]],
    "TRP": [["CD2", "CE2", "CE3", "CZ2", "CZ3", "CH2"], ["CG", "CD1", "NE1", "CE2", "CD2"]],
    "HIS": [["CG", "ND1", "CD2", "CE1", "NE2"]],
}
CARBOXILATO = {"ASP": ["OD1", "OD2"], "GLU": ["OE1", "OE2"]}


def log(*a):
    print("[preparar]", *a, file=sys.stderr)


# --------------------------------------------------------------------------
# Descargas (sólo si falta algo)
# --------------------------------------------------------------------------
def descargar(url, destino, binario=False, timeout=120):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            data = r.read()
        with open(destino, "wb") as f:
            f.write(data)
        return True
    except Exception as e:  # noqa: BLE001
        log(f"no se pudo descargar {url}: {e}")
        return False


def asegurar_cif(pdb_id, sin_red):
    ruta = os.path.join(DIR_ESTRUCTURAS, f"{pdb_id}.cif")
    if os.path.exists(ruta):
        return ruta
    if sin_red:
        raise SystemExit(f"Falta {ruta} y se pidió --sin-red")
    os.makedirs(DIR_ESTRUCTURAS, exist_ok=True)
    if descargar(URL_RCSB.format(id=pdb_id), ruta):
        return ruta
    gz = ruta + ".gz"
    idl = pdb_id.lower()
    if descargar(URL_WWPDB_AWS.format(mid=idl[1:3], idl=idl), gz):
        import gzip
        with gzip.open(gz, "rb") as f, open(ruta, "wb") as g:
            g.write(f.read())
        os.remove(gz)
        return ruta
    raise SystemExit(f"No se pudo obtener {pdb_id}.cif")


def obtener_opm(pdb_id, sin_red):
    ruta = os.path.join(DIR_OPM, f"{pdb_id.lower()}.pdb")
    if os.path.exists(ruta):
        return ruta
    if sin_red:
        return None
    os.makedirs(DIR_OPM, exist_ok=True)
    if descargar(URL_OPM.format(idl=pdb_id.lower()), ruta):
        return ruta
    return None


def obtener_uniprot(acc, sin_red):
    ruta = os.path.join(DIR_UNIPROT, f"{acc}.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    if sin_red:
        return None
    os.makedirs(DIR_UNIPROT, exist_ok=True)
    if descargar(URL_UNIPROT.format(acc=acc), ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    return None


def uniprot_tm(entrada):
    """Devuelve [(ini, fin), ...] de las regiones 'Transmembrane' de UniProt (numeración UniProt)."""
    if not entrada:
        return None
    tms = []
    for f in entrada.get("features", []):
        if f.get("type") == "Transmembrane":
            loc = f.get("location", {})
            tms.append((int(loc["start"]["value"]), int(loc["end"]["value"])))
    tms.sort()
    return tms or None


# --------------------------------------------------------------------------
# Lectura y limpieza
# --------------------------------------------------------------------------
def leer(ruta):
    doc = gemmi.cif.read(ruta)
    blk = doc.sole_block()
    st = gemmi.make_structure_from_block(blk)
    st.setup_entities()
    return st, blk


def valor(blk, tag):
    v = blk.find_value(tag)
    return gemmi.cif.as_string(v) if v is not None else None


def metadatos(blk):
    metodo = valor(blk, "_exptl.method") or ""
    res = valor(blk, "_refine.ls_d_res_high") or valor(blk, "_em_3d_reconstruction.resolution")
    try:
        res = float(res)
    except (TypeError, ValueError):
        res = None
    titulo = (valor(blk, "_struct.title") or "").strip()
    # nombres de compuestos
    nombres = {}
    t = blk.find("_chem_comp.", ["id", "name"])
    for fila in t:
        nombres[gemmi.cif.as_string(fila[0])] = gemmi.cif.as_string(fila[1])
    # cita principal
    cita = None
    for pref in ("_citation.",):
        t2 = blk.find(pref, ["id", "title", "journal_abbrev", "year", "pdbx_database_id_DOI"])
        for fila in t2:
            if gemmi.cif.as_string(fila[0]) == "primary":
                cita = {"titulo": gemmi.cif.as_string(fila[1]),
                        "revista": gemmi.cif.as_string(fila[2]),
                        "anio": gemmi.cif.as_string(fila[3]),
                        "doi": gemmi.cif.as_string(fila[4])}
    fecha = valor(blk, "_pdbx_database_status.recvd_initial_deposition_date")
    return {"metodo": metodo.title(), "resolucion": res, "titulo": titulo,
            "nombres_compuestos": nombres, "cita": cita, "deposito": fecha}


def cadena_transportador(st, blk, acc):
    """Cadena (auth_asym_id) cuya entidad tiene referencia UniProt `acc`."""
    ent_id = None
    for fila in blk.find("_struct_ref.", ["db_name", "pdbx_db_accession", "entity_id"]):
        if gemmi.cif.as_string(fila[0]) == "UNP" and gemmi.cif.as_string(fila[1]) == acc:
            ent_id = gemmi.cif.as_string(fila[2])
    if ent_id is None:
        raise SystemExit(f"No se encontró la entidad UniProt {acc}")
    for ch in st[0]:
        for res in ch:
            if res.entity_id == ent_id:
                return ch.name
    raise SystemExit("No se encontró la cadena del transportador")


def mutaciones(blk, cadena):
    out = []
    t = blk.find("_struct_ref_seq_dif.", ["pdbx_pdb_strand_id", "pdbx_auth_seq_num", "mon_id",
                                          "db_mon_id", "details"])
    for fila in t:
        if gemmi.cif.as_string(fila[0]) != cadena:
            continue
        det = gemmi.cif.as_string(fila[4])
        if "mutation" in det or "conflict" in det:
            out.append({"resi": gemmi.cif.as_string(fila[1]), "pdb": gemmi.cif.as_string(fila[2]),
                        "uniprot": gemmi.cif.as_string(fila[3]), "detalle": det})
    return out


def limpiar(st, cadena, ligando):
    """Nueva estructura con: polímero de `cadena` (sin H, sin altlocs), ligando e iones Na/Cl/K."""
    st.remove_hydrogens()
    st.remove_alternative_conformations()
    nuevo = gemmi.Structure()
    nuevo.name = st.name
    modelo = gemmi.Model("1")
    ch_p = gemmi.Chain(cadena)
    ligs, iones = [], []
    for ch in st[0]:
        if ch.name != cadena:
            continue
        for res in ch:
            info = gemmi.find_tabulated_residue(res.name)
            if info is not None and info.is_amino_acid() and res.het_flag != "H":
                ch_p.add_residue(res)
            elif res.name == ligando:
                ligs.append(res)
            elif res.name in IONES:
                iones.append(res)
    modelo.add_chain(ch_p)
    if ligs or iones:
        ch_h = gemmi.Chain(cadena)
        for r in ligs + iones:
            ch_h.add_residue(r)
        modelo.add_chain(ch_h)
    nuevo.add_model(modelo)
    nuevo.setup_entities()
    return nuevo


# --------------------------------------------------------------------------
# Geometría básica
# --------------------------------------------------------------------------
def coords(model):
    """Lista de átomos (dict) de todo el modelo con posiciones numpy."""
    atomos = []
    for ch in model:
        for res in ch:
            for at in res:
                atomos.append({"chain": ch.name, "resn": res.name, "resi": res.seqid.num,
                               "icode": res.seqid.icode.strip(), "name": at.name,
                               "elem": at.element.name, "het": res.het_flag == "H",
                               "pos": np.array([at.pos.x, at.pos.y, at.pos.z]), "ref": at})
    return atomos


def aplicar_transformacion(st, R, t):
    """pos' = R·pos + t para todos los átomos."""
    for model in st:
        for ch in model:
            for res in ch:
                for at in res:
                    p = np.array([at.pos.x, at.pos.y, at.pos.z])
                    q = R @ p + t
                    at.pos = gemmi.Position(float(q[0]), float(q[1]), float(q[2]))


def ca_dict(st, cadena):
    d = {}
    for res in st[0][cadena]:
        if res.het_flag == "H":
            continue
        at = res.find_atom("CA", "*")
        if at is not None:
            d[res.seqid.num] = np.array([at.pos.x, at.pos.y, at.pos.z])
    return d


def helices_anotadas(st, cadena):
    """Rangos (ini, fin) de hélices de _struct_conf (autores/PDB) de la cadena."""
    out = []
    for h in st.helices:
        if h.start.chain_name == cadena:
            out.append((h.start.res_id.seqid.num, h.end.res_id.seqid.num))
    return sorted(out)


def eje_helice(pts):
    c = pts.mean(0)
    _, _, vt = np.linalg.svd(pts - c)
    ax = vt[0]
    if np.dot(ax, pts[-1] - pts[0]) < 0:
        ax = -ax
    return c, ax


def rotacion_a_eje_y(normal):
    """Rotación propia R tal que R·normal = (0,1,0)."""
    n = normal / np.linalg.norm(normal)
    y = np.array([0.0, 1.0, 0.0])
    v = np.cross(n, y)
    s = np.linalg.norm(v)
    c = float(np.dot(n, y))
    if s < 1e-9:
        return np.eye(3) if c > 0 else np.diag([1.0, -1.0, -1.0])
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * ((1 - c) / (s * s))


# --------------------------------------------------------------------------
# Orientación en la membrana
# --------------------------------------------------------------------------
def normal_por_helices(ca, helices, min_res=12):
    """Autovector principal de Σ nᵢ·aᵢaᵢᵀ con aᵢ los ejes unitarios de hélices largas."""
    M = np.zeros((3, 3))
    centros = []
    for a, b in helices:
        pts = np.array([ca[i] for i in range(a, b + 1) if i in ca])
        if len(pts) < min_res:
            continue
        c, ax = eje_helice(pts)
        M += len(pts) * np.outer(ax, ax)
        centros.append(c)
    w, v = np.linalg.eigh(M)
    return v[:, -1], np.mean(centros, axis=0)


def segmentos_tm(ca, helices, normal, centro, crit=CRIT):
    """Hélices TM por geometría.
    1) y = proyección del Cα sobre la normal, suavizada con los vecinos (i−1, i, i+1).
    2) Un cruce del plano medio (y = 0) entre residuos consecutivos marca una hélice TM; cruces separados
       ≤ 8 residuos se agrupan (TM1 y TM6 están desenrolladas en el centro y oscilan alrededor de y = 0).
    3) Desde cada cruce se extiende en ambos sentidos mientras |y| siga creciendo (tolerancia 2 Å),
       |y| < membrana_extension y el residuo sea helicoidal (_struct_conf) o esté dentro de la losa
       |y| < membrana_semiespesor_corte.
    4) Se exigen ≥ tm_min_residuos residuos y una extensión en y ≥ 16 Å. Dos segmentos solapados\n       (hélices unidas por un bucle corto) se separan en el residuo de máximo |y| del solape.
    Devuelve ([(ini, fin), ...] en orden de secuencia, {resi: y})."""
    nums = sorted(ca)
    z = {i: float(np.dot(ca[i] - centro, normal)) for i in nums}
    zs = {}
    for i in nums:
        vec = [z[j] for j in (i - 1, i, i + 1) if j in z]
        zs[i] = sum(vec) / len(vec)
    hel = set()
    for a, b in helices:
        hel.update(range(a, b + 1))
    corte = crit["membrana_semiespesor_corte"]
    ext = crit["membrana_extension"]
    cruces = [i for i in nums if (i + 1) in zs and zs[i] * zs[i + 1] <= 0]
    grupos = []
    for c in cruces:
        if grupos and c - grupos[-1][-1] <= 8:
            grupos[-1].append(c)
        else:
            grupos.append([c])

    def extender(i0, paso):
        i, extremo = i0, abs(zs[i0])
        while (i + paso) in zs:
            j = i + paso
            y = abs(zs[j])
            if y >= ext:
                break
            if y < extremo - 2.0:  # la traza vuelve hacia el centro: siguiente hélice o bucle
                break
            if j not in hel and y >= corte:
                break
            extremo = max(extremo, y)
            i = j
        return i

    segs = []
    for g in grupos:
        c = g[len(g) // 2]
        a = extender(g[0], -1)
        b = extender(g[-1] + 1, +1)
        span = max(zs[i] for i in range(a, b + 1) if i in zs) - min(zs[i] for i in range(a, b + 1) if i in zs)
        if b - a + 1 >= crit["tm_min_residuos"] and span >= 16.0 and zs[a] * zs[b] < 0:
            segs.append((a, b))
    # dos segmentos solapados = dos hélices unidas por un bucle corto: se cortan en el ápice (máx |y|)
    fus = []
    for sg in segs:
        if fus and sg[0] <= fus[-1][1]:
            a1, b1 = fus[-1]
            a2, b2 = sg
            apice = max(range(a2, b1 + 1), key=lambda i: abs(zs.get(i, 0.0)))
            fus[-1] = (a1, apice)
            fus.append((apice + 1, b2))
        else:
            fus.append(sg)
    fus = [sg for sg in fus if sg[1] - sg[0] + 1 >= crit["tm_min_residuos"]]
    return fus, zs


def orientar_por_geometria(st, cadena, hel):
    """Estimación iterativa de normal y centro de membrana con las hélices largas."""
    ca = ca_dict(st, cadena)
    normal, centro = normal_por_helices(ca, hel)
    for _ in range(4):
        segs, _ = segmentos_tm(ca, hel, normal, centro)
        if len(segs) < 6:
            break
        normal, centro = normal_por_helices(ca, segs, min_res=8)
    # signo: el N-terminal (primer residuo resuelto) queda en el citosol (−y)
    primero = ca[min(ca)]
    if np.dot(primero - centro, normal) > 0:
        normal = -normal
    R = rotacion_a_eje_y(normal)
    t = -R @ centro
    return R, t, normal, centro


def orientar_por_opm(st, cadena, ruta_opm):
    """Transformación que lleva las coordenadas del PDB a las de OPM (superposición Cα), y luego z→y."""
    opm = gemmi.read_structure(ruta_opm)
    semi = None
    with open(ruta_opm, encoding="utf-8", errors="replace") as f:
        for linea in f:
            if "1/2 of bilayer thickness" in linea:
                semi = float(linea.split(":")[1])
            if linea.startswith("ATOM"):
                break
    ca_opm = {}
    for ch in opm[0]:
        if ch.name != cadena:
            continue
        for res in ch:
            at = res.find_atom("CA", "*")
            if at is not None:
                ca_opm[res.seqid.num] = np.array([at.pos.x, at.pos.y, at.pos.z])
    ca_pdb = ca_dict(st, cadena)
    comunes = sorted(set(ca_opm) & set(ca_pdb))
    P = np.array([ca_pdb[i] for i in comunes])
    Q = np.array([ca_opm[i] for i in comunes])
    R, t, rmsd = kabsch(P, Q)
    # OPM: normal = z, extracelular +z. Convertimos a +y: (x, y, z) -> (x, z, -y)
    Rzy = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)
    return Rzy @ R, Rzy @ t, rmsd, semi, len(comunes)


def kabsch(P, Q):
    """R, t tales que R·P + t ≈ Q (mínimos cuadrados). Devuelve también el RMSD."""
    cp, cq = P.mean(0), Q.mean(0)
    H = (P - cp).T @ (Q - cq)
    U, _, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1, 1, d])
    R = Vt.T @ D @ U.T
    t = cq - R @ cp
    rmsd = float(np.sqrt(np.mean(np.sum((P @ R.T + t - Q) ** 2, axis=1))))
    return R, t, rmsd


# --------------------------------------------------------------------------
# Anillos y contactos
# --------------------------------------------------------------------------
def anillos_ligando(atomos_lig):
    """Anillos de 5–6 átomos pesados por conectividad (d ≤ enlace_max) que sean planos (aromáticos)."""
    n = len(atomos_lig)
    P = np.array([a["pos"] for a in atomos_lig])
    D = np.linalg.norm(P[:, None] - P[None], axis=2)
    vec = {i: [j for j in range(n) if j != i and D[i, j] <= CRIT["enlace_max"]] for i in range(n)}
    anillos = set()

    def dfs(inicio, actual, camino):
        for j in vec[actual]:
            if j == inicio and len(camino) in (5, 6):
                anillos.add(tuple(sorted(camino)))
            elif j not in camino and len(camino) < 6:
                dfs(inicio, j, camino + [j])

    for i in range(n):
        dfs(i, i, [i])
    out = []
    for an in sorted(anillos):
        pts = P[list(an)]
        c = pts.mean(0)
        _, s, vt = np.linalg.svd(pts - c)
        planaridad = float(np.sqrt(np.mean(((pts - c) @ vt[2]) ** 2)))
        if planaridad < 0.15:  # Å; anillos aromáticos son planos (< 0.1 típicamente)
            out.append({"idx": list(an), "centro": c, "normal": vt[2],
                        "atomos": [atomos_lig[k]["name"] for k in an]})
    return out, vec


def nitrogenos_cargados(atomos_lig, vec, anillos):
    """N del ligando protonables: sin carbonilo vecino y fuera de anillos planos (aromáticos)."""
    en_anillo = set()
    for an in anillos:
        en_anillo.update(an["idx"])
    out = []
    for i, a in enumerate(atomos_lig):
        if a["elem"] != "N" or i in en_anillo:
            continue
        amida = False
        for j in vec[i]:
            if atomos_lig[j]["elem"] == "C":
                for k in vec[j]:
                    if atomos_lig[k]["elem"] == "O" and \
                            np.linalg.norm(atomos_lig[j]["pos"] - atomos_lig[k]["pos"]) < 1.30:
                        amida = True
        if not amida and len(vec[i]) <= 3:
            out.append(i)
    return out


def anillos_residuo(res_atomos, resn):
    out = []
    for nombres in AROMATICOS.get(resn, []):
        pts = [a["pos"] for a in res_atomos if a["name"] in nombres]
        if len(pts) == len(nombres):
            pts = np.array(pts)
            c = pts.mean(0)
            _, _, vt = np.linalg.svd(pts - c)
            out.append({"centro": c, "normal": vt[2], "atomos": nombres})
    return out


def angulo(u, v):
    c = abs(float(np.dot(u, v)) / (np.linalg.norm(u) * np.linalg.norm(v)))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def contactos_ligando(atomos, lig_resi, lig_chain, lig_name):
    lig = [a for a in atomos if a["het"] and a["resn"] == lig_name and a["resi"] == lig_resi
           and a["chain"] == lig_chain]
    prot = [a for a in atomos if not a["het"]]
    otros = [a for a in atomos if a["het"] and not (a["resn"] == lig_name and a["resi"] == lig_resi)]
    PL = np.array([a["pos"] for a in lig])
    PP = np.array([a["pos"] for a in prot])
    D = np.linalg.norm(PP[:, None] - PL[None], axis=2)
    anillos_l, vec = anillos_ligando(lig)
    n_carg = nitrogenos_cargados(lig, vec, anillos_l)
    # agrupar átomos de proteína por residuo
    por_res = defaultdict(list)
    for k, a in enumerate(prot):
        por_res[(a["resi"], a["resn"])].append((k, a))
    resultados = []
    for (resi, resn), lista in por_res.items():
        idx = [k for k, _ in lista]
        dmin = float(D[idx].min())
        if dmin > CRIT["contacto_max"]:
            continue
        tipos, pares = [], []
        # puente salino
        for k, a in lista:
            if a["name"] in CARBOXILATO.get(resn, []):
                for i in n_carg:
                    d = float(D[k, i])
                    if d <= CRIT["puente_salino"]:
                        tipos.append("puente salino")
                        pares.append({"tipo": "puente salino", "prot": a["name"], "lig": lig[i]["name"],
                                      "d": round(d, 2)})
        # puente de hidrógeno (por distancia)
        for k, a in lista:
            if a["elem"] not in ("N", "O"):
                continue
            for i, b in enumerate(lig):
                if b["elem"] not in ("N", "O"):
                    continue
                d = float(D[k, i])
                if d <= CRIT["puente_h"] and not any(p["prot"] == a["name"] and p["lig"] == b["name"]
                                                     and p["tipo"] == "puente salino" for p in pares):
                    donde = "esqueleto" if a["name"] in ("N", "O", "OXT") else "cadena lateral"
                    tipos.append(f"puente de hidrógeno ({donde})")
                    pares.append({"tipo": f"puente de hidrógeno ({donde})", "prot": a["name"], "lig": b["name"],
                                  "d": round(d, 2)})
        # catión–π y apilamiento
        for an_p in anillos_residuo([a for _, a in lista], resn):
            for i in n_carg:
                v = lig[i]["pos"] - an_p["centro"]
                d = float(np.linalg.norm(v))
                if d <= CRIT["cation_pi_d"] and angulo(v, an_p["normal"]) <= CRIT["cation_pi_ang"]:
                    tipos.append("catión–π")
                    pares.append({"tipo": "catión–π", "prot": "anillo " + "/".join(an_p["atomos"][:2]),
                                  "lig": lig[i]["name"], "d": round(d, 2)})
            for an_l in anillos_l:
                d = float(np.linalg.norm(an_l["centro"] - an_p["centro"]))
                ang = angulo(an_l["normal"], an_p["normal"])
                if d <= CRIT["apil_paralelo_d"] and ang <= CRIT["apil_paralelo_ang"]:
                    tipos.append("apilamiento aromático (paralelo)")
                    pares.append({"tipo": "apilamiento aromático (paralelo)", "prot": "anillo",
                                  "lig": "anillo " + "/".join(an_l["atomos"][:2]), "d": round(d, 2),
                                  "angulo": round(ang, 1)})
                elif d <= CRIT["apil_t_d"] and ang >= CRIT["apil_t_ang"]:
                    tipos.append("apilamiento aromático (en T)")
                    pares.append({"tipo": "apilamiento aromático (en T)", "prot": "anillo",
                                  "lig": "anillo " + "/".join(an_l["atomos"][:2]), "d": round(d, 2),
                                  "angulo": round(ang, 1)})
        # hidrofóbico
        dh = None
        for k, a in lista:
            if a["elem"] != "C":
                continue
            for i, b in enumerate(lig):
                if b["elem"] == "C":
                    d = float(D[k, i])
                    if d <= CRIT["hidrofobico"] and (dh is None or d < dh):
                        dh = d
        if dh is not None:
            tipos.append("hidrofóbico")
            pares.append({"tipo": "hidrofóbico", "prot": "C", "lig": "C", "d": round(dh, 2)})
        orden = ["puente salino", "puente de hidrógeno (cadena lateral)", "puente de hidrógeno (esqueleto)", "catión–π",
                 "apilamiento aromático (paralelo)", "apilamiento aromático (en T)", "hidrofóbico"]
        tipos_u = sorted(set(tipos), key=orden.index)
        if not tipos_u:
            tipos_u = ["van der Waals (≤ 4 Å, sin tipo específico)"]
        resultados.append({"resi": resi, "resn": resn, "dmin": round(dmin, 2), "tipos": tipos_u,
                           "tipo_principal": tipos_u[0], "pares": pares})
    resultados.sort(key=lambda r: r["resi"])
    # iones cercanos al ligando
    iones_cerca = []
    for a in otros:
        if a["resn"] in IONES:
            d = float(np.linalg.norm(PL - a["pos"], axis=1).min())
            iones_cerca.append({"ion": a["resn"], "resi": a["resi"], "d_ligando": round(d, 2)})
    centro = PL.mean(0)
    return {"residuos": resultados, "iones_cercanos": iones_cerca,
            "centro": [round(float(x), 2) for x in centro],
            "n_cargados": [lig[i]["name"] for i in n_carg],
            "anillos": [an["atomos"] for an in anillos_l]}


# --------------------------------------------------------------------------
# Compuertas
# --------------------------------------------------------------------------
def medir_compuerta(atomos, comp):
    def sel(spec):
        resi, resn, nombres = spec
        return [a for a in atomos if not a["het"] and a["resi"] == resi and a["resn"] == resn
                and a["name"] in nombres]
    A, B = sel(comp["a"]), sel(comp["b"])
    salida = {"nombre": comp["nombre"], "lado": comp["lado"], "tipo": comp["tipo"],
              "residuos": [f"{comp['a'][1].title()}{comp['a'][0]}", f"{comp['b'][1].title()}{comp['b'][0]}"],
              "atomos": [comp["a"][2], comp["b"][2]]}
    if not A or not B:
        salida.update({"distancia": None, "estado": "no medible",
                       "nota": "residuo o átomo no resuelto en esta estructura"})
        return salida
    mejor = None
    for a in A:
        for b in B:
            d = float(np.linalg.norm(a["pos"] - b["pos"]))
            if mejor is None or d < mejor[0]:
                mejor = (d, a["name"], b["name"])
    d, na, nb = mejor
    if comp["tipo"] == "salino":
        cerrada = d <= CRIT["compuerta_salino_cerrada"]
        umbral = CRIT["compuerta_salino_cerrada"]
    else:
        cerrada = d <= CRIT["compuerta_aromatica_cerrada"]
        umbral = CRIT["compuerta_aromatica_cerrada"]
    salida.update({"distancia": round(d, 2), "par": f"{na}–{nb}", "umbral": umbral,
                   "estado": "cerrada" if cerrada else "abierta"})
    return salida


def inferir_conformacion(compuertas, plegamiento, iones):
    """Regla explícita (inferido), plegamiento LeuT:
    1) tapa aromática extracelular (Tyr OH – Phe CZ) > 8 Å → 'abierto hacia fuera';
    2) si está cerrada y se midió la compuerta intracelular (puente salino Arg–Asp): abierta → 'abierto hacia
       dentro', cerrada → 'ocluido';
    3) si no se midió la intracelular: hay Na⁺ resuelto en la estructura → 'ocluido' (el Na2 se libera al abrir
       hacia dentro); no hay Na⁺ → 'abierto hacia dentro'.
    El puente salino extracelular Arg–Asp/Glu se informa pero no decide (en 5I71 está formado con la tapa abierta)."""
    if plegamiento != "LeuT":
        return None, None
    tapa = [c for c in compuertas if c["lado"] == "extracelular" and c["tipo"] == "aromatica" and c["distancia"]]
    intr = [c for c in compuertas if c["lado"] == "intracelular" and c["distancia"]]
    if not tapa:
        return "sin datos", "no se pudo medir la tapa aromática"
    if any(c["estado"] == "abierta" for c in tapa):
        return "abierto hacia fuera", f"tapa aromática abierta ({tapa[0]['distancia']} Å > 8 Å)"
    if intr:
        if any(c["estado"] == "abierta" for c in intr):
            return "abierto hacia dentro", "tapa cerrada y puente salino intracelular roto"
        return "ocluido", "tapa cerrada y puente salino intracelular formado"
    hay_na = any(i["ion"] == "NA" for i in iones)
    if hay_na:
        return "ocluido", "tapa cerrada; compuerta intracelular no medible; Na⁺ resuelto en el sitio"
    return "abierto hacia dentro", "tapa cerrada; compuerta intracelular no medible; sin Na⁺ resuelto"


def apertura_mfs(ca, tms):
    """Medida propia para VMAT2: distancia entre los centroides de los extremos luminales (y > +8 Å)
    y citosólicos (y < −8 Å) de los Cα TM del dominio N (TM1–6) y del dominio C (TM7–12).
    Un valor menor = extremos más juntos = lado más cerrado."""
    def extremos(rango_tm, signo):
        pts = []
        for n in rango_tm:
            a, b = tms[n - 1]
            for i in range(a, b + 1):
                if i in ca and signo * ca[i][1] > 8.0:
                    pts.append(ca[i])
        return np.mean(pts, axis=0) if pts else None
    out = {}
    for lado, signo in (("luminal", 1), ("citosolica", -1)):
        n_dom = extremos(range(1, 7), signo)
        c_dom = extremos(range(7, 13), signo)
        out[lado] = round(float(np.linalg.norm(n_dom - c_dom)), 2) if n_dom is not None and c_dom is not None else None
    return out


# --------------------------------------------------------------------------
# Escritura de PDB
# --------------------------------------------------------------------------
def escribir_pdb(st, ruta, renombrar):
    for model in st:
        for ch in model:
            for res in ch:
                if res.name in renombrar:
                    res.name = renombrar[res.name]
    for model in st:
        for ch in model:
            for res in ch:
                for at in res:
                    at.aniso = gemmi.SMat33f(0, 0, 0, 0, 0, 0)  # sin registros ANISOU
    opts = gemmi.PdbWriteOptions()
    opts.minimal_file = True
    opts.ter_records = True
    opts.end_record = True
    opts.cryst1_record = False
    txt = st.make_pdb_string(opts)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(txt)
    return txt


# --------------------------------------------------------------------------
# Proceso principal por estructura
# --------------------------------------------------------------------------
def procesar_estructura(clave, cfg, est, sin_red, uniprot_tms):
    pdb_id = est["id"]
    ruta = asegurar_cif(pdb_id, sin_red)
    st, blk = leer(ruta)
    meta = metadatos(blk)
    cadena = cadena_transportador(st, blk, cfg["uniprot"])
    muts = mutaciones(blk, cadena)
    hel = helices_anotadas(st, cadena)  # _struct_conf del archivo original
    limpio = limpiar(st, cadena, est["ligando"])
    avisos = []

    # ---- orientación
    ruta_opm = obtener_opm(pdb_id, sin_red)
    R_geo, t_geo, normal_geo, centro_geo = orientar_por_geometria(limpio, cadena, hel)
    if ruta_opm:
        R, t, rmsd, semi, ncom = orientar_por_opm(limpio, cadena, ruta_opm)
        # ángulo entre la normal geométrica y la de OPM (la de OPM es R^T·(0,1,0))
        n_opm = R.T @ np.array([0.0, 1.0, 0.0])
        ang = angulo(n_opm, normal_geo)
        orient = {"fuente": "OPM", "detalle": f"superposición Cα sobre el PDB orientado de OPM "
                                               f"({ncom} Cα, RMSD {rmsd:.2f} Å)",
                  "espesor": round(2 * semi, 1) if semi else None, "espesor_fuente": "OPM (medido)",
                  "angulo_geometria_vs_opm": round(ang, 1), "inferido": False}
    else:
        R, t = R_geo, t_geo
        orient = {"fuente": "geometría", "detalle": "normal = autovector principal de los ejes de las hélices "
                                                     "TM (iterado con la asignación TM); centro = media de "
                                                     "los centros de las hélices; N-terminal hacia −y",
                  "espesor": CRIT["espesor_tipico"],
                  "espesor_fuente": "inferido: valor típico (30 Å); OPM no tiene esta entrada",
                  "inferido": True}
    aplicar_transformacion(limpio, R, t)

    # ---- TM
    ca = ca_dict(limpio, cadena)
    normal_y = np.array([0.0, 1.0, 0.0])
    segs, zs = segmentos_tm(ca, hel, normal_y, np.zeros(3))
    fuente_tm = "geometría: cruces del plano medio de la membrana por la traza Cα suavizada, extendidos mientras |y| crece (<18 Å) por hélice anotada (_struct_conf) o dentro de la losa |y|<14 Å"
    if uniprot_tms:
        # UniProt numera igual que auth_seq_id en estas entradas humanas (comprobado en _struct_ref_seq)
        segs_u = []
        for a, b in uniprot_tms:
            res_ok = [i for i in range(a, b + 1) if i in ca]
            if len(res_ok) >= 6:
                segs_u.append((min(res_ok), max(res_ok)))
        if len(segs_u) == 12:
            segs = segs_u
            fuente_tm = "UniProt (regiones 'Transmembrane'), recortadas a lo resuelto"
        else:
            avisos.append(f"UniProt dio {len(segs_u)} TM resueltas; se usa geometría")
    if len(segs) != 12:
        avisos.append(f"¡Atención! la asignación TM dio {len(segs)} segmentos, no 12: {segs}")
    tms = []
    for k, (a, b) in enumerate(segs, start=1):
        pts = np.array([ca[i] for i in range(a, b + 1) if i in ca])
        c, ax = eje_helice(pts)
        tms.append({"n": k, "ini": a, "fin": b, "residuos": int(len(pts)),
                    "inclinacion": round(angulo(ax, normal_y), 1),
                    "direccion": "dentro→fuera" if ax[1] > 0 else "fuera→dentro"})
    # comprobación de alternancia
    for k, tm in enumerate(tms):
        esperada = "dentro→fuera" if k % 2 == 0 else "fuera→dentro"
        if tm["direccion"] != esperada:
            avisos.append(f"TM{tm['n']} va {tm['direccion']} (se esperaba {esperada})")

    # ---- grupos de hélices
    if cfg["plegamiento"] == "LeuT":
        grupos = {"haz central": cfg["haz"], "andamio": cfg["andamio"],
                  "periféricas": [n for n in range(1, 13) if n not in cfg["haz"] + cfg["andamio"]]}
    else:
        grupos = {"mitad N (TM1–6)": list(range(1, 7)), "mitad C (TM7–12)": list(range(7, 13))}

    # ---- ligandos, iones, contactos
    atomos = coords(limpio[0])
    ligandos = []
    for a in atomos:
        if a["het"] and a["resn"] == est["ligando"]:
            clave_l = (a["chain"], a["resi"])
            if clave_l not in [(l["cadena"], l["resi"]) for l in ligandos]:
                ligandos.append({"cadena": a["chain"], "resi": a["resi"]})
    for k, l in enumerate(ligandos):
        c = contactos_ligando(atomos, l["resi"], l["cadena"], est["ligando"])
        l.update(c)
        l["etiqueta"] = f"S{k + 1}" if len(ligandos) > 1 else "S1"
        # sitio: por altura y (central S1 vs vestíbulo S2)
        l["y_centro"] = c["centro"][1]
    iones = []
    for a in atomos:
        if a["het"] and a["resn"] in IONES:
            iones.append({"ion": a["resn"], "simbolo": IONES[a["resn"]], "resi": a["resi"],
                          "cadena": a["chain"], "pos": [round(float(x), 2) for x in a["pos"]]})

    # ---- compuertas
    compuertas = [medir_compuerta(atomos, c) for c in cfg["compuertas"]]
    inferida, motivo = inferir_conformacion(compuertas, cfg["plegamiento"], iones)
    apertura = apertura_mfs(ca, [(t["ini"], t["fin"]) for t in tms]) if cfg["plegamiento"] == "MFS" and len(tms) == 12 else None

    # ---- PDB de salida
    os.makedirs(DIR_PROC, exist_ok=True)
    renombrar = {est["ligando"]: est["pdb_nombre"]} if est["ligando"] != est["pdb_nombre"] else {}
    ruta_pdb = os.path.join(DIR_PROC, f"{pdb_id}.pdb")
    txt = escribir_pdb(limpio, ruta_pdb, renombrar)

    nombre_lig = meta["nombres_compuestos"].get(est["ligando"], est["ligando"])
    n_prot = sum(1 for a in atomos if not a["het"])
    resi_min = min(ca)
    resi_max = max(ca)
    # residuos faltantes (huecos) dentro del rango resuelto
    huecos = []
    prev = None
    for i in sorted(ca):
        if prev is not None and i - prev > 1:
            huecos.append([prev + 1, i - 1])
        prev = i
    return {
        "id": pdb_id, "transportador": clave, "titulo": meta["titulo"], "metodo": meta["metodo"],
        "resolucion": meta["resolucion"], "cita": meta["cita"], "deposito": meta["deposito"],
        "cadena": cadena, "residuos": [resi_min, resi_max], "huecos": huecos, "n_atomos_proteina": n_prot,
        "mutaciones": muts,
        "ligando": {"codigo": est["ligando"], "codigo_pdb": est["pdb_nombre"], "nombre": nombre_lig,
                    "copias": ligandos},
        "iones": iones,
        "orientacion": orient,
        "tm": tms, "tm_fuente": fuente_tm, "grupos": grupos,
        "helices_anotadas": hel,
        "compuertas": compuertas,
        "conformacion": {"esperada": est["esperada"], "inferida": inferida, "motivo": motivo,
                         "regla": (inferir_conformacion.__doc__ if cfg["plegamiento"] == "LeuT" else apertura_mfs.__doc__).strip(),
                         "coincide": (inferida == est["esperada"]) if inferida else None,
                         "titulo_pdb_menciona": _estado_en_titulo(meta["titulo"])},
        "apertura_mfs": apertura,
        "archivo": f"procesadas/{pdb_id}.pdb", "avisos": avisos,
        "_ca": ca, "_st": limpio, "_pdb": txt,
    }


def _estado_en_titulo(titulo):
    t = titulo.lower()
    for clave, es in (("inward-open", "abierto hacia dentro"), ("outward-open", "abierto hacia fuera"),
                      ("occluded", "ocluido"), ("inward-facing", "orientado hacia dentro"),
                      ("outward-facing", "orientado hacia fuera")):
        if clave in t:
            return es
    return None


def morph(clave, cfg, A, B):
    """Superpone B sobre A con los Cα de las hélices de andamio (o todos los Cα comunes en MFS)."""
    ca_a, ca_b = A["_ca"], B["_ca"]
    if cfg["andamio"]:
        sel = set()
        for n in cfg["andamio"]:
            tm = A["tm"][n - 1]
            sel.update(range(tm["ini"], tm["fin"] + 1))
        base = f"Cα de TM{', TM'.join(map(str, cfg['andamio']))} (andamio) de {A['id']}"
    else:
        sel = set(ca_a)
        base = "todos los Cα comunes (MFS, sin andamio fijo)"
    comunes = sorted(i for i in sel if i in ca_a and i in ca_b)
    P = np.array([ca_b[i] for i in comunes])
    Q = np.array([ca_a[i] for i in comunes])
    R, t, rmsd = kabsch(P, Q)
    # ángulo entre la orientación propia de B y la heredada de A
    n_propia_b = np.array([0.0, 1.0, 0.0])
    n_heredada = R @ n_propia_b
    ang = angulo(n_propia_b, n_heredada)
    aplicar_transformacion(B["_st"], R, t)
    # RMSD global de todos los Cα comunes tras la superposición (indica el cambio conformacional)
    todos = sorted(set(ca_a) & set(ca_b))
    Pb = np.array([R @ ca_b[i] + t for i in todos])
    Pa = np.array([ca_a[i] for i in todos])
    rmsd_todos = float(np.sqrt(np.mean(np.sum((Pb - Pa) ** 2, axis=1))))
    # actualizar coordenadas de B ya transformadas
    B["_ca"] = {i: R @ p + t for i, p in ca_b.items()}
    for ion in B["iones"]:
        ion["pos"] = [round(float(x), 2) for x in (R @ np.array(ion["pos"]) + t)]
    for l in B["ligando"]["copias"]:
        l["centro"] = [round(float(x), 2) for x in (R @ np.array(l["centro"]) + t)]
        l["y_centro"] = l["centro"][1]
    return {"base": A["id"], "movil": B["id"], "superposicion": base, "n_ca": len(comunes),
            "rmsd_andamio": round(rmsd, 2), "rmsd_todos_ca": round(rmsd_todos, 2), "n_ca_comunes": len(todos),
            "angulo_normal_propia_vs_heredada": round(ang, 1),
            "interpolacion": "lineal en coordenadas cartesianas, calculada en el navegador; no es una "
                             "trayectoria física", "inferido": True}


def informe(datos):
    L = ["# Informe de preparación de estructuras", "",
         f"Generado: {datos['generado']}", ""]
    L += ["## Compuertas", "", "| Estructura | Compuerta | Átomos | Distancia (Å) | Umbral | Estado | Conformación esperada | Inferida por regla | Coincide |",
          "|---|---|---|---|---|---|---|---|---|"]
    for clave, tr in datos["transportadores"].items():
        for e in tr["estructuras"]:
            for c in e["compuertas"]:
                d = "—" if c["distancia"] is None else f"{c['distancia']:.2f}"
                L.append(f"| {e['id']} ({clave}) | {c['nombre']} | {c.get('par', '—')} | {d} | ≤{c.get('umbral', '—')} | "
                         f"{c['estado']} | {e['conformacion']['esperada']} | {e['conformacion']['inferida']} ({e['conformacion'].get('motivo') or ''}) | "
                         f"{'sí' if e['conformacion']['coincide'] else ('no' if e['conformacion']['coincide'] is False else '—')} |")
            if e.get("apertura_mfs"):
                L.append(f"| {e['id']} ({clave}) | Apertura MFS (medida propia) | centroides N/C | "
                         f"luminal {e['apertura_mfs']['luminal']} / citosólica {e['apertura_mfs']['citosolica']} | — | — | "
                         f"{e['conformacion']['esperada']} | — | — |")
    L += ["", "## Rangos TM usados", ""]
    for clave, tr in datos["transportadores"].items():
        for e in tr["estructuras"]:
            L.append(f"- **{e['id']} ({clave})** · fuente: {e['tm_fuente']}")
            L.append("  " + "; ".join(f"TM{t['n']} {t['ini']}–{t['fin']}" for t in e["tm"]))
    L += ["", "## Orientación en la membrana", ""]
    for clave, tr in datos["transportadores"].items():
        for e in tr["estructuras"]:
            o = e["orientacion"]
            extra = f" · ángulo geometría vs OPM: {o['angulo_geometria_vs_opm']}°" if "angulo_geometria_vs_opm" in o else ""
            L.append(f"- {e['id']}: {o['fuente']} — {o['detalle']} · espesor {o['espesor']} Å ({o['espesor_fuente']}){extra}")
    L += ["", "## Avisos", ""]
    for clave, tr in datos["transportadores"].items():
        for e in tr["estructuras"]:
            for a in e["avisos"]:
                L.append(f"- {e['id']}: {a}")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sin-red", action="store_true", help="no intentar descargas (UniProt/OPM/PDB)")
    args = ap.parse_args()
    os.makedirs(DIR_DATOS, exist_ok=True)
    salida = {"generado": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
              "criterios": CRIT, "transportadores": {}}
    for clave, cfg in TRANSPORTADORES.items():
        log(f"== {clave}")
        uni = obtener_uniprot(cfg["uniprot"], args.sin_red)
        uni_tms = uniprot_tm(uni)
        if uni_tms:
            log(f"UniProt {cfg['uniprot']}: {len(uni_tms)} TM")
        else:
            log(f"UniProt {cfg['uniprot']} no disponible; TM por geometría")
        ests = []
        for est in cfg["estructuras"]:
            log(f"-- {est['id']}")
            r = procesar_estructura(clave, cfg, est, args.sin_red, uni_tms)
            for a in r["avisos"]:
                log("   AVISO:", a)
            log(f"   TM: {[(t['ini'], t['fin']) for t in r['tm']]}")
            log(f"   compuertas: {[(c['nombre'], c['distancia'], c['estado']) for c in r['compuertas']]}")
            log(f"   conformación esperada={r['conformacion']['esperada']} inferida={r['conformacion']['inferida']}")
            ests.append(r)
        mo = None
        if len(ests) == 2 and len(ests[0]["tm"]) == 12:
            mo = morph(clave, cfg, ests[0], ests[1])
            # reescribir el PDB de B ya superpuesto
            ruta_pdb = os.path.join(DIR_PROC, f"{ests[1]['id']}.pdb")
            escribir_pdb(ests[1]["_st"], ruta_pdb, {})
            log(f"   morph: RMSD andamio {mo['rmsd_andamio']} Å, RMSD todos Cα {mo['rmsd_todos_ca']} Å")
        if cfg["plegamiento"] == "MFS" and len(ests) == 2 and all(e.get("apertura_mfs") for e in ests):
            a, b = ests
            d_cit = round(b["apertura_mfs"]["citosolica"] - a["apertura_mfs"]["citosolica"], 2)
            d_lum = round(b["apertura_mfs"]["luminal"] - a["apertura_mfs"]["luminal"], 2)
            for e, signo in ((a, -1), (b, 1)):
                otro = b if e is a else a
                e["conformacion"]["inferida"] = (
                    f"lado citosólico {'más' if signo * d_cit > 0 else 'menos'} abierto que {otro['id']} "
                    f"({abs(d_cit)} Å); lado luminal {'más' if signo * d_lum > 0 else 'menos'} abierto ({abs(d_lum)} Å)")
                e["conformacion"]["motivo"] = ("comparación relativa de la apertura MFS (medida propia); "
                                               "no es una clasificación absoluta")
                e["conformacion"]["coincide"] = None
        for e in ests:
            for k in ("_ca", "_st", "_pdb"):
                e.pop(k, None)
        salida["transportadores"][clave] = {
            "uniprot": cfg["uniprot"], "gen": cfg["gen"], "plegamiento": cfg["plegamiento"],
            "uniprot_disponible": bool(uni_tms), "estructuras": ests, "morph": mo}
    with open(os.path.join(DIR_DATOS, "datos.json"), "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DIR_DATOS, "informe.md"), "w", encoding="utf-8") as f:
        f.write(informe(salida))
    log("listo: datos/datos.json, datos/informe.md")


if __name__ == "__main__":
    main()

"""Regras de configuração do motor sem carregar modelos: IA sempre no sub-stream e limites do alerta.
Rodar: venv-ia\Scripts\python.exe tests\test_config_alerta.py"""
# Executa só o trecho de configuração do main.py (sem carregar modelos) e confere as regras novas
import math, os, re, sys, threading
from typing import Optional, List, Dict, Any, Tuple
ARQ = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "main.py")
src = open(ARQ, encoding="utf8").read()
ini = src.index("PERFIS: Dict[str, Dict[str, Any]] = {")
fim = src.index('CFG: Dict[str, Any] = montar_config(')
trecho_alerta = re.search(r"def alerta_confiavel\(.*?\n\n\n", src, re.S).group(0)
def rodar(diag):
    os.environ["IA_STREAM_DIAGNOSTICO"] = "1" if diag else ""
    ns = {"os": os, "math": math, "threading": threading, "Dict": Dict, "Any": Any, "Tuple": Tuple, "Optional": Optional, "List": List}
    exec("ESPECTADOR_S=10\n" + src[ini:fim], ns)
    return ns
ns = rodar(False)
falhas = []
def conf(cond, msg):
    print(("OK   " if cond else "FALHA") + " " + msg); cond or falhas.append(msg)
for p in ("leve", "equilibrado", "maximo"):
    conf(ns["montar_config"](p)["ia_stream"] == "sub", f"perfil {p} usa sub-stream")
conf(ns["montar_config"]("maximo", {"ia_stream": "principal"})["ia_stream"] == "sub", "ajuste antigo 'principal' é ignorado fora do diagnóstico")
conf(ns["montar_config"]("maximo", {"ia_stream": "auto"})["ia_stream"] == "sub", "ajuste 'auto' é ignorado fora do diagnóstico")
nd = rodar(True)
conf(nd["montar_config"]("maximo", {"ia_stream": "principal"})["ia_stream"] == "principal", "com IA_STREAM_DIAGNOSTICO=1 o principal é aceito")
c = ns["montar_config"]("maximo")
conf(c["alerta_min_face_px"] == 64 and c["alerta_limiar"] == 0.55, "limites de alerta padrão 64 px / 0,55")
c2 = ns["montar_config"]("maximo", {"alerta_min_face_px": 10, "alerta_limiar": 0.99})
conf(c2["alerta_min_face_px"] == 36 and c2["alerta_limiar"] == 0.90, "limites de alerta presos às faixas (36..300 px, 0,40..0,90)")
ns["CFG"] = c
exec(trecho_alerta, ns)
ac = ns["alerta_confiavel"]
conf(ac(80, 0.70) is True, "rosto 80 px e 70%: alerta")
conf(ac(50, 0.90) is False, "rosto 50 px: sem alerta, mesmo com 90%")
conf(ac(100, 0.50) is False, "semelhança 50%: sem alerta, mesmo com rosto grande")
sys.exit(1 if falhas else 0)

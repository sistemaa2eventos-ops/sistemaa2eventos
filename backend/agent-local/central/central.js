'use strict';
/*
 * Central de Monitoramento (navegador). Sem dependências e sem build: é servida pelo agente do PC do
 * evento e fala só com ele (mesma origem).
 *  - cada câmera visível tem a sua conexão WebRTC com o retransmissor (go2rtc): miniatura no sub-stream,
 *    tela em foco no stream principal; fora da página atual, a conexão é fechada;
 *  - vigia de quadros: sem quadro novo por 5 s, reconecta sozinho (1, 2, 5, 10 s);
 *  - caixas da IA: uma consulta para todas as câmeras visíveis (150 ms em foco, 300 ms na grade);
 *  - watchlist: alvo no quadro acende a câmera em vermelho, toca o alarme e abre o alerta com a cena.
 */
(() => {
    const API = '/central/api';
    const RECONEXAO_MS = [1000, 2000, 5000, 10000];
    const SEM_QUADRO_MS = 5000;
    const ALERTA_REPETIR_MS = 30000;
    const MAX_ITENS = 60;

    const $ = (id) => document.getElementById(id);
    const el = (tag, cls, txt) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt !== undefined) e.textContent = txt;
        return e;
    };
    const imagem = (b64) => (!b64 ? '' : (String(b64).startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`));
    const hora = (ts) => new Date(ts * 1000).toLocaleTimeString('pt-BR');
    const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
    const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

    async function api(caminho, opcoes) {
        const r = await fetch(`${API}${caminho}`, { cache: 'no-store', ...opcoes });
        if (r.status === 401) { location.href = '/central/entrar'; throw new Error('sessão expirada'); }
        return r;
    }

    // ------------------------------------------------------------------ estado
    const st = {
        cameras: [],
        tiles: new Map(),     // id → Tile
        layout: ler('central_layout') || 'auto',
        pagina: 0,
        foco: null,           // id da câmera em foco
        motor: null,
        saude: null,
        watchlist: null,
        alertados: new Map(), // `${pessoa}:${camera}` → instante
        filaAlertas: [],
        modalAtual: null,
        desde: 0,
        inicioMotor: null,
        abertaEm: Date.now() / 1000,
        nAlertas: 0,
        nRec: 0
    };

    // ------------------------------------------------------------------ som
    const som = {
        ctx: null,
        querido: ler('central_som') !== 'off',
        ativar() {
            try {
                this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
                if (this.ctx.state === 'suspended') this.ctx.resume();
            } catch { this.ctx = null; }
            atualizarBotaoSom();
        },
        ativo() { return this.querido && this.ctx && this.ctx.state === 'running'; },
        alarme() {
            if (!this.ativo()) return;
            const t0 = this.ctx.currentTime;
            for (let i = 0; i < 3; i++) {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.type = 'square';
                o.frequency.setValueAtTime(i % 2 ? 660 : 990, t0 + i * 0.28);
                g.gain.setValueAtTime(0.0001, t0 + i * 0.28);
                g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.28 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.28 + 0.24);
                o.connect(g).connect(this.ctx.destination);
                o.start(t0 + i * 0.28);
                o.stop(t0 + i * 0.28 + 0.25);
            }
        }
    };
    function atualizarBotaoSom() {
        const b = $('som');
        if (!som.querido) { b.textContent = 'Som desligado'; b.classList.remove('ligado'); return; }
        if (som.ativo()) { b.textContent = 'Som ligado'; b.classList.add('ligado'); return; }
        b.textContent = 'Ativar som'; b.classList.remove('ligado');
    }
    $('som').addEventListener('click', () => {
        if (som.ativo()) { som.querido = false; guardar('central_som', 'off'); }
        else { som.querido = true; guardar('central_som', 'on'); som.ativar(); som.alarme(); }
        atualizarBotaoSom();
    });
    // O navegador só libera o áudio depois de um clique: o primeiro clique na página já liga
    document.addEventListener('pointerdown', () => { if (som.querido && !som.ativo()) som.ativar(); }, { capture: true });

    // ------------------------------------------------------------------ câmera (tile)
    class Tile {
        constructor(cam) {
            this.cam = cam;
            this.pc = null;
            this.qualidade = null;
            this.geracao = 0;
            this.falhas = 0;
            this.timerReconexao = null;
            this.ultimoQuadro = 0;
            this.conectadoEm = 0;
            this.fps = 0;
            this.caixas = [];
            this.alertaAte = 0;

            this.raiz = el('div', 'tile');
            this.raiz.tabIndex = 0;
            this.raiz.setAttribute('aria-label', cam.nome);
            this.video = el('video');
            this.video.muted = true;
            this.video.autoplay = true;
            this.video.playsInline = true;
            this.video.disablePictureInPicture = true;
            this.canvas = el('canvas');
            const rotulo = el('div', 'rotulo');
            const nome = el('span', 'nome');
            nome.append(el('span', 'ponto'), document.createTextNode(cam.nome));
            this.info = el('span', 'info', '');
            rotulo.append(nome, this.info);
            this.aviso = el('div', 'aviso', 'Conectando…');
            this.raiz.append(this.video, this.canvas, rotulo, this.aviso);

            this.raiz.addEventListener('click', () => alternarFoco(cam.id));
            this.raiz.addEventListener('keydown', (e) => { if (e.key === 'Enter') alternarFoco(cam.id); });
            this.video.addEventListener('loadedmetadata', () => this.desenhar());
            new ResizeObserver(() => this.desenhar()).observe(this.raiz);
            this.totalAnterior = 0;
        }

        /**
         * Quadros decodificados desde a última leitura. Usa o contador do decodificador e não o
         * requestVideoFrameCallback: este o Chrome desacelera quando algo cobre o vídeo (o alerta aberto),
         * o que parecia "imagem parada" e derrubava a conexão à toa.
         */
        quadrosNovos() {
            const q = this.video.getVideoPlaybackQuality ? this.video.getVideoPlaybackQuality() : null;
            const total = q ? q.totalVideoFrames : 0;
            const novos = total >= this.totalAnterior ? total - this.totalAnterior : total;
            this.totalAnterior = total;
            return novos;
        }

        async conectar(qualidade) {
            if (this.pc && this.qualidade === qualidade) return;
            this.desconectar();
            this.qualidade = qualidade;
            const g = ++this.geracao;
            this.aviso.textContent = 'Conectando…';
            const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
            this.pc = pc;
            try {
                pc.addTransceiver('video', { direction: 'recvonly' });
                pc.ontrack = (e) => {
                    // Vigilância: nada de colchão de reprodução, cada quadro vai para a tela assim que chega
                    try { e.receiver.jitterBufferTarget = 0; } catch { /* sem suporte */ }
                    try { e.receiver.playoutDelayHint = 0; } catch { /* sem suporte */ }
                    if (g !== this.geracao) return;
                    this.video.srcObject = e.streams[0] || new MediaStream([e.track]);
                    this.video.play().catch(() => {});
                };
                pc.addEventListener('connectionstatechange', () => {
                    if (g !== this.geracao) return;
                    if (pc.connectionState === 'connected') { this.falhas = 0; this.conectadoEm = performance.now(); }
                    if (pc.connectionState === 'failed') this.reconectar('conexão perdida');
                });
                await pc.setLocalDescription(await pc.createOffer());
                await new Promise((ok) => {
                    if (pc.iceGatheringState === 'complete') return ok();
                    const prazo = setTimeout(ok, 800);
                    pc.addEventListener('icegatheringstatechange', () => {
                        if (pc.iceGatheringState === 'complete') { clearTimeout(prazo); ok(); }
                    });
                });
                if (g !== this.geracao) return;
                const r = await api(`/camera/${encodeURIComponent(this.cam.id)}/webrtc?qualidade=${qualidade}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp,
                    signal: AbortSignal.timeout(10000)
                });
                if (!r.ok) throw new Error(r.status === 404 ? 'câmera fora do retransmissor' : `retransmissor ${r.status}`);
                const resposta = await r.text();
                if (g !== this.geracao) return;
                await pc.setRemoteDescription({ type: 'answer', sdp: resposta });
                this.conectadoEm = performance.now();
            } catch (err) {
                if (g === this.geracao) this.reconectar(err.message);
            }
        }

        reconectar(motivo) {
            const q = this.qualidade;
            this.desconectar();
            this.qualidade = q;
            const espera = RECONEXAO_MS[Math.min(this.falhas, RECONEXAO_MS.length - 1)];
            this.falhas++;
            this.aviso.textContent = `Sem vídeo (${motivo}). Reconectando em ${Math.round(espera / 1000)} s…`;
            clearTimeout(this.timerReconexao);
            this.timerReconexao = setTimeout(() => { if (this.qualidade) { const qq = this.qualidade; this.qualidade = null; this.conectar(qq); } }, espera);
        }

        desconectar() {
            this.geracao++;
            clearTimeout(this.timerReconexao);
            if (this.pc) { try { this.pc.close(); } catch { /* já fechado */ } }
            this.pc = null;
            this.qualidade = null;
            this.video.srcObject = null;
            this.totalAnterior = 0;
            this.ultimoQuadro = 0;
            this.raiz.classList.remove('ao-vivo');
            this.caixas = [];
            this.desenhar();
        }

        /** A cada segundo: fps exibido, vivo/parado */
        vigiar(agora) {
            this.fps = this.quadrosNovos();
            if (this.fps > 0) this.ultimoQuadro = agora;
            const vivo = !!this.pc && agora - this.ultimoQuadro < 2000;
            this.raiz.classList.toggle('ao-vivo', vivo);
            const res = this.video.videoWidth ? `${this.video.videoWidth}×${this.video.videoHeight}` : '';
            this.info.textContent = this.pc ? `${res}${res ? ' · ' : ''}${this.fps} fps` : '';
            // Conectado mas sem quadro novo: reconecta (câmera caiu e voltou, Wi-Fi oscilou...)
            if (this.pc && this.conectadoEm && agora - this.conectadoEm > 8000 && agora - this.ultimoQuadro > SEM_QUADRO_MS) {
                this.reconectar('imagem parada');
            }
            const emAlerta = Date.now() < this.alertaAte;
            this.raiz.classList.toggle('em-alerta', emAlerta);
        }

        definirCaixas(caixas) {
            this.caixas = caixas || [];
            this.desenhar();
        }

        desenhar() {
            const c = this.canvas;
            const dpr = window.devicePixelRatio || 1;
            const w = this.raiz.clientWidth;
            const h = this.raiz.clientHeight;
            if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
                c.width = Math.round(w * dpr);
                c.height = Math.round(h * dpr);
            }
            const ctx = c.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const vw = this.video.videoWidth;
            const vh = this.video.videoHeight;
            if (!this.caixas.length || !vw || !vh) return;
            const esc = Math.min(w / vw, h / vh);
            const aw = vw * esc;
            const ah = vh * esc;
            const ax = (w - aw) / 2;
            const ay = (h - ah) / 2;
            const grande = st.foco === this.cam.id;
            ctx.font = `700 ${grande ? 14 : 11}px "Segoe UI", system-ui, sans-serif`;
            for (const cx of this.caixas) {
                const [x1, y1, x2, y2] = cx.caixa || [];
                if (x2 === undefined) continue;
                const p = cx.pessoa;
                const alvo = p && (p.watchlist || p.bloqueado);
                const cor = alvo ? '#FF3366' : p ? '#00E08A' : cx.qualidade === 'optimal' ? '#FFD400' : '#94A3B8';
                const rx = ax + x1 * aw;
                const ry = ay + y1 * ah;
                const rw = (x2 - x1) * aw;
                const rh = (y2 - y1) * ah;
                ctx.lineWidth = alvo ? 4 : 2;
                ctx.strokeStyle = cor;
                ctx.strokeRect(rx, ry, rw, rh);
                let txt;
                if (p && p.watchlist) txt = `WATCHLIST · ${p.nome}`;
                else if (p && p.bloqueado) txt = `BLOQUEADO · ${p.nome}`;
                else if (p) txt = `${p.nome} ${Math.round((p.semelhanca || 0) * 100)}%`;
                else txt = ({ profile_view: 'De lado', low_resolution: 'Distante', blurry: 'Em movimento' })[cx.qualidade] || 'Desconhecido';
                const tw = ctx.measureText(txt).width + 10;
                const th = grande ? 20 : 16;
                const ty = ry - th - 2 < 0 ? ry + rh + 2 : ry - th - 2;
                ctx.fillStyle = cor;
                ctx.fillRect(rx - 1, ty, tw, th);
                ctx.fillStyle = '#06121B';
                ctx.fillText(txt, rx + 4, ty + th - (grande ? 5 : 4));
            }
        }
    }

    // ------------------------------------------------------------------ grade e foco
    function slotsDoLayout() {
        const n = st.cameras.length || 1;
        if (st.layout === 'auto') return n;
        return Number(st.layout);
    }

    function camerasDaPagina() {
        const por = slotsDoLayout();
        const paginas = Math.max(1, Math.ceil(st.cameras.length / por));
        st.pagina = Math.min(st.pagina, paginas - 1);
        return { lista: st.cameras.slice(st.pagina * por, st.pagina * por + por), paginas };
    }

    function montarGrade() {
        const grade = $('grade');
        grade.replaceChildren();
        grade.classList.toggle('foco', !!st.foco);
        let visiveis;
        if (st.foco) {
            const resto = st.cameras.filter(c => c.id !== st.foco).slice(0, 8);
            visiveis = [st.cameras.find(c => c.id === st.foco), ...resto].filter(Boolean);
            grade.style.gridTemplateColumns = resto.length ? 'minmax(0, 1fr) 240px' : 'minmax(0, 1fr)';
            // Coluna lateral com no mínimo 4 linhas: as miniaturas ficam no formato da imagem (não esticadas)
            const linhasFoco = resto.length ? Math.max(4, resto.length) : 1;
            grade.style.gridTemplateRows = `repeat(${linhasFoco}, minmax(0, 1fr))`;
            grade.style.setProperty('--linhas-foco', String(linhasFoco));
        } else {
            const { lista } = camerasDaPagina();
            visiveis = lista;
            const slots = Math.max(lista.length, st.layout === 'auto' ? lista.length : slotsDoLayout());
            const colunas = Math.ceil(Math.sqrt(slots || 1));
            const linhas = Math.ceil((slots || 1) / colunas);
            grade.style.gridTemplateColumns = `repeat(${colunas}, minmax(0, 1fr))`;
            grade.style.gridTemplateRows = `repeat(${linhas}, minmax(0, 1fr))`;
        }
        const ids = new Set(visiveis.map(c => c.id));
        // Fora da tela: conexão fechada (nada trafega nem decodifica à toa)
        for (const [id, t] of st.tiles) if (!ids.has(id)) t.desconectar();
        for (const cam of visiveis) {
            let t = st.tiles.get(cam.id);
            if (!t) { t = new Tile(cam); st.tiles.set(cam.id, t); }
            t.raiz.classList.toggle('principal', st.foco === cam.id);
            grade.append(t.raiz);
            t.conectar(st.foco === cam.id ? 'foco' : 'mini');
        }
        if (!visiveis.length) grade.append(el('p', 'vazio', 'Nenhuma câmera configurada neste evento.'));
        atualizarBotoesLayout();
    }

    function alternarFoco(id) {
        st.foco = st.foco === id ? null : id;
        montarGrade();
    }

    function atualizarBotoesLayout() {
        for (const b of document.querySelectorAll('#layouts button[data-layout]')) {
            b.classList.toggle('ativo', b.dataset.layout === st.layout && !st.foco);
        }
        const grupo = $('layouts');
        grupo.querySelectorAll('button[data-pagina]').forEach(b => b.remove());
        const { paginas } = camerasDaPagina();
        if (paginas > 1 && !st.foco) {
            const ant = el('button', '', '‹');
            ant.dataset.pagina = '-1';
            ant.title = 'Página anterior (←)';
            const prox = el('button', '', `${st.pagina + 1}/${paginas} ›`);
            prox.dataset.pagina = '1';
            prox.title = 'Próxima página (→)';
            grupo.append(ant, prox);
        }
    }

    $('layouts').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.pagina) {
            const { paginas } = camerasDaPagina();
            st.pagina = (st.pagina + Number(b.dataset.pagina) + paginas) % paginas;
        } else {
            st.layout = b.dataset.layout;
            st.pagina = 0;
            guardar('central_layout', st.layout);
        }
        st.foco = null;
        montarGrade();
    });

    $('telaCheia').addEventListener('click', alternarTelaCheia);
    function alternarTelaCheia() {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
    }

    document.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === 'Escape') {
            if (!$('modal').hidden) fecharModal();
            else if (st.foco) { st.foco = null; montarGrade(); }
        } else if (e.key === 'f' || e.key === 'F') alternarTelaCheia();
        else if (e.key === 'a' || e.key === 'A') { st.layout = 'auto'; st.foco = null; montarGrade(); }
        else if (['1', '2', '3', '4'].includes(e.key)) { st.layout = ['1', '4', '9', '16'][Number(e.key) - 1]; st.pagina = 0; st.foco = null; guardar('central_layout', st.layout); montarGrade(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const { paginas } = camerasDaPagina();
            if (paginas > 1 && !st.foco) { st.pagina = (st.pagina + (e.key === 'ArrowRight' ? 1 : -1) + paginas) % paginas; montarGrade(); }
        }
    });

    // ------------------------------------------------------------------ caixas da IA
    async function cicloCaixas() {
        const visiveis = [...st.tiles.values()].filter(t => t.pc && t.cam.ia);
        let espera = st.foco ? 150 : 300;
        if (visiveis.length) {
            const foco = visiveis.filter(t => t.cam.id === st.foco).map(t => t.cam.id);
            const mini = visiveis.filter(t => t.cam.id !== st.foco).map(t => t.cam.id);
            try {
                const r = await api(`/caixas?foco=${foco.join(',')}&mini=${mini.join(',')}`, { signal: AbortSignal.timeout(3000) });
                const j = await r.json();
                st.motor = !!j.motor;
                for (const t of visiveis) {
                    const d = j.cameras?.[t.cam.id];
                    t.definirCaixas(d ? d.caixas : []);
                    for (const cx of (d?.caixas || [])) {
                        if (cx.pessoa && cx.pessoa.watchlist) alvoNaTela(t, cx.pessoa);
                    }
                }
            } catch {
                st.motor = false;
                espera = 2000;
            }
        } else {
            espera = 500;
        }
        setTimeout(cicloCaixas, espera);
    }

    /** Alvo visto no quadro ao vivo: a câmera pisca na hora (o alerta completo vem com a cena, abaixo) */
    function alvoNaTela(tile, pessoa) {
        tile.alertaAte = Date.now() + 6000;
        tile.raiz.classList.add('em-alerta');
        const chave = `${pessoa.id}:${tile.cam.id}`;
        const antes = st.alertados.get(chave) || 0;
        if (Date.now() - antes > ALERTA_REPETIR_MS && !silenciado(pessoa.id)) {
            st.alertados.set(chave, Date.now());
            som.alarme();
            abrirAlerta({
                pessoa, camera_id: tile.cam.id, camera: tile.cam.nome, ts: Date.now() / 1000, quadro: null
            });
        }
    }

    // ------------------------------------------------------------------ reconhecimentos e alertas
    async function cicloReconhecimentos() {
        try {
            const r = await api(`/reconhecimentos?desde=${st.desde}`, { signal: AbortSignal.timeout(5000) });
            const j = await r.json();
            if (j.motor) {
                if (j.inicio !== undefined && j.inicio !== st.inicioMotor) {
                    // Motor reiniciou: a numeração recomeçou
                    const primeiraVez = st.inicioMotor === null;
                    st.inicioMotor = j.inicio;
                    if (!primeiraVez) { st.desde = 0; }
                }
                for (const it of j.itens || []) {
                    st.desde = Math.max(st.desde, it.seq);
                    registrar(it);
                }
            }
        } catch { /* motor desligado: tenta de novo */ }
        setTimeout(cicloReconhecimentos, 1000);
    }

    function registrar(it) {
        for (const p of it.pessoas || []) {
            const alvo = !!(p.watchlist || p.bloqueado);
            const item = el('div', `item${alvo ? ' alvo' : ''}`);
            const img = el('img');
            img.alt = '';
            if (p.rosto) img.src = imagem(p.rosto);
            const txt = el('div', 'txt');
            txt.append(
                el('div', 'n', p.watchlist ? `WATCHLIST · ${p.nome}` : p.bloqueado ? `BLOQUEADO · ${p.nome}` : p.nome),
                el('div', 'd', `${it.camera} · ${hora(it.ts)} · ${Math.round((p.semelhanca || 0) * 100)}%`)
            );
            item.append(img, txt);
            item.addEventListener('click', () => {
                if (alvo) abrirAlerta({ pessoa: p, camera_id: it.camera_id, camera: it.camera, ts: it.ts, quadro: it.quadro, rosto: p.rosto });
                else if (st.tiles.has(it.camera_id) || st.cameras.some(c => c.id === it.camera_id)) { st.foco = it.camera_id; montarGrade(); }
            });
            const lista = alvo ? $('alertas') : $('reconhecimentos');
            lista.querySelector('.vazio')?.remove();
            lista.prepend(item);
            while (lista.children.length > MAX_ITENS) lista.lastChild.remove();
            if (alvo) { st.nAlertas++; $('contAlertas').textContent = String(st.nAlertas); }
            else { st.nRec++; $('contRec').textContent = String(st.nRec); }

            // Alerta com a cena: só para reconhecimentos novos (não os de antes de abrir a Central)
            if (alvo && it.ts > st.abertaEm - 5) {
                const chave = `${p.id}:${it.camera_id}`;
                const tile = st.tiles.get(it.camera_id);
                if (tile) tile.alertaAte = Date.now() + 10000;
                const antes = st.alertados.get(chave) || 0;
                // Já alertado pelo quadro ao vivo: só completa o alerta aberto com a cena e o rosto
                if (st.modalAtual && st.modalAtual.pessoa.id === p.id && st.modalAtual.camera_id === it.camera_id && it.quadro) {
                    st.modalAtual.quadro = it.quadro;
                    st.modalAtual.rosto = p.rosto;
                    preencherModal(st.modalAtual);
                } else if (Date.now() - antes > ALERTA_REPETIR_MS && !silenciado(p.id)) {
                    st.alertados.set(chave, Date.now());
                    som.alarme();
                    abrirAlerta({ pessoa: p, camera_id: it.camera_id, camera: it.camera, ts: it.ts, quadro: it.quadro, rosto: p.rosto });
                }
            }
        }
    }

    // "Ciente": o operador já sabe deste alvo; por 5 min a janela não reabre para ele
    // (a câmera continua piscando e a lista continua registrando cada aparição)
    const CIENTE_MS = 5 * 60000;
    const cientes = new Map(); // pessoa_id → até quando
    const silenciado = (pessoaId) => (cientes.get(pessoaId) || 0) > Date.now();

    function abrirAlerta(a) {
        if (silenciado(a.pessoa.id)) return;
        if (st.modalAtual) {
            // Mesmo alvo já na tela ou na fila: não empilha repetidos
            if (st.modalAtual.pessoa.id === a.pessoa.id || st.filaAlertas.some(f => f.pessoa.id === a.pessoa.id)) return;
            st.filaAlertas.push(a);
            return;
        }
        st.modalAtual = a;
        preencherModal(a);
        $('modal').hidden = false;
        $('modalCiente').focus();
    }

    function preencherModal(a) {
        const p = a.pessoa;
        $('modalTitulo').textContent = p.watchlist ? 'ALVO DA WATCHLIST LOCALIZADO' : 'PESSOA BLOQUEADA DETECTADA';
        $('modalNome').textContent = p.nome || 'Sem nome';
        $('modalMotivo').textContent = p.watchlist?.motivo || '';
        $('modalCamera').textContent = a.camera || '';
        $('modalHora').textContent = hora(a.ts);
        $('modalSemelhanca').textContent = p.semelhanca ? `${Math.round(p.semelhanca * 100)}%` : '—';
        $('modalNivel').textContent = p.watchlist?.nivel || (p.bloqueado ? 'bloqueado' : '—');
        const q = $('modalQuadro');
        q.hidden = !a.quadro;
        if (a.quadro) q.src = imagem(a.quadro);
        const rosto = $('modalRosto');
        rosto.hidden = !a.rosto;
        if (a.rosto) rosto.src = imagem(a.rosto);
    }

    function fecharModal(ciente) {
        if (ciente === true && st.modalAtual) cientes.set(st.modalAtual.pessoa.id, Date.now() + CIENTE_MS);
        $('modal').hidden = true;
        st.modalAtual = null;
        let prox;
        while ((prox = st.filaAlertas.shift()) && silenciado(prox.pessoa.id)) { /* descarta os já cientes */ }
        if (prox) abrirAlerta(prox);
    }
    $('modalCiente').addEventListener('click', () => fecharModal(true));
    $('modalVer').addEventListener('click', () => {
        const id = st.modalAtual?.camera_id;
        fecharModal(true);
        if (id && st.cameras.some(c => c.id === id)) { st.foco = id; montarGrade(); }
    });

    // ------------------------------------------------------------------ barra de estados
    function chip(txt, tipo, titulo) {
        const c = el('span', `chip ${tipo || ''}`, txt);
        if (titulo) c.title = titulo;
        return c;
    }

    function atualizarEstados() {
        const tiles = [...st.tiles.values()].filter(t => t.pc);
        const vivas = tiles.filter(t => t.raiz.classList.contains('ao-vivo')).length;
        const chips = [
            chip(`Câmeras ao vivo ${vivas}/${tiles.length}`, vivas === tiles.length && tiles.length ? 'ok' : 'alerta'),
            chip('Vídeo direto (WebRTC)', 'ok', 'Sem passar pela internet'),
            st.motor === false ? chip('Motor de IA desligado', 'erro')
                : chip(`IA ${st.saude?.gpu ? 'na GPU' : 'ativa'}${st.saude?.ocupacao != null ? ` · ${Math.round(st.saude.ocupacao * 100)}%` : ''}`, st.motor ? 'ok' : '', st.saude?.perfil ? `Perfil ${st.saude.perfil}` : ''),
        ];
        if (st.watchlist) {
            const idade = st.watchlist.atualizada_em ? Math.round((Date.now() - st.watchlist.atualizada_em) / 60000) : null;
            chips.push(chip(`Watchlist: ${st.watchlist.alvos} alvo(s)`, idade === null || idade > 10 ? 'alerta' : 'ok',
                idade === null ? 'Lista ainda não recebida do servidor' : `Atualizada há ${idade} min`));
        }
        $('estados').replaceChildren(...chips);
    }

    async function cicloSaude() {
        try {
            const [s, e] = await Promise.all([
                api('/saude', { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
                api('/estado', { signal: AbortSignal.timeout(4000) }).then(r => r.json())
            ]);
            st.saude = s.motor ? s : null;
            if (!s.motor) st.motor = false;
            st.watchlist = e.watchlist;
            // Câmera nova ou removida no painel: refaz a grade
            const ids = (e.cameras || []).map(c => c.id).join(',');
            if (ids !== st.cameras.map(c => c.id).join(',')) {
                st.cameras = e.cameras || [];
                for (const [id, t] of st.tiles) if (!st.cameras.some(c => c.id === id)) { t.desconectar(); st.tiles.delete(id); }
                if (st.foco && !st.cameras.some(c => c.id === st.foco)) st.foco = null;
                montarGrade();
            }
        } catch { /* agente reiniciando */ }
        atualizarEstados();
        setTimeout(cicloSaude, 5000);
    }

    setInterval(() => {
        const agora = performance.now();
        for (const t of st.tiles.values()) if (t.pc || t.qualidade) t.vigiar(agora);
        $('relogio').textContent = new Date().toLocaleTimeString('pt-BR');
    }, 1000);
    setInterval(atualizarEstados, 2000);

    // ------------------------------------------------------------------ início
    async function iniciar() {
        atualizarBotaoSom();
        try {
            const e = await (await api('/estado')).json();
            st.cameras = e.cameras || [];
            st.watchlist = e.watchlist;
        } catch { st.cameras = []; }
        montarGrade();
        atualizarEstados();
        cicloCaixas();
        cicloReconhecimentos();
        setTimeout(cicloSaude, 1000);
    }
    iniciar();
})();

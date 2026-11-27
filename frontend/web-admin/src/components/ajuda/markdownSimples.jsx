import React from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider } from '@mui/material';
import { cores, tom } from '../../styles/tokens';

/**
 * Markdown simples dos manuais do sistema (títulos, parágrafos, listas com sub-itens, lista de conferência
 * "- [ ]", tabelas, citação ">", linha "---", **negrito**, *itálico* e `código`).
 * Gera elementos React (nunca HTML cru): o texto não executa nada na página.
 */

export const ancora = (texto) => String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------- blocos
const RE_TITULO = /^(#{1,4})\s+(.*)$/;
const RE_LISTA = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const ehLinhaTabela = (l) => /^\s*\|/.test(l);
const ehSeparadorTabela = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

/** Texto → lista de blocos { tipo, ... } */
export function lerBlocos(texto) {
    const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
    const blocos = [];
    let i = 0;
    while (i < linhas.length) {
        const l = linhas[i];
        if (!l.trim()) { i++; continue; }

        const t = l.match(RE_TITULO);
        if (t) { blocos.push({ tipo: 'titulo', nivel: t[1].length, texto: t[2].trim() }); i++; continue; }

        if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { blocos.push({ tipo: 'linha' }); i++; continue; }

        if (/^\s*>/.test(l)) {
            const partes = [];
            while (i < linhas.length && /^\s*>/.test(linhas[i])) partes.push(linhas[i++].replace(/^\s*>\s?/, ''));
            blocos.push({ tipo: 'citacao', texto: partes.join(' ') });
            continue;
        }

        if (ehLinhaTabela(l) && i + 1 < linhas.length && ehSeparadorTabela(linhas[i + 1])) {
            const cabecalho = celulas(l);
            i += 2;
            const linhasTabela = [];
            while (i < linhas.length && ehLinhaTabela(linhas[i])) linhasTabela.push(celulas(linhas[i++]));
            blocos.push({ tipo: 'tabela', cabecalho, linhas: linhasTabela });
            continue;
        }

        if (RE_LISTA.test(l)) {
            // Itens com o recuo e a ordem de cada um; sub-itens (recuo maior) ficam dentro do anterior
            const itens = [];
            while (i < linhas.length) {
                const m = linhas[i].match(RE_LISTA);
                if (m) {
                    let texto = m[3];
                    let marcado = null;
                    const c = texto.match(/^\[( |x|X)\]\s+(.*)$/);
                    if (c) { marcado = c[1] !== ' '; texto = c[2]; }
                    itens.push({ recuo: m[1].length, numerada: /\d/.test(m[2]), texto, marcado });
                    i++;
                } else if (linhas[i].trim() && /^\s{2,}/.test(linhas[i]) && itens.length) {
                    itens[itens.length - 1].texto += ` ${linhas[i].trim()}`; // continuação do item
                    i++;
                } else break;
            }
            blocos.push({ tipo: 'lista', itens: aninhar(itens) });
            continue;
        }

        const partes = [];
        while (i < linhas.length && linhas[i].trim() && !RE_TITULO.test(linhas[i]) && !RE_LISTA.test(linhas[i])
            && !/^\s*>/.test(linhas[i]) && !ehLinhaTabela(linhas[i]) && !/^\s*-{3,}\s*$/.test(linhas[i])) {
            partes.push(linhas[i++].trim());
        }
        if (!partes.length) partes.push(linhas[i++].trim()); // ex.: linha com "|" que não forma tabela
        blocos.push({ tipo: 'paragrafo', texto: partes.join(' ') });
    }
    return blocos;
}

function aninhar(itens) {
    const raiz = [];
    const pilha = [{ recuo: -1, filhos: raiz }];
    for (const it of itens) {
        while (pilha.length > 1 && it.recuo <= pilha[pilha.length - 1].recuo) pilha.pop();
        const no = { ...it, filhos: [] };
        pilha[pilha.length - 1].filhos.push(no);
        pilha.push({ recuo: it.recuo, filhos: no.filhos });
    }
    return raiz;
}

/** Texto puro de um bloco (busca) */
export function textoDoBloco(b) {
    if (b.tipo === 'tabela') return [b.cabecalho, ...b.linhas].flat().join(' ');
    if (b.tipo === 'lista') {
        const juntar = (lista) => lista.map(it => `${it.texto} ${juntar(it.filhos)}`).join(' ');
        return juntar(b.itens);
    }
    return b.texto || '';
}

// ---------------------------------------------------------------------------- texto da linha
const RE_INLINE = /\*\*(.+?)\*\*|`([^`]+)`|(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])/g;

export function Inline({ texto }) {
    const saida = [];
    let ultimo = 0;
    let n = 0;
    for (const m of String(texto).matchAll(RE_INLINE)) {
        if (m.index > ultimo) saida.push(texto.slice(ultimo, m.index));
        if (m[1] !== undefined) saida.push(<strong key={n++}><Inline texto={m[1]} /></strong>);
        else if (m[2] !== undefined) saida.push(
            <Box key={n++} component="code" sx={{ fontFamily: 'monospace', fontSize: '0.85em', px: 0.5, py: 0.1, borderRadius: 0.5, bgcolor: tom(cores.primaria, 0.08), color: '#7DD3FC', wordBreak: 'break-all' }}>{m[2]}</Box>
        );
        else saida.push(<em key={n++}>{m[3]}</em>);
        ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) saida.push(texto.slice(ultimo));
    return <>{saida}</>;
}

// ---------------------------------------------------------------------------- blocos → tela
function Lista({ itens }) {
    const numerada = itens[0]?.numerada;
    return (
        <Box component={numerada ? 'ol' : 'ul'} sx={{ pl: 3, my: 1, '& li': { mb: 0.5 } }}>
            {itens.map((it, idx) => (
                <Box component="li" key={idx} sx={it.marcado !== null ? { listStyle: 'none', ml: -2.5 } : null}>
                    <Typography component="span" variant="body2" sx={{ color: cores.textoSuave, lineHeight: 1.7 }}>
                        {it.marcado !== null && <Box component="span" sx={{ mr: 1, color: cores.primaria }} aria-hidden>{it.marcado ? '☑' : '☐'}</Box>}
                        <Inline texto={it.texto} />
                    </Typography>
                    {it.filhos.length > 0 && <Lista itens={it.filhos} />}
                </Box>
            ))}
        </Box>
    );
}

export function Bloco({ bloco }) {
    switch (bloco.tipo) {
        case 'titulo': {
            const v = { 1: 'h5', 2: 'h6', 3: 'subtitle1', 4: 'subtitle2' }[bloco.nivel];
            return (
                <Typography id={ancora(bloco.texto)} variant={v} component={`h${bloco.nivel}`}
                    sx={{ fontWeight: 700, color: bloco.nivel <= 2 ? cores.textoForte : cores.textoSuave, mt: bloco.nivel <= 2 ? 3 : 2, mb: 1, scrollMarginTop: 80 }}>
                    <Inline texto={bloco.texto} />
                </Typography>
            );
        }
        case 'linha': return <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />;
        case 'citacao':
            return (
                <Box sx={{ borderLeft: '3px solid #FFB800', bgcolor: 'rgba(255,184,0,0.06)', px: 2, py: 1, my: 1.5, borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ color: '#FDE68A' }}><Inline texto={bloco.texto} /></Typography>
                </Box>
            );
        case 'tabela':
            return (
                <TableContainer sx={{ my: 1.5, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1, overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>{bloco.cabecalho.map((c, i) => <TableCell key={i} sx={{ fontWeight: 700, color: cores.textoForte, bgcolor: 'rgba(255,255,255,0.04)' }}><Inline texto={c} /></TableCell>)}</TableRow>
                        </TableHead>
                        <TableBody>
                            {bloco.linhas.map((l, i) => (
                                <TableRow key={i}>{l.map((c, j) => <TableCell key={j} sx={{ color: cores.textoSuave, verticalAlign: 'top' }}><Inline texto={c} /></TableCell>)}</TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            );
        case 'lista': return <Lista itens={bloco.itens} />;
        default:
            return <Typography variant="body2" sx={{ color: cores.textoSuave, my: 1, lineHeight: 1.7 }}><Inline texto={bloco.texto} /></Typography>;
    }
}

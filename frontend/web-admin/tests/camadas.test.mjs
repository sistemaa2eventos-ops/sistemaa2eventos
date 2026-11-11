import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ordenarPorCamada,
    normalizarCamadas,
    reordenarCamadas,
    agruparElementos,
    desagruparElementos,
    caixaDoGrupo,
    idsNaArea,
    escalarItem,
    alinharEntreSi
} from '../src/pages/config/etiquetas/camadas.js';

test('ordenarPorCamada e normalizarCamadas ordenam do fundo para a frente', () => {
    const itens = [
        { id: 'a', zIndex: 30 },
        { id: 'b', zIndex: 10 },
        { id: 'c', zIndex: 20 }
    ];
    const normalizados = normalizarCamadas(itens);
    assert.deepEqual(normalizados.map(i => i.id), ['a', 'b', 'c']);
    const ordem = ordenarPorCamada(normalizados);
    assert.deepEqual(ordem.map(i => i.id), ['b', 'c', 'a']);
    assert.equal(ordem[0].zIndex, 10);
    assert.equal(ordem[1].zIndex, 11);
    assert.equal(ordem[2].zIndex, 12);
});

test('reordenarCamadas: trazer para frente e enviar para trás', () => {
    const itens = normalizarCamadas([
        { id: '1', zIndex: 10 },
        { id: '2', zIndex: 11 },
        { id: '3', zIndex: 12 }
    ]);

    // Enviar o '3' para trás
    const paraTras = reordenarCamadas(itens, ['3'], 'tras');
    const ordemTras = ordenarPorCamada(paraTras);
    assert.equal(ordemTras[0].id, '3');

    // Trazer o '1' para frente
    const paraFrente = reordenarCamadas(itens, ['1'], 'frente');
    const ordemFrente = ordenarPorCamada(paraFrente);
    assert.equal(ordemFrente[ordemFrente.length - 1].id, '1');
});

test('agruparElementos une elementos sob mesmo groupId e desagruparElementos remove', () => {
    const itens = normalizarCamadas([
        { id: 'a', zIndex: 10 },
        { id: 'b', zIndex: 11 },
        { id: 'c', zIndex: 12 }
    ]);
    const agrupados = agruparElementos(itens, ['a', 'c']);
    const a = agrupados.find(i => i.id === 'a');
    const c = agrupados.find(i => i.id === 'c');
    assert.ok(a.groupId);
    assert.equal(a.groupId, c.groupId);

    const desagrupados = desagruparElementos(agrupados, ['a']);
    const aDes = desagrupados.find(i => i.id === 'a');
    assert.equal(aDes.groupId, undefined);
});

test('caixaDoGrupo e idsNaArea calculam a área de seleção por arraste do mouse', () => {
    const itens = [
        { id: '1', x: 10, y: 10, width: 50, height: 20 },
        { id: '2', x: 100, y: 100, width: 40, height: 40 },
        { id: '3', x: 200, y: 200, width: 30, height: 30, locked: true }
    ];
    const caixa = caixaDoGrupo(itens.slice(0, 2));
    assert.deepEqual(caixa, { x: 10, y: 10, width: 130, height: 130 });

    // Área do mouse que pega apenas o item 1
    const pegou1 = idsNaArea(itens, { x: 0, y: 0, width: 70, height: 40 });
    assert.deepEqual(pegou1, ['1']);

    // Área que pega itens 1 e 2, ignorando o 3 travado
    const pegouTodos = idsNaArea(itens, { x: 0, y: 0, width: 300, height: 300 });
    assert.deepEqual(pegouTodos, ['1', '2']);
});

test('escalarItem redimensiona proporcionalmente ou livre', () => {
    const item = { id: 'foto', x: 20, y: 20, width: 50, height: 50, lockAspectRatio: true };
    const caixaOrig = { x: 10, y: 10, width: 100, height: 100 };
    const caixaNova = { x: 10, y: 10, width: 200, height: 200 };

    const escalado = escalarItem(item, caixaOrig, caixaNova);
    assert.equal(escalado.width, 100);
    assert.equal(escalado.height, 100);
    assert.equal(escalado.x, 30);
    assert.equal(escalado.y, 30);
});

test('alinharEntreSi alinha centros e extremidades entre os selecionados', () => {
    const itens = [
        { id: 'a', x: 10, y: 10, width: 20, height: 20 },
        { id: 'b', x: 50, y: 30, width: 40, height: 20 }
    ];
    const alinhadoEsq = alinharEntreSi(itens, 'esquerda');
    assert.equal(alinhadoEsq.a.x, 10);
    assert.equal(alinhadoEsq.b.x, 10);

    const alinhadoTopo = alinharEntreSi(itens, 'topo');
    assert.equal(alinhadoTopo.a.y, 10);
    assert.equal(alinhadoTopo.b.y, 10);
});


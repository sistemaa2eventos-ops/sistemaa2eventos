# ADR 0004: Sincronização Offline, PWA e Resiliência a Conexões Ruins
**Status:** Proposto  
**Data:** 19/11/2026  
**Decisores:** Arquiteto de Software / Tech Lead, Time Frontend & Mobile  

---

## Contexto
Montagens de grandes eventos frequentemente ocorrem em locais com cobertura precária de celular e Wi-Fi (estádios com concreto espesso, autódromos em áreas rurais, subsolos de centro de convenções, galpões metálicos).
O produtor em campo precisa:
1. Visualizar sua lista de tarefas e etapas mesmo sem sinal de internet.
2. Iniciar tarefas, marcar checklists, gravar comentários em áudio e registrar fotos de evidência.
3. Não perder nenhum dado ou sofrer com "telas travadas" ou erros de rede.
4. Ter os dados sincronizados automaticamente com o servidor assim que a conexão 4G/Wi-Fi for restabelecida.

## Decisão
1. **Extensão do Banco Local IndexedDB via Dexie (`A2EventosDB`)**:
   - Criamos tabelas locais dedicadas no IndexedDB do navegador:
     - `tarefas_cache`: Cache local das tarefas atribuídas ao produtor da área.
     - `evidencias_pendentes`: Fila de fotos, áudios, textos e coordenadas geográficas gravados em modo offline.
     - `propostas_planta_pendentes`: Rascunhos de alterações vetoriais feitas na planta em campo.
2. **Identificadores Únicos Universais (UUID v4 no Cliente)**:
   - Toda entidade criada offline (uma nova evidência, um log de progresso, um comentário) recebe um `id` (UUID v4) gerado diretamente no cliente antes de entrar na fila. Isso garante idempotência: caso o envio seja reenviado por instabilidade de rede, o backend reconhece o registro via `upsert` e não gera duplicidade.
3. **Compressão no Cliente Antes do Enfileiramento**:
   - Fotos capturadas pela câmera do aparelho no PWA são redimensionadas no cliente (Canvas API / Web Worker) para no máximo 1920x1080 com compressão JPEG/WebP de qualidade 0.8 (~300-800 KB). O arquivo original bruto de 12 MB nunca entra na fila de upload de campo.
4. **Gerenciador de Fila Offline (`ProducaoSyncService`)**:
   - Inspirado no `LocalCheckinService` existente, o serviço escuta eventos de conectividade (`online`/`offline`) e dispara a sincronização automática em lote quando a rede voltar, atualizando a UI via eventos customizados.
5. **Resolução de Conflitos**:
   - Política: *Last-Write-Wins (LWW)* com base em timestamp do cliente para checklists simples. Para alterações de plantas, intervenções nunca sobrescrevem a oficial diretamente; são salvas como propostas independentes ligadas ao ID do produtor, evitando colisões destrutivas.

## Consequências
- A experiência do produtor no celular torna-se instantânea (UI otimista).
- Redução drástica do consumo de dados da franquia móvel de campo.
- Alta confiabilidade para auditoria do evento.

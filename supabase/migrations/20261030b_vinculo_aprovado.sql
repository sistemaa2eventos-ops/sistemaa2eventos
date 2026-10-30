-- Vínculo pessoa ↔ empresa aprovado para quem já está autorizado.
-- O botão Aprovar do painel (PATCH /pessoas/:id/status) mudava só pessoas.status_acesso e
-- deixava pessoa_evento_empresa.status_aprovacao = 'pendente': a pessoa ficava fora da cota
-- da empresa e do portal da empresa. O código corrigido mantém os dois iguais; isto acerta o passado.
-- Idempotente: só toca vínculos pendentes de pessoas autorizadas, dentro ou que já saíram.

update public.pessoa_evento_empresa pe
set status_aprovacao = 'aprovado',
    updated_at = now()
from public.pessoas p
where p.id = pe.pessoa_id
  and p.evento_id = pe.evento_id
  and pe.status_aprovacao = 'pendente'
  and p.status_acesso in ('autorizado', 'checkin_feito', 'checkout_feito');

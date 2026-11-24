-- CURRENT_DATE do banco é UTC: entre 21h e 24h (Brasília) a data local de hoje é "ontem" em UTC e o CHECK
-- recusava a liberação. O backend já grava a data no fuso do evento; o histórico fica guardado (sem limpeza diária).
ALTER TABLE public.documento_liberacoes DROP CONSTRAINT IF EXISTS chk_data_liberacao_positiva;

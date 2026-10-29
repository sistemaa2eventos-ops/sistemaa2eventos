import { useState, useCallback, useEffect } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

/**
 * Regras de remuneração do evento (diária, meia diária, horas extras, dobra).
 * A empresa escolhe uma regra padrão e, se precisar, uma regra por função.
 */
export const useRemuneracao = ({ carregar = true } = {}) => {
    const { enqueueSnackbar } = useSnackbar();
    const [regras, setRegras] = useState([]);
    const [carregando, setCarregando] = useState(false);
    // false quando a migration ainda não rodou: a tela esconde os campos em vez de quebrar o cadastro
    const [disponivel, setDisponivel] = useState(true);

    const carregarRegras = useCallback(async () => {
        try {
            setCarregando(true);
            const { data } = await api.get('/remuneracao/regras');
            setRegras(data?.data || []);
            setDisponivel(true);
        } catch (error) {
            setRegras([]);
            setDisponivel(false);
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { if (carregar) carregarRegras(); }, [carregar, carregarRegras]);

    const salvarRegra = async (regra) => {
        try {
            const { data } = regra.id
                ? await api.put(`/remuneracao/regras/${regra.id}`, regra)
                : await api.post('/remuneracao/regras', regra);
            enqueueSnackbar('Regra salva.', { variant: 'success' });
            await carregarRegras();
            return data?.data;
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar a regra.', { variant: 'error' });
            return null;
        }
    };

    const excluirRegra = async (id) => {
        try {
            await api.delete(`/remuneracao/regras/${id}`);
            enqueueSnackbar('Regra excluída.', { variant: 'success' });
            await carregarRegras();
            return true;
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao excluir a regra.', { variant: 'error' });
            return false;
        }
    };

    const carregarFuncoes = useCallback(async (empresaId) => {
        try {
            const { data } = await api.get('/remuneracao/funcoes', { params: { empresa_id: empresaId || undefined } });
            return data?.data || [];
        } catch {
            return [];
        }
    }, []);

    return { regras, carregando, disponivel, carregarRegras, salvarRegra, excluirRegra, carregarFuncoes };
};

/**
 * Mesma conta do backend (remuneracao.service.js → calcularDia), só para o exemplo
 * na tela de cadastro. O valor que vale é sempre o calculado no servidor.
 */
export const simularDia = (minutos, r) => {
    const jornada = Number(r.jornada_horas) || 0;
    if (!jornada) return null;
    const tolerancia = Number(r.tolerancia_minutos) || 0;
    const valorDiaria = Number(String(r.valor_diaria ?? 0).replace(',', '.')) || 0;
    const horas = minutos / 60;
    let diarias = 0;
    if (horas >= (Number(r.horas_minimas_diaria) || 0)) diarias = 1;
    else if (r.meia_diaria && horas >= (Number(r.horas_minimas_meia) || 0)) diarias = 0.5;
    let extras = 0;
    if (diarias > 0 && r.excedente_modo === 'dobra') {
        const limite = (Number(r.horas_para_dobra) || jornada) * 60;
        if (minutos > limite + tolerancia) diarias = 2;
    } else if (diarias > 0 && r.excedente_modo === 'horas_extras') {
        const excedente = minutos - jornada * 60;
        if (excedente > tolerancia) extras = excedente;
    }
    const fixo = r.valor_hora_extra !== null && r.valor_hora_extra !== undefined && r.valor_hora_extra !== '';
    const valorHora = fixo
        ? Number(String(r.valor_hora_extra).replace(',', '.'))
        : (valorDiaria / jornada) * (1 + (Number(r.percentual_hora_extra) || 0) / 100);
    const total = Math.round((diarias * valorDiaria + (extras / 60) * valorHora) * 100) / 100;
    return { diarias, extras, total };
};

export const formatarMoeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarHoras = (min) => {
    const m = Math.max(0, Math.round(Number(min) || 0));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}h ${String(m % 60).padStart(2, '0')}m`;
};

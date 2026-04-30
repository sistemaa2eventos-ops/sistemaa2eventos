# corrigir-funcionarios.ps1
Write-Host "🔧 CORRIGINDO CONTROLLER DE FUNCIONÁRIOS" -ForegroundColor Cyan

# Criar o controller corrigido
@"
const { supabase } = require('../config/supabase');
const logger = require('../services/logger');
const qrGenerator = require('../utils/qrGenerator');

class FuncionarioController {
    async list(req, res) {
        try {
            const { data, error } = await supabase
                .from('funcionarios')
                .select('*, empresas(nome)');
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const { nome, cpf, funcao, empresa_id } = req.body;
            const qrData = await qrGenerator.generate(cpf);
            
            const { data, error } = await supabase
                .from('funcionarios')
                .insert([{ 
                    nome, cpf, funcao, empresa_id,
                    qr_code: qrData.code,
                    created_by: req.user?.id 
                }])
                .select();
            
            if (error) throw error;
            res.status(201).json({ 
                success: true, 
                data: data[0],
                qr_code: qrData.image 
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await supabase
                .from('funcionarios')
                .select('*, empresas(nome)')
                .eq('id', id)
                .single();
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const { data, error } = await supabase
                .from('funcionarios')
                .update(updates)
                .eq('id', id)
                .select();
            if (error) throw error;
            res.json({ success: true, data: data[0] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('funcionarios')
                .delete()
                .eq('id', id);
            if (error) throw error;
            res.json({ success: true, message: 'Funcionário deletado com sucesso' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async generateQRCode(req, res) {
        try {
            const { id } = req.params;
            const { data: funcionario, error } = await supabase
                .from('funcionarios')
                .select('cpf, nome')
                .eq('id', id)
                .single();
            if (error) throw error;
            
            const qrData = await qrGenerator.generate(funcionario.cpf);
            res.json({
                success: true,
                qr_code: qrData.image,
                code: qrData.code,
                funcionario: funcionario.nome
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new FuncionarioController();
"@ | Out-File -FilePath src\controllers\funcionarioController.js -Encoding UTF8 -Force

Write-Host "✅ Controller de funcionários corrigido!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Reinicie o servidor:" -ForegroundColor Yellow
Write-Host "npm run dev" -ForegroundColor Cyan
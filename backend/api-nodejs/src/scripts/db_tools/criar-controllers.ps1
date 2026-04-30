# criar-controllers.ps1
Write-Host "🔧 CRIANDO CONTROLLERS FALTANTES" -ForegroundColor Cyan

# Criar pasta controllers se não existir
New-Item -ItemType Directory -Path src\controllers -Force

# Criar empresaController.js
@"
const { supabase } = require('../config/supabase');
const logger = require('../services/logger');

class EmpresaController {
    async list(req, res) {
        try {
            const { data, error } = await supabase.from('empresas').select('*');
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const { nome, cnpj, servico } = req.body;
            const { data, error } = await supabase
                .from('empresas')
                .insert([{ nome, cnpj, servico, created_by: req.user?.id }])
                .select();
            if (error) throw error;
            res.status(201).json({ success: true, data: data[0] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await supabase
                .from('empresas')
                .select('*')
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
                .from('empresas')
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
                .from('empresas')
                .delete()
                .eq('id', id);
            if (error) throw error;
            res.json({ success: true, message: 'Empresa deletada com sucesso' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new EmpresaController();
"@ | Out-File -FilePath src\controllers\empresaController.js -Encoding UTF8 -Force
Write-Host "✅ empresaController.js criado" -ForegroundColor Green

# Criar funcionarioController.js básico
@"
const { supabase } = require('../config/supabase');
const logger = require('../services/logger');

class FuncionarioController {
    async list(req, res) {
        try {
            const { data, error } = await supabase.from('funcionarios').select('*, empresas(nome)');
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const { data, error } = await supabase.from('funcionarios').insert([req.body]).select();
            if (error) throw error;
            res.status(201).json({ success: true, data: data[0] });
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
}

module.exports = new FuncionarioController();
"@ | Out-File -FilePath src\controllers\funcionarioController.js -Encoding UTF8 -Force
Write-Host "✅ funcionarioController.js criado" -ForegroundColor Green

# Criar accessController.js básico
@"
const { supabase } = require('../config/supabase');
const logger = require('../services/logger');

class AccessController {
    async checkinQRCode(req, res) {
        res.json({ message: 'Checkin QR Code endpoint' });
    }

    async checkinManual(req, res) {
        res.json({ message: 'Checkin Manual endpoint' });
    }

    async checkout(req, res) {
        res.json({ message: 'Checkout endpoint' });
    }

    async getLogs(req, res) {
        try {
            const { data, error } = await supabase.from('logs_acesso').select('*, funcionarios(nome)');
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new AccessController();
"@ | Out-File -FilePath src\controllers\accessController.js -Encoding UTF8 -Force
Write-Host "✅ accessController.js criado" -ForegroundColor Green

# Criar monitorController.js básico
@"
const { supabase } = require('../config/supabase');
const logger = require('../services/logger');

class MonitorController {
    async dashboard(req, res) {
        try {
            const [empresas, funcionarios, logs] = await Promise.all([
                supabase.from('empresas').select('*', { count: 'exact', head: true }),
                supabase.from('funcionarios').select('*', { count: 'exact', head: true }),
                supabase.from('logs_acesso').select('*', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0])
            ]);
            
            res.json({
                success: true,
                data: {
                    total_empresas: empresas.count || 0,
                    total_funcionarios: funcionarios.count || 0,
                    checkins_hoje: logs.count || 0
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async systemStatus(req, res) {
        res.json({ status: 'online', timestamp: new Date() });
    }
}

module.exports = new MonitorController();
"@ | Out-File -FilePath src\controllers\monitorController.js -Encoding UTF8 -Force
Write-Host "✅ monitorController.js criado" -ForegroundColor Green

Write-Host ""
Write-Host "✅ TODOS OS CONTROLLERS CRIADOS COM SUCESSO!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Agora reinicie o servidor:" -ForegroundColor Yellow
Write-Host "npm run dev" -ForegroundColor Cyan

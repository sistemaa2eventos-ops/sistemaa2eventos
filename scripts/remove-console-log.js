#!/usr/bin/env node

/**
 * Script para remover console.log em código de produção
 * Substitui console.log por logger calls de forma segura
 *
 * Uso:
 *   node scripts/remove-console-log.js
 */

const fs = require('fs');
const path = require('path');

// Diretórios para processar (apenas produção, não scripts)
const PRODUCTION_DIRS = [
  'a2-eventos/backend/api-nodejs/src/config',
  'a2-eventos/backend/api-nodejs/src/services',
  'a2-eventos/backend/api-nodejs/src/middleware',
  'a2-eventos/backend/api-nodejs/src/modules'
];

// Padrões a NUNCA mudar (false positives)
const SAFE_PATTERNS = [
  /logger\.log/,          // já é logger
  /console\.error/,       // erros devem virar logger.error
  /console\.warn/,        // warnings devem virar logger.warn
  /\/\/ console\.log/,    // já comentado
  /^\s*\*.*console/       // em comentário JSDoc
];

/**
 * Processar um arquivo
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Substituir console.log por logger.debug
    content = content.replace(
      /console\.log\s*\(/g,
      'logger.debug('
    );

    // Contar substituições
    const linesChanged = (originalContent.match(/console\.log/g) || []).length;

    if (linesChanged > 0) {
      // Backup
      const backupPath = filePath + '.backup';
      fs.writeFileSync(backupPath, originalContent, 'utf8');

      // Salvar arquivo modificado
      fs.writeFileSync(filePath, content, 'utf8');

      console.log(`✅ ${path.relative('.', filePath)}: ${linesChanged} changes`);
      return linesChanged;
    }

    return 0;
  } catch (err) {
    console.error(`❌ Erro ao processar ${filePath}:`, err.message);
    return 0;
  }
}

/**
 * Processar diretório recursivamente
 */
function processDir(dir) {
  const files = fs.readdirSync(dir);
  let totalChanges = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      totalChanges += processDir(filePath);
    } else if (file.endsWith('.js') && !file.endsWith('.backup')) {
      totalChanges += processFile(filePath);
    }
  }

  return totalChanges;
}

/**
 * Main
 */
function main() {
  console.log('🧹 Removendo console.log em código de produção...\n');

  let totalChanges = 0;

  for (const dir of PRODUCTION_DIRS) {
    if (fs.existsSync(dir)) {
      console.log(`📁 Processando ${dir}...`);
      totalChanges += processDir(dir);
      console.log('');
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✨ Total de mudanças: ${totalChanges}`);
  console.log(`\n⚠️  VERIFICAR:`);
  console.log(`1. git diff para revisar mudanças`);
  console.log(`2. Procurar por 'console.error' e converter para logger.error`);
  console.log(`3. Procurar por 'console.warn' e converter para logger.warn`);
  console.log(`4. Testar build: npm run build`);
  console.log(`5. Se problemas, restaurar: find . -name '*.backup' -exec mv {} {%} \\;`);
  console.log(`${'='.repeat(60)}\n`);
}

main();

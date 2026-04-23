const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getAllJsFiles(dir, files = []) {
  const skip = ['node_modules', '.git', 'dist', 'build', 'coverage'];
  for (const item of fs.readdirSync(dir)) {
    if (skip.includes(item)) continue;
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      getAllJsFiles(full, files);
    } else if (item.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const root = path.resolve(__dirname, '..');
const files = getAllJsFiles(root);
let errors = 0;

console.log(`[check_syntax] Verificando ${files.length} arquivos .js...\n`);

for (const file of files) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`  ERRO: ${path.relative(root, file)}`);
    if (e.stderr) console.error('  ' + e.stderr.toString().trim());
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n[check_syntax] ${errors} arquivo(s) com erro. Deploy abortado.\n`);
  process.exit(1);
}

console.log('[check_syntax] Sintaxe OK em todos os arquivos.');

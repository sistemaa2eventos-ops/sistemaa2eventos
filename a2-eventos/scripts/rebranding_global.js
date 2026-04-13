const fs = require('fs');
const path = require('path');

const rootDir = process.argv[2] || '.';
const ignoreDirs = ['node_modules', '.git', 'dist', '.next', '.expo'];
const extensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md', '.sql', '.bat', '.ps1'];

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        
        if (ignoreDirs.some(id => dirPath.includes(id))) return;
        
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

console.log(`🔍 Iniciando Rebranding Global para 'Painel NZT'...`);

walk(rootDir, (filePath) => {
    if (!extensions.includes(path.extname(filePath))) return;
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        let newContent = content.replace(/Painel NZT/g, 'Painel NZT');
        newContent = newContent.replace(/PAINEL NZT/g, 'PAINEL NZT');
        newContent = newContent.replace(/painel nzt/g, 'painel nzt');
        
        if (content !== newContent) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`✅ Atualizado: ${filePath}`);
        }
    } catch (e) {
        // Silently skip binary or large files
    }
});

console.log('🎉 REBRANDING CONCLUÍDO!');

const fs = require('fs');
const path = require('path');

const replacements = [
    [/funcionarios/g, 'pessoas'],
    [/Funcionarios/g, 'Pessoas'],
    [/FUNCIONARIOS/g, 'PESSOAS'],
    [/funcionario/g, 'pessoa'],
    [/Funcionario/g, 'Pessoa'],
    [/FUNCIONARIO/g, 'PESSOA'],
];

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git') && !file.includes('.expo') && !file.includes('dist') && !file.includes('build')) {
            results = results.concat(walkDir(file));
        } else if (stat && stat.isFile()) {
            results.push(file);
        }
    });
    return results;
}

const folders = [
    'c:/Projetos/Projeto_A2_Eventos/a2-eventos/backend/api-nodejs/src',
    'c:/Projetos/Projeto_A2_Eventos/a2-eventos/frontend/web-admin/src',
    'c:/Projetos/Projeto_A2_Eventos/a2-eventos/frontend/public-web/src',
    'c:/Projetos/Projeto_A2_Eventos/a2-eventos/frontend/mobile-app/app',
    'c:/Projetos/Projeto_A2_Eventos/a2-eventos/frontend/mobile-app/components',
    'c:/Projetos/Projeto_A2_Eventos/a2-eventos/frontend/mobile-app/services'
];

folders.forEach(folder => {
    if (!fs.existsSync(folder)) {
        console.log('Folder not found', folder);
        return;
    }
    const files = walkDir(folder);
    files.forEach(file => {
        if (!file.match(/\.(js|jsx|ts|tsx|json)$/)) return;
        let content = fs.readFileSync(file, 'utf8');
        let newContent = content;
        replacements.forEach(([regex, replacement]) => {
            newContent = newContent.replace(regex, replacement);
        });
        if (content !== newContent) {
            fs.writeFileSync(file, newContent, 'utf8');
            console.log('Modified', file);
        }

        // Check if filename also needs rename
        const basename = path.basename(file);
        let newBasename = basename;
        replacements.forEach(([regex, replacement]) => {
            newBasename = newBasename.replace(regex, replacement);
        });
        if (basename !== newBasename) {
            const newFile = path.join(path.dirname(file), newBasename);
            fs.renameSync(file, newFile);
            console.log('Renamed', file, 'to', newFile);
        }
    });
});

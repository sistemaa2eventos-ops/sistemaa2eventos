const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const modulesDir = path.join(srcDir, 'modules');

const mappings = {
    // Auth Module
    'controllers/authController.js': 'modules/auth/auth.controller.js',
    'routes/auth.js': 'modules/auth/auth.routes.js',

    // Check-in Module
    'controllers/accessController.js': 'modules/checkin/checkin.controller.js',
    'routes/access.js': 'modules/checkin/checkin.routes.js',
    'services/policyEngine.js': 'modules/checkin/policy.service.js',

    // Cameras & Devices Module
    'controllers/deviceController.js': 'modules/devices/device.controller.js',
    'routes/dispositivos.js': 'modules/devices/device.routes.js',
    'controllers/intelbrasController.js': 'modules/devices/intelbras.controller.js',
    'routes/intelbras.js': 'modules/devices/intelbras.routes.js',
    'services/intelbrasService.js': 'modules/devices/intelbras.service.js',
    'services/hikvisionService.js': 'modules/devices/hikvision.service.js',
    'services/terminalSyncService.js': 'modules/devices/terminalSync.service.js',
    'routes/sync.js': 'modules/devices/sync.routes.js',
    'services/syncService.js': 'modules/devices/sync.service.js',
    'services/syncScheduler.js': 'modules/devices/syncScheduler.service.js',

    // Events Module
    'controllers/eventoController.js': 'modules/events/event.controller.js',
    'routes/eventos.js': 'modules/events/event.routes.js',
    'controllers/cronController.js': 'modules/events/cron.controller.js',

    // Persons & Companies Module
    'controllers/pessoaController.js': 'modules/entities/pessoa.controller.js',
    'routes/pessoas.js': 'modules/entities/pessoa.routes.js',
    'controllers/empresaController.js': 'modules/entities/empresa.controller.js',
    'routes/empresas.js': 'modules/entities/empresa.routes.js',
    'controllers/veiculoController.js': 'modules/entities/veiculo.controller.js',
    'routes/veiculos.js': 'modules/entities/veiculo.routes.js',
    'controllers/documentoController.js': 'modules/entities/documento.controller.js',
    'routes/documentos.js': 'modules/entities/documento.routes.js',

    // Reports Module
    'controllers/reportController.js': 'modules/reports/report.controller.js',
    'routes/reports.js': 'modules/reports/report.routes.js',
    'controllers/excelController.js': 'modules/reports/excel.controller.js',
    'routes/excel.js': 'modules/reports/excel.routes.js',

    // System Module
    'controllers/configController.js': 'modules/system/config.controller.js',
    'routes/config.js': 'modules/system/config.routes.js',
    'controllers/settingsController.js': 'modules/system/settings.controller.js',
    'routes/settings.js': 'modules/system/settings.routes.js',
    'controllers/monitorController.js': 'modules/system/monitor.controller.js',
    'routes/monitor.js': 'modules/system/monitor.routes.js',
    'controllers/systemMetricsController.js': 'modules/system/metrics.controller.js'
};

// Also map routes not cleanly fitting but existing
mappings['routes/public.js'] = 'modules/system/public.routes.js';
mappings['controllers/publicController.js'] = 'modules/system/public.controller.js';
mappings['routes/portal/cliente.js'] = 'modules/portal/cliente.routes.js';
mappings['routes/portal/empresa.js'] = 'modules/portal/empresa.routes.js';

if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir);

const oldToNewPaths = {};
const newToOldPaths = {};

// Create dirs and copy files to their new path mapping
for (const [oldRel, newRel] of Object.entries(mappings)) {
    const oldPath = path.join(srcDir, oldRel);
    const newPath = path.join(srcDir, newRel);
    if (!fs.existsSync(oldPath)) continue;
    oldToNewPaths[oldPath] = newPath;
    newToOldPaths[newPath] = oldPath;

    fs.mkdirSync(path.dirname(newPath), { recursive: true });
}

function getAllJsFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules') continue;
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllJsFiles(filePath, fileList);
        } else if (file.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const allFiles = getAllJsFiles(srcDir);

// Perform moves first
for (const [oldPath, newPath] of Object.entries(oldToNewPaths)) {
    fs.copyFileSync(oldPath, newPath); // copy first to be safe, delete later
}

function normalizeRequirePath(requirePath) {
    if (!requirePath.startsWith('.')) return requirePath;
    if (requirePath.endsWith('.js')) return requirePath;
    return requirePath;
}

function updateRequires(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

    let updatedContent = content.replace(requireRegex, (match, reqPath) => {
        if (!reqPath.startsWith('.')) return match; // Not a local require

        // Resolve what the original path was aiming at
        // If the file itself was moved, its ORIGINAL location was newToOldPaths[filePath] or just filePath
        const originalFilePathForContext = newToOldPaths[filePath] || filePath;

        // This is the absolute path to the file that is being required
        let requiredAbsPath = path.resolve(path.dirname(originalFilePathForContext), reqPath);

        // Sometimes require omits .js
        if (!fs.existsSync(requiredAbsPath) && fs.existsSync(requiredAbsPath + '.js')) {
            requiredAbsPath += '.js';
        } else if (fs.existsSync(path.join(requiredAbsPath, 'index.js'))) {
            requiredAbsPath = path.join(requiredAbsPath, 'index.js');
        }

        // Did the required file move?
        const finalAbsPathOfRequired = oldToNewPaths[requiredAbsPath] || requiredAbsPath;

        // Where is the current file NOW?
        const currentAbsPathNow = filePath;

        // Compute new relative path
        let newRelPath = path.relative(path.dirname(currentAbsPathNow), finalAbsPathOfRequired);
        newRelPath = newRelPath.replace(/\\/g, '/');
        if (!newRelPath.startsWith('.')) newRelPath = './' + newRelPath;

        // Remove .js extension if it wasn't there originally and not index.js
        if (!reqPath.endsWith('.js') && newRelPath.endsWith('.js')) {
            newRelPath = newRelPath.slice(0, -3);
        }

        return `require('${newRelPath}')`;
    });

    fs.writeFileSync(filePath, updatedContent, 'utf8');
}

// Update all files (we update the moved files at their NEW locations, and the unmoved files at their original locations)
const filesToUpdate = allFiles.filter(f => !oldToNewPaths[f]).concat(Object.values(oldToNewPaths));

for (const file of filesToUpdate) {
    updateRequires(file);
}

// Now delete old files
for (const oldPath of Object.keys(oldToNewPaths)) {
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
}

// Ensure app.js uses new route paths
const appJsPath = path.join(srcDir, 'app.js');
if (fs.existsSync(appJsPath)) {
    let appContent = fs.readFileSync(appJsPath, 'utf8');
    // Replace old route paths with new ones in app.js
    // Since we did regex replace on requires, app.js might already be updated correctly if it used `require('./routes/...')`
    // Wait, app.js was processed by `filesToUpdate`. But let's log any unresolved routes.
}

console.log("Refactoring complete!");

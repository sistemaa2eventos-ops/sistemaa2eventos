$outputFile = "project_context_dump.txt"
$rootPath = Get-Location
$excludeDirs = @("node_modules", "venv", ".venv", "env", ".env", ".git", "dist", "build", ".next", ".vs", ".idea", ".vscode", "coverage", "logs", "perf_logs", "tmp", ".gemini", "local_db", "__pycache__")
$excludeExtensions = @(".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".exe", ".dll", ".zip", ".tar", ".gz", ".mp4", ".mov", ".db", ".sqlite", ".log", ".pyc")
$excludeFiles = @("package-lock.json", "yarn.lock", "pnpm-lock.yaml", "project_context_dump.txt", "generate_dump.ps1")

Write-Host "Iniciando geração otimizada do dump em $rootPath..."
$report = New-Object System.Text.StringBuilder

# Header
[void]$report.AppendLine("PROJECT DUMP GENERATED ON $(Get-Date)")
[void]$report.AppendLine("ROOT: $rootPath")
[void]$report.AppendLine("================================================================================")
[void]$report.AppendLine("")

# Helper function for recursion
function Traverse-Project {
    param(
        [string]$currentPath,
        [bool]$isTreeMode
    )

    try {
        $items = Get-ChildItem -Path $currentPath -ErrorAction SilentlyContinue
        
        foreach ($item in $items) {
            # Check exclusions (Dirs and Files)
            if ($excludeDirs -contains $item.Name -or ($item.Name.StartsWith(".") -and $item.Name -ne ".env")) { 
                if ($item.Name -ne "src" -and $item.Name -ne "public") {
                    # Skip .git, .next, etc. but allow src/public
                    continue 
                }
            }

            $relPath = $item.FullName.Substring($rootPath.Path.Length + 1)

            if ($item.PSIsContainer) {
                if ($isTreeMode) {
                    [void]$report.AppendLine("DIR:  $relPath")
                }
                # Recurse
                Traverse-Project -currentPath $item.FullName -isTreeMode $isTreeMode
            }
            else {
                # File
                # Check exclusions for files in both modes
                if ($excludeFiles -contains $item.Name) { continue }
                if ($excludeExtensions -contains $item.Extension.ToLower()) { continue }
                if ($item.Name.StartsWith(".env")) { continue }

                if ($isTreeMode) {
                    [void]$report.AppendLine("FILE: $relPath")
                }
                else {
                    # Content Mode
                    Write-Host "Lendo: $relPath"
                    [void]$report.AppendLine("")
                    [void]$report.AppendLine("vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv")
                    [void]$report.AppendLine("FILE: $relPath")
                    [void]$report.AppendLine("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^")
                    try {
                        $content = Get-Content $item.FullName -Raw -ErrorAction SilentlyContinue
                        if ($content -and $content.Contains([char]0)) {
                            [void]$report.AppendLine("[SKIPPED: Binary Content Detected]")
                        }
                        elseif ($content) {
                            [void]$report.AppendLine($content)
                        }
                        else {
                            [void]$report.AppendLine("[EMPTY]")
                        }
                    }
                    catch {
                        [void]$report.AppendLine("[ERROR: Read Failed]")
                    }
                }
            }
        }
    }
    catch {
        Write-Host "Error accessing $currentPath"
    }
}

# 1. Directory Tree
Write-Host "Gerando árvore..."
[void]$report.AppendLine("--- DIRECTORY TREE ---")
Traverse-Project -currentPath $rootPath -isTreeMode $true
[void]$report.AppendLine("")
[void]$report.AppendLine("================================================================================")
[void]$report.AppendLine("")

# 2. Package Scripts (Commands)
Write-Host "Extraindo scripts..."
[void]$report.AppendLine("--- AVAILABLE SCRIPTS (package.json) ---")
$pkgFiles = Get-ChildItem -Recurse -Filter "package.json"
foreach ($pkg in $pkgFiles) {
    # Check path for node_modules
    if ($pkg.FullName.Contains("\node_modules\")) { continue }
    if ($pkg.FullName.Contains("\venv\")) { continue }
     
    $rel = $pkg.FullName.Substring($rootPath.Path.Length + 1)
    [void]$report.AppendLine("FILE: $rel")
    try {
        $json = Get-Content $pkg.FullName -Raw | ConvertFrom-Json
        if ($json.scripts) {
            $scriptsStr = $json.scripts | Out-String
            [void]$report.AppendLine($scriptsStr)
        }
    }
    catch {}
    [void]$report.AppendLine("----------------------------------------")
}
[void]$report.AppendLine("")
[void]$report.AppendLine("================================================================================")
[void]$report.AppendLine("")

# 3. File Contents
Write-Host "Lendo arquivos..."
[void]$report.AppendLine("--- FILE CONTENTS ---")
Traverse-Project -currentPath $rootPath -isTreeMode $false

# Write Output
Write-Host "Salvando em $outputFile..."
Set-Content -Path $outputFile -Value $report.ToString() -Encoding UTF8
Write-Host "Concluído!"

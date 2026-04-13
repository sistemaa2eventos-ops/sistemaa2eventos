# Script de Dump Modular - Versao Safe
$RootPath = "C:\Projetos\Projeto_A2_Eventos\a2-eventos"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputDir = Join-Path $RootPath ("project_dumps_" + $Timestamp)

if (!(Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir }

$Modules = @{
    "01_DATABASE"        = "database"
    "02_BACKEND_API"     = "backend\api-nodejs"
    "03_BACKEND_PYTHON"  = "backend\microservice-face-python"
    "04_FRONTEND_ADMIN"  = "frontend\web-admin"
    "05_FRONTEND_PUBLIC" = "frontend\public-web"
    "06_FRONTEND_MOBILE" = "frontend\mobile-app"
    "07_DOCS_ROOT"       = "." 
}

$ExcludeDirs = @("node_modules", ".git", "build", "dist", ".next", "out", ".cache", ".expo", "bin", "obj", "venv", "logs", "__pycache__")
$ExcludeFiles = @("project_context_dump.txt", "package-lock.json", "yarn.lock", "startup_log.txt", "npm-debug.log")

function Get-FilteredFiles {
    param($Path, $IsRoot)
    $Files = @()
    $Items = Get-ChildItem -Path $Path -ErrorAction SilentlyContinue
    if ($null -eq $Items) { return $Files }

    foreach ($item in $Items) {
        if ($item.PSIsContainer) {
            $skip = $false
            foreach ($ex in $ExcludeDirs) { if ($item.Name -eq $ex) { $skip = $true; break } }
            if ($IsRoot -and ($item.Name -match "backend|frontend|database")) { $skip = $true }
            if ($item.Name -match "^project_dumps") { $skip = $true }
            if (!$skip) { $Files += Get-FilteredFiles -Path $item.FullName -IsRoot $false }
        }
        else {
            $skip = $false
            foreach ($ex in $ExcludeFiles) { if ($item.Name -eq $ex) { $skip = $true; break } }
            if ($item.Extension -match "png|jpg|jpeg|gif|ico|pdf|zip|exe|dll|pdb|pyc|map") { $skip = $true }
            if (!$skip) { $Files += $item }
        }
    }
    return $Files
}

foreach ($key in ($Modules.Keys | Sort-Object)) {
    $SubPath = $Modules[$key]
    $FullModulePath = Join-Path $RootPath $SubPath
    $OutputFile = Join-Path $OutputDir ($key + "_MODULE.txt")
    
    Write-Host (">>> Module: " + $key)
    
    if (!(Test-Path $FullModulePath)) { continue }

    $AllFiles = Get-FilteredFiles -Path $FullModulePath -IsRoot ($SubPath -eq ".")
    
    "MODULE: $key`nGENERATED: $(Get-Date)`n`n--- DIRECTORY TREE ---" | Out-File -FilePath $OutputFile -Encoding utf8
    
    foreach ($f in $AllFiles) {
        $Rel = $f.FullName.Replace($RootPath + "\", "")
        ("FILE: " + $Rel) | Out-File -FilePath $OutputFile -Append -Encoding utf8
    }

    ("`n--- FILE CONTENTS ---`n") | Out-File -FilePath $OutputFile -Append -Encoding utf8

    foreach ($f in $AllFiles) {
        $Rel = $f.FullName.Replace($RootPath + "\", "")
        ("vvvvv FILE: " + $Rel + " vvvvv") | Out-File -FilePath $OutputFile -Append -Encoding utf8
        try {
            if ($f.Length -lt 500KB) {
                $content = Get-Content $f.FullName -Raw -ErrorAction Stop
                $content | Out-File -FilePath $OutputFile -Append -Encoding utf8
            }
            else { 
                " [SKIPPED LARGE FILE]" | Out-File -FilePath $OutputFile -Append -Encoding utf8 
            }
        }
        catch { 
            " !! READ ERROR" | Out-File -FilePath $OutputFile -Append -Encoding utf8 
        }
        ("^^^^^ FILE: " + $Rel + " ^^^^^`n") | Out-File -FilePath $OutputFile -Append -Encoding utf8
    }
}

Write-Host ("DONE. Path: " + $OutputDir)

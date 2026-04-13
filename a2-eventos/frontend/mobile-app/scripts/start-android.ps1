$env:ANDROID_HOME = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
$env:PATH += ";$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\platform-tools"

Write-Host "ANDROID_HOME set to: $env:ANDROID_HOME"
Write-Host "Added emulator and platform-tools to PATH"

# Check if adb is available
if (Get-Command adb -ErrorAction SilentlyContinue) {
    Write-Host "adb is available."
    adb --version
}
else {
    Write-Host "Error: adb not found despite updating PATH." -ForegroundColor Red
    exit 1
}

# Check if emulator is available
if (Get-Command emulator -ErrorAction SilentlyContinue) {
    Write-Host "emulator is available."
    
    # Check for hardware acceleration
    $accelCheck = & emulator -accel-check
    Write-Host "Acceleration check: $accelCheck"
    
    if ($accelCheck -match "is not installed" -or $accelCheck -match "requires") {
        Write-Host "WARNING: Hardware acceleration is not enabled or HAXM is missing." -ForegroundColor Yellow
        Write-Host "The emulator may fail to start or run very slowly." -ForegroundColor Yellow
        Write-Host "Please ensure 'Hyper-V' is enabled in Windows Features or 'Intel HAXM' is installed via Android Studio SDK Manager." -ForegroundColor Yellow
    }
}
else {
    Write-Host "Error: emulator not found despite updating PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Starting Expo on Android..."
Set-Location "$PSScriptRoot/.."
npx expo start --android

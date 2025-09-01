# SeraphC2 Implant Build Script

param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [switch]$SingleFile = $true,
    [switch]$SelfContained = $true,
    [switch]$Test = $false
)

Write-Host "Building SeraphC2 Implant..." -ForegroundColor Green

# Run tests if requested
if ($Test) {
    Write-Host "Running tests..." -ForegroundColor Yellow
    dotnet test --verbosity normal
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tests failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Tests passed!" -ForegroundColor Green
}

# Restore packages first
Write-Host "Restoring packages..." -ForegroundColor Yellow
dotnet restore

# Build the implant
Write-Host "Building implant..." -ForegroundColor Yellow

$buildArgs = @(
    "publish"
    "SeraphC2.Implant/SeraphC2.Implant.csproj"
    "-c", $Configuration
    "-r", $Runtime
)

if ($SelfContained) {
    $buildArgs += "--self-contained", "true"
}

if ($SingleFile) {
    $buildArgs += "-p:PublishSingleFile=true"
}

# Add additional optimizations for release builds
if ($Configuration -eq "Release") {
    $buildArgs += "-p:PublishTrimmed=true"
    $buildArgs += "-p:TrimMode=link"
}

dotnet @buildArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build completed successfully!" -ForegroundColor Green
    $outputPath = "SeraphC2.Implant/bin/$Configuration/net6.0/$Runtime/publish/"
    Write-Host "Output location: $outputPath" -ForegroundColor Cyan
    
    # List the output files
    Get-ChildItem $outputPath -Name | ForEach-Object {
        Write-Host "  - $_" -ForegroundColor Gray
    }
} else {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
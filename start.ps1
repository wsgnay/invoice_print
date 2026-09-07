$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!(Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    python -m venv .venv
}
& ./.venv/Scripts/python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }

$firewallRuleName = 'Paperdesk LAN Access'
if (!(Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue)) {
    Write-Host '首次启用局域网访问需要添加 Windows 防火墙规则，请在系统提示中选择“是”。'
    try {
        $firewallScript = Join-Path $PSScriptRoot 'enable-lan.ps1'
        $elevated = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$firewallScript`""
        )
        if ($elevated.ExitCode -ne 0) {
            Write-Warning '防火墙规则未添加，其他设备可能无法访问。'
        }
    } catch {
        Write-Warning '防火墙规则未添加，其他设备可能无法访问。'
    }
}

$lanAddresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Virtual'
    } |
    Select-Object -ExpandProperty IPAddress -Unique

Write-Host '本机访问：http://127.0.0.1:8765'
foreach ($lanAddress in $lanAddresses) {
    Write-Host "局域网访问：http://${lanAddress}:8765"
}
Start-Process 'http://127.0.0.1:8765'
& ./.venv/Scripts/python.exe app.py

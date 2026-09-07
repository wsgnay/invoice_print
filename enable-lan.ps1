$ErrorActionPreference = 'Stop'
$ruleName = 'Paperdesk LAN Access'

if (!(Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Description 'Allow devices on the local subnet to access Paperdesk.' `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort 8765 `
        -Profile Any `
        -RemoteAddress LocalSubnet | Out-Null
}

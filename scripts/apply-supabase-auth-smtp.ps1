param(
    [string]$EnvFile = ".env.supabase-auth.local"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-EnvFile {
    param(
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Env file not found: $Path"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()
        $values[$key] = $value
    }

    return $values
}

function Get-RequiredValue {
    param(
        [hashtable]$Values,
        [string]$Name
    )

    $value = $Values[$Name]
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required value: $Name"
    }

    return $value
}

function Convert-ToBoolean {
    param(
        [string]$Value,
        [bool]$DefaultValue
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $DefaultValue
    }

    switch ($Value.Trim().ToLowerInvariant()) {
        "1" { return $true }
        "true" { return $true }
        "yes" { return $true }
        "on" { return $true }
        "0" { return $false }
        "false" { return $false }
        "no" { return $false }
        "off" { return $false }
        default { throw "Invalid boolean value: $Value" }
    }
}

$config = Read-EnvFile -Path $EnvFile

$projectRef = Get-RequiredValue -Values $config -Name "SUPABASE_PROJECT_REF"
$accessToken = Get-RequiredValue -Values $config -Name "SUPABASE_ACCESS_TOKEN"

$payload = @{
    external_email_enabled = Convert-ToBoolean -Value $config["EXTERNAL_EMAIL_ENABLED"] -DefaultValue $true
    mailer_autoconfirm = Convert-ToBoolean -Value $config["MAILER_AUTOCONFIRM"] -DefaultValue $false
    mailer_secure_email_change_enabled = Convert-ToBoolean -Value $config["MAILER_SECURE_EMAIL_CHANGE_ENABLED"] -DefaultValue $true
    smtp_admin_email = Get-RequiredValue -Values $config -Name "SMTP_ADMIN_EMAIL"
    smtp_sender_name = Get-RequiredValue -Values $config -Name "SMTP_SENDER_NAME"
    smtp_host = Get-RequiredValue -Values $config -Name "SMTP_HOST"
    smtp_port = [int](Get-RequiredValue -Values $config -Name "SMTP_PORT")
    smtp_user = Get-RequiredValue -Values $config -Name "SMTP_USER"
    smtp_pass = Get-RequiredValue -Values $config -Name "SMTP_PASS"
}

$headers = @{
    Authorization = "Bearer $accessToken"
    "Content-Type" = "application/json"
}

$uri = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
$body = $payload | ConvertTo-Json -Depth 10
$response = Invoke-RestMethod -Uri $uri -Method Patch -Headers $headers -Body $body

[pscustomobject]@{
    project_ref = $projectRef
    external_email_enabled = $payload.external_email_enabled
    mailer_autoconfirm = $payload.mailer_autoconfirm
    smtp_admin_email = $payload.smtp_admin_email
    smtp_sender_name = $payload.smtp_sender_name
    smtp_host = $payload.smtp_host
    smtp_port = $payload.smtp_port
    smtp_user = $payload.smtp_user
    status = "Supabase Auth SMTP settings updated"
} | ConvertTo-Json -Depth 10

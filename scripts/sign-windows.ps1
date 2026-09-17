param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string]$Path
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "sign-windows: missing file $Path" }

$production = $env:DSH_REQUIRE_PRODUCTION_SIGNING -eq "1"
$thumbprint = $env:DSH_WINDOWS_CERT_THUMBPRINT
if ($null -eq $thumbprint) { $thumbprint = "" }
$thumbprint = $thumbprint.Trim()
$cert = $null
if ($thumbprint -ne "") {
	$cert = Get-ChildItem "Cert:\CurrentUser\My\$thumbprint" -ErrorAction Stop
} elseif (-not $production) {
	$subject = "CN=Deepseek Harness Desktop Ad-hoc"
	$storePath = "Cert:\CurrentUser\My"
	$cert = Get-ChildItem $storePath -ErrorAction SilentlyContinue |
		Where-Object { $_.Subject -eq $subject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
		Select-Object -First 1
	if ($null -eq $cert) {
		$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject -HashAlgorithm SHA256 -CertStoreLocation $storePath -NotAfter (Get-Date).AddYears(5)
		Write-Host "created ad-hoc code signing certificate $($cert.Thumbprint)"
	}
} else {
	throw "sign-windows: production signing requires DSH_WINDOWS_CERT_THUMBPRINT"
}

$signatureArgs = @{ FilePath = $Path; Certificate = $cert; HashAlgorithm = "SHA256" }
$timestampURL = $env:DSH_WINDOWS_TIMESTAMP_URL
if ($null -ne $timestampURL -and $timestampURL.Trim() -ne "") { $signatureArgs.TimestampServer = $timestampURL.Trim() }
$result = Set-AuthenticodeSignature @signatureArgs
Write-Host "authenticode status=$($result.Status) path=$Path"
if ($production -and $result.Status -ne "Valid") {
	throw "sign-windows: $($result.Status) $($result.StatusMessage)"
}
if ($result.Status -eq "NotSigned" -or $result.Status -eq "HashMismatch") {
	throw "sign-windows: $($result.Status) $($result.StatusMessage)"
}
if (-not $production -and $result.Status -ne "Valid") {
	Write-Warning "Development signature is not trusted; this artifact must not be described as publisher-verified."
}

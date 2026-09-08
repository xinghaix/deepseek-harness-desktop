param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string]$Path
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
	throw "sign-windows: missing file $Path"
}

$subject = "CN=Deepseek Harness Desktop Ad-hoc"
$storePath = "Cert:\CurrentUser\My"
$cert = Get-ChildItem $storePath -ErrorAction SilentlyContinue |
	Where-Object { $_.Subject -eq $subject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
	Select-Object -First 1

if ($null -eq $cert) {
	$cert = New-SelfSignedCertificate `
		-Type CodeSigningCert `
		-Subject $subject `
		-HashAlgorithm SHA256 `
		-CertStoreLocation $storePath `
		-NotAfter (Get-Date).AddYears(5)
	Write-Host "created ad-hoc code signing certificate $($cert.Thumbprint)"
}

$result = Set-AuthenticodeSignature -FilePath $Path -Certificate $cert -HashAlgorithm SHA256
Write-Host "authenticode status=$($result.Status) path=$Path"
if ($result.Status -eq "NotSigned" -or $result.Status -eq "HashMismatch") {
	throw "sign-windows: $($result.Status) $($result.StatusMessage)"
}

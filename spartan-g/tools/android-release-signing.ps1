param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Initialize','Inspect','Validate')][string]$Action,
    [ValidateSet('valid','missing','wrong-password','wrong-alias','debug')][string]$ValidationCase = 'valid',
    [string]$EvidenceFile
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security

# No build/install action is exposed. Secrets exist only in protected storage and child memory.
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$signingDir = Join-Path $env:LOCALAPPDATA 'SpartanG\signing'
$storeFile = Join-Path $signingDir 'spartan-g-release.jks'
$credentialFile = Join-Path $signingDir 'spartan-g-release.credentials.dpapi'
$publicFile = Join-Path $signingDir 'spartan-g-release.public.json'
$certificateFile = Join-Path $signingDir 'spartan-g-release.cer'
$keyAlias = 'spartan-g-release'
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$systemSid = 'S-1-5-18'
$javaDir = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$keytool = Join-Path $javaDir 'bin\keytool.exe'
$nodeDir = Join-Path $env:TEMP 'spartan-g-phase5-node22.23.3\node-v22.23.3-win-x64'
$entropy = [Text.Encoding]::UTF8.GetBytes('SpartanG.Android.ReleaseSigning.v1')

function Assert-NoLink([string]$ItemPath) {
    $cursor = $ItemPath
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Signing storage cannot traverse a link.' }
        }
        $next = [IO.Path]::GetDirectoryName($cursor)
        if ($next -eq $cursor) { break }
        $cursor = $next
    }
}
function Assert-PrivateAcl([string]$ItemPath) {
    $acl = Get-Acl -LiteralPath $ItemPath
    $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($owner -ne $currentSid) { throw 'Signing storage must be owned by the current operator.' }
    $rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if (-not $rules.Count) { throw 'Signing storage ACL is empty.' }
    foreach ($r in $rules) {
        if ($r.AccessControlType -ne 'Allow' -or $r.IdentityReference.Value -notin @($currentSid,$systemSid)) { throw 'Signing storage ACL grants an unexpected principal.' }
    }
}
function Write-NewBytes([string]$ItemPath,[byte[]]$Bytes) {
    $stream = New-Object IO.FileStream($ItemPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $stream.Write($Bytes,0,$Bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
    Assert-PrivateAcl $ItemPath
}
function Invoke-PrivateChild([string]$Executable,[string]$Arguments,[string]$WorkingDirectory,[hashtable]$Variables,[string]$Secret) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$Executable; $info.Arguments=$Arguments; $info.WorkingDirectory=$WorkingDirectory
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    foreach ($name in @('SPARTAN_RELEASE_STORE_FILE','SPARTAN_RELEASE_KEY_ALIAS','SPARTAN_RELEASE_STORE_PASSWORD','SPARTAN_RELEASE_KEY_PASSWORD')) { $info.EnvironmentVariables.Remove($name) }
    foreach ($name in $Variables.Keys) { $info.EnvironmentVariables[$name]=[string]$Variables[$name] }
    $process = New-Object Diagnostics.Process
    $process.StartInfo=$info
    try {
        if (-not $process.Start()) { throw 'Could not start the signing tool.' }
        $outputTask=$process.StandardOutput.ReadToEndAsync(); $errorTask=$process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(300000)) { $process.Kill(); throw 'Signing validation timed out; no APK action was requested.' }
        $output=$outputTask.Result; $errors=$errorTask.Result
        if ($Secret) { $output=$output.Replace($Secret,'<redacted>'); $errors=$errors.Replace($Secret,'<redacted>') }
        return [pscustomobject]@{exitCode=$process.ExitCode;output=$output;errors=$errors}
    } finally {
        foreach ($name in $Variables.Keys) { $info.EnvironmentVariables.Remove($name) }
        $process.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $keytool)) { throw 'The approved existing JDK 17 keytool is unavailable.' }
Assert-NoLink $signingDir
if ([IO.Path]::GetFullPath($signingDir).StartsWith($projectRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Signing storage must be outside the repository.' }

if ($Action -eq 'Initialize') {
    if (Test-Path -LiteralPath $signingDir) { throw 'Signing directory already exists. Refusing to overwrite or regenerate credentials.' }
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    $random=New-Object byte[] 32
    $plainBytes=$null; $recovered=$null; $secret=$null
    try {
        $rng.GetBytes($random)
        $secret=[Convert]::ToBase64String($random)
        $plainBytes=[Text.Encoding]::UTF8.GetBytes($secret)
        $encrypted=[Security.Cryptography.ProtectedData]::Protect($plainBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $recovered=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        if ([Convert]::ToBase64String($plainBytes) -cne [Convert]::ToBase64String($recovered)) { throw 'Current-user DPAPI validation failed.' }
        [void][IO.Directory]::CreateDirectory($signingDir)
        $acl=New-Object Security.AccessControl.DirectorySecurity
        $acl.SetOwner([Security.Principal.SecurityIdentifier]::new($currentSid))
        $acl.SetAccessRuleProtection($true,$false)
        foreach ($sid in @($currentSid,$systemSid)) {
            $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $signingDir -AclObject $acl
        Assert-PrivateAcl $signingDir
        if (-not (Get-Acl -LiteralPath $signingDir).AreAccessRulesProtected) { throw 'Signing directory inheritance is not disabled.' }
        Write-NewBytes $credentialFile $encrypted
        $vars=@{SPARTAN_RELEASE_STORE_PASSWORD=$secret;SPARTAN_RELEASE_KEY_PASSWORD=$secret}
        $args='-J-Duser.language=en -genkeypair -storetype PKCS12 -keystore "'+$storeFile+'" -alias '+$keyAlias+' -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 -dname "CN=SPARTAN-G Android Release" -storepass:env SPARTAN_RELEASE_STORE_PASSWORD -keypass:env SPARTAN_RELEASE_KEY_PASSWORD'
        $generation=Invoke-PrivateChild $keytool $args $signingDir $vars $secret
        if ($generation.exitCode -ne 0) { throw 'Key generation failed. Preserve the protected directory and investigate without regenerating.' }
        Assert-PrivateAcl $storeFile
        $args='-J-Duser.language=en -exportcert -storetype PKCS12 -keystore "'+$storeFile+'" -alias '+$keyAlias+' -file "'+$certificateFile+'" -storepass:env SPARTAN_RELEASE_STORE_PASSWORD'
        $export=Invoke-PrivateChild $keytool $args $signingDir $vars $secret
        if ($export.exitCode -ne 0) { throw 'Public certificate verification failed. Do not regenerate the key.' }
        Assert-PrivateAcl $certificateFile
        $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($certificateFile)
        $hash=[Security.Cryptography.SHA256]::Create()
        try { $fingerprint=([BitConverter]::ToString($hash.ComputeHash($cert.RawData))).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() }
        if ($cert.PublicKey.Key.KeySize -ne 3072) { throw 'Unexpected public key size.' }
        $public=[ordered]@{createdAt=[DateTime]::UtcNow.ToString('o');keystorePath=$storeFile;credentialPath=$credentialFile;certificatePath=$certificateFile;alias=$keyAlias;storeType='PKCS12';algorithm='RSA';keyBits=3072;signatureAlgorithm=$cert.SignatureAlgorithm.Value;certificateSha256=$fingerprint;certificateSha1=$cert.Thumbprint.ToLowerInvariant();notBefore=$cert.NotBefore.ToUniversalTime().ToString('o');notAfter=$cert.NotAfter.ToUniversalTime().ToString('o');credentialProtection='Windows DPAPI CurrentUser';aclPrincipals=@($currentSid,$systemSid);portableRecoveryBackupCreated=$false;uploaded=$false}
        Write-NewBytes $publicFile ([Text.Encoding]::UTF8.GetBytes(($public|ConvertTo-Json -Depth 4)))
        $public|ConvertTo-Json -Depth 4
    } finally {
        foreach ($bytes in @($random,$plainBytes,$recovered)) { if ($null -ne $bytes) { [Array]::Clear($bytes,0,$bytes.Length) } }
        if (Get-Variable vars -ErrorAction SilentlyContinue) { $vars.Clear() }
        $secret=$null; $rng.Dispose()
    }
} elseif ($Action -eq 'Inspect') {
    foreach ($p in @($signingDir,$storeFile,$credentialFile,$publicFile,$certificateFile)) { Assert-NoLink $p; Assert-PrivateAcl $p }
    Get-Content -LiteralPath $publicFile -Raw
} else {
    foreach ($p in @($signingDir,$storeFile,$credentialFile,$publicFile)) { Assert-NoLink $p; Assert-PrivateAcl $p }
    if (-not $EvidenceFile) { throw 'A task-local validation evidence path is required.' }
    $evidencePath=[IO.Path]::GetFullPath($EvidenceFile)
    $evidenceRoot=Join-Path $projectRoot 'docs\android-release-signing-setup'
    if (-not $evidencePath.StartsWith($evidenceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $evidencePath)) { throw 'Refusing to overwrite evidence or write outside this task.' }
    if (-not (Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe'))) { throw 'The existing approved portable Node 22 runtime is unavailable.' }
    $plainBytes=$null; $secret=$null; $vars=@{}
    try {
        $vars=@{JAVA_HOME=$javaDir;PATH=($nodeDir+';'+(Join-Path $javaDir 'bin')+';'+$env:PATH);EXPO_OFFLINE='1';CI='1';SPARTAN_AI_MODE='disabled';EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE='0';EXPO_PUBLIC_SPARTAN_GARDEN_BACKEND='0'}
        if ($ValidationCase -notin @('missing','debug')) {
            $plainBytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($credentialFile),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
            $secret=[Text.Encoding]::UTF8.GetString($plainBytes)
            $vars.SPARTAN_RELEASE_STORE_FILE=$storeFile; $vars.SPARTAN_RELEASE_KEY_ALIAS=$keyAlias
            $vars.SPARTAN_RELEASE_STORE_PASSWORD=$secret; $vars.SPARTAN_RELEASE_KEY_PASSWORD=$secret
            if ($ValidationCase -eq 'wrong-password') { $vars.SPARTAN_RELEASE_STORE_PASSWORD='synthetic-invalid-password'; $vars.SPARTAN_RELEASE_KEY_PASSWORD='synthetic-invalid-password' }
            if ($ValidationCase -eq 'wrong-alias') { $vars.SPARTAN_RELEASE_KEY_ALIAS='synthetic-missing-alias' }
        }
        $tasks=':app:verifyReleaseSigning :app:validateSigningRelease'
        # AGP omits validateSigningRelease when its inputs are absent. Exercise the
        # actual release pre-build dependency instead of failing task selection.
        if ($ValidationCase -eq 'missing') { $tasks=':app:preReleaseBuild' }
        if ($ValidationCase -eq 'debug') { $tasks=':app:validateSigningDebug' }
        $arguments='/d /c gradlew.bat '+$tasks+' --offline --no-daemon --no-configuration-cache --no-build-cache --console=plain'
        $run=Invoke-PrivateChild $env:ComSpec $arguments (Join-Path $projectRoot 'apps\mobile\android') $vars $secret
        $combined=$run.output+$run.errors
        if ($combined -match '(?m)^> Task :app:(?:assemble|package|createBundle|install|compile|externalNativeBuild)') { throw 'Unexpected application build task appeared; inspect task-local state and stop.' }
        $result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');validationCase=$ValidationCase;tasks=$tasks;exitCode=$run.exitCode;offline=$true;apkBuild=$false;credentialsLogged=$false;output=$combined}
        [IO.File]::WriteAllText($evidencePath,($result|ConvertTo-Json -Depth 4)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
        [pscustomobject]@{validationCase=$ValidationCase;exitCode=$run.exitCode;evidence=$evidencePath;apkBuild=$false}|ConvertTo-Json
        if (($ValidationCase -in @('valid','debug') -and $run.exitCode -ne 0) -or ($ValidationCase -notin @('valid','debug') -and $run.exitCode -eq 0)) { throw 'Unexpected validation result; see sanitized task evidence.' }
    } finally {
        if ($null -ne $plainBytes) { [Array]::Clear($plainBytes,0,$plainBytes.Length) }
        $secret=$null; $vars.Clear()
    }
}

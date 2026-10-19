param([switch]$Preflight,[string]$BackupDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$storage=Join-Path $env:LOCALAPPDATA 'SpartanG\signing'
$metadata=Get-Content -LiteralPath (Join-Path $storage 'spartan-g-release.public.json') -Raw|ConvertFrom-Json
$expected='d0ae97095e6dc78dfe83f1f60c02e9eb40b67b28810a592be8b6a0a368e4433f'
if($metadata.certificateSha256 -cne $expected){throw 'Existing release identity differs; no backup action was taken.'}
$jdk='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot\bin'
$java=Join-Path $jdk 'java.exe'; $keytool=Join-Path $jdk 'keytool.exe'
$probe=Join-Path $PSScriptRoot 'VerifyAndroidSigningKey.java'
$entropy=[Text.Encoding]::UTF8.GetBytes('SpartanG.Android.ReleaseSigning.v1')
$sourceHash=(Get-FileHash -LiteralPath $metadata.keystorePath -Algorithm SHA256).Hash
$sourceBytes=$null;$sourceSecret=$null;$backupSecret=$null;$confirmSecret=$null;$first=$null;$second=$null
function Run-Private([string]$Executable,[string]$Arguments,[hashtable]$Variables){
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$Executable;$info.Arguments=$Arguments;$info.WorkingDirectory=$root
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    foreach($name in $Variables.Keys){$info.EnvironmentVariables[$name]=[string]$Variables[$name]}
    $child=New-Object Diagnostics.Process;$child.StartInfo=$info
    try{
        if(-not $child.Start()){throw 'Could not start the local signing tool.'}
        $o=$child.StandardOutput.ReadToEndAsync();$e=$child.StandardError.ReadToEndAsync()
        if(-not $child.WaitForExit(90000)){$child.Kill();throw 'Local key verification timed out.'}
        if($child.ExitCode -ne 0){throw 'Local signing tool failed. Keep the original key; no secrets are displayed.'}
        return $o.Result
    }finally{foreach($name in $Variables.Keys){$info.EnvironmentVariables.Remove($name)};$child.Dispose()}
}
function Plaintext([Security.SecureString]$Value){$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value);try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}}
function Assert-NoLink([string]$Value){$cursor=$Value;while($cursor){if((Test-Path -LiteralPath $cursor)-and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Backup storage must not traverse links.'};$cursor=[IO.Path]::GetDirectoryName($cursor)}}
try{
    $sourceBytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($metadata.credentialPath),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $sourceSecret=[Text.Encoding]::UTF8.GetString($sourceBytes)
    $proof=(Run-Private $java ('"'+$probe+'" "'+$metadata.keystorePath+'" '+$metadata.alias+' '+$expected+' SPARTAN_SOURCE_PASSWORD') @{SPARTAN_SOURCE_PASSWORD=$sourceSecret})|ConvertFrom-Json
    if(-not $proof.verified){throw 'Original key verification failed.'}
    if($Preflight){
        $evidence=Join-Path $root 'docs\ai-enabled-apk-integration\backup-preflight.json'
        if(Test-Path -LiteralPath $evidence){throw 'Refusing to overwrite preflight evidence.'}
        $result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');passed=$true;originalKeyVerified=$true;certificateSha256=$expected;backupCreated=$false;passwordDisclosed=$false;apkBuilt=$false}
        [IO.File]::WriteAllText($evidence,($result|ConvertTo-Json)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
        $result|ConvertTo-Json
    }else{
        if(-not [Environment]::UserInteractive -or [Console]::IsInputRedirected){throw 'Run this script in your own interactive PowerShell terminal. Never enter a password in chat or an agent tool.'}
        if(-not $BackupDirectory){$BackupDirectory=Read-Host 'NEW external backup directory (prefer encrypted removable storage; no cloud upload)'}
        if(-not [IO.Path]::IsPathRooted($BackupDirectory) -or $BackupDirectory -match '["\r\n]'){throw 'An absolute local backup directory is required.'}
        $destination=[IO.Path]::GetFullPath($BackupDirectory)
        Assert-NoLink $destination
        $gitRoot=[IO.Path]::GetFullPath((& git -C $root rev-parse --show-toplevel).Trim())
        foreach($excluded in @($gitRoot,$storage)){if($destination.StartsWith($excluded.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)-or $destination -eq $excluded){throw 'Backup must be outside the Git checkout, checkpoint backups and original signing directory.'}}
        if(Test-Path -LiteralPath $destination){throw 'Choose a new directory; existing data will not be overwritten.'}
        $evidence=Join-Path $root 'docs\ai-enabled-apk-integration\key-recovery.json'
        if(Test-Path -LiteralPath $evidence){throw 'Recovery evidence already exists. Preserve it and review before another operation.'}
        Write-Host 'Save a strong backup password in your approved password manager. It is not saved by this script.'
        $first=Read-Host 'Backup password (at least 20 characters)' -AsSecureString
        $second=Read-Host 'Confirm backup password' -AsSecureString
        $backupSecret=Plaintext $first;$confirmSecret=Plaintext $second
        if($backupSecret.Length -lt 20 -or $backupSecret -match '[\r\n\x00]' -or $backupSecret -cne $confirmSecret){throw 'Password requirements or confirmation failed; no backup file was created.'}
        [void][IO.Directory]::CreateDirectory($destination)
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
        foreach($identity in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
        Set-Acl -LiteralPath $destination -AclObject $acl
        $backupFile=Join-Path $destination 'spartan-g-release-recovery.p12'
        $args='-importkeystore -srckeystore "'+$metadata.keystorePath+'" -srcstoretype PKCS12 -srcalias '+$metadata.alias+' -srcstorepass:env SPARTAN_SOURCE_PASSWORD -srckeypass:env SPARTAN_SOURCE_PASSWORD -destkeystore "'+$backupFile+'" -deststoretype PKCS12 -destalias '+$metadata.alias+' -deststorepass:env SPARTAN_BACKUP_PASSWORD -destkeypass:env SPARTAN_BACKUP_PASSWORD -noprompt'
        [void](Run-Private $keytool $args @{SPARTAN_SOURCE_PASSWORD=$sourceSecret;SPARTAN_BACKUP_PASSWORD=$backupSecret})
        $backupProof=(Run-Private $java ('"'+$probe+'" "'+$backupFile+'" '+$metadata.alias+' '+$expected+' SPARTAN_BACKUP_PASSWORD') @{SPARTAN_BACKUP_PASSWORD=$backupSecret})|ConvertFrom-Json
        if(-not $backupProof.verified){throw 'Backup proof failed; retain the original key and do not proceed to a build.'}
        if((Get-FileHash -LiteralPath $metadata.keystorePath -Algorithm SHA256).Hash -cne $sourceHash){throw 'Original key changed unexpectedly. Stop and investigate.'}
        $result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');verified=$true;backupPath=$backupFile;certificateSha256=$expected;alias=$metadata.alias;format='PKCS12';samePrivateKeyProof=$true;backupUnlockIndependentOfDpapi=$true;originalKeyUnchanged=$true;passwordStoredByScript=$false;passwordHandoff='operator secure local prompt';secondOfflineCopyVerified=$false;differentComputerTested=$false;uploaded=$false;apkBuilt=$false}
        $body=($result|ConvertTo-Json)+[Environment]::NewLine
        [IO.File]::WriteAllText((Join-Path $destination 'recovery-verification.json'),$body,[Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText($evidence,$body,[Text.UTF8Encoding]::new($false))
        Write-Host 'Portable encrypted key backup verified. Original key unchanged. No APK was built.'
        Write-Host 'Keep the backup password separately recoverable. Maintain another offline encrypted copy.'
    }
}finally{
    if($null -ne $sourceBytes){[Array]::Clear($sourceBytes,0,$sourceBytes.Length)}
    if($null -ne $first){$first.Dispose()};if($null -ne $second){$second.Dispose()}
    $sourceSecret=$null;$backupSecret=$null;$confirmSecret=$null
}

[CmdletBinding()]
param([string]$GoogleServicesPath,[switch]$BuildApprovedOnce)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$node=Join-Path $env:TEMP 'spartan-g-phase5-node22.23.3\node-v22.23.3-win-x64\node.exe'
$mode=if($BuildApprovedOnce){'--prepare-approved-build'}else{'--validate'}
$nodeArgs=@((Join-Path $PSScriptRoot 'profile.cjs'),$mode)
if($GoogleServicesPath){$nodeArgs+=$GoogleServicesPath}
# Config validation happens before DPAPI, keystore access or a Gradle process.
$reply=& $node @nodeArgs
if($LASTEXITCODE -ne 0){$reply;exit 1}
if(-not $BuildApprovedOnce){$reply;exit 0}
$prepared=$reply|ConvertFrom-Json
$plan=Get-Content -LiteralPath $prepared.planPath -Raw|ConvertFrom-Json
$privateRoot=[IO.Path]::GetFullPath($prepared.directory)
if($plan.applicationId -cne 'com.spartang.mobile.staging' -or $plan.projectId -cne 'spartan-g-assessment-staging' -or $plan.versionCode -ne 25 -or $plan.submissionEnabled -ne $false){throw 'Invalid staging contract.'}
$attempt=Join-Path $privateRoot 'BUILD_ATTEMPT.json'
if(Test-Path -LiteralPath $attempt){throw 'This build attempt has already been consumed.'}
# No launcher path silently enrolls in compilation; separate build approval is required.
if((Read-Host 'Separately approved one staging APK build? Type BUILD STAGING V25') -cne 'BUILD STAGING V25'){throw 'Build confirmation did not match.'}
$verify=& $node (Join-Path $PSScriptRoot 'profile.cjs') --revalidate-prepared-build $prepared.planPath
if($LASTEXITCODE -ne 0){$verify;exit 1}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$signingDir=Join-Path $env:LOCALAPPDATA 'SpartanG\signing'
foreach($name in @('spartan-g-release.jks','spartan-g-release.credentials.dpapi','spartan-g-release.public.json')){
 $p=Join-Path $signingDir $name
 $item=Get-Item -LiteralPath $p -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Signing storage link rejected.'}
 $acl=Get-Acl -LiteralPath $p
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid){throw 'Signing ownership mismatch.'}
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Value -notin @($sid,'S-1-5-18')){throw 'Signing ACL mismatch.'}
 }
}
$envPlan=Get-Content -LiteralPath (Join-Path $privateRoot 'environment.json') -Raw|ConvertFrom-Json
if((Get-FileHash -LiteralPath $plan.googleServices -Algorithm SHA256).Hash.ToLowerInvariant() -cne $plan.googleServicesSha256){throw 'Staging public configuration changed.'}
if(Test-Path -LiteralPath $plan.appBuildDirectory){throw 'Refusing an existing app output directory.'}
$stream=[IO.File]::Open($attempt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$stream.Dispose()
$bytes=$null;$secret=$null;$process=$null;$info=$null
try{
 Add-Type -AssemblyName System.Security
 $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $signingDir 'spartan-g-release.credentials.dpapi')),[Text.Encoding]::UTF8.GetBytes('SpartanG.Android.ReleaseSigning.v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
 $secret=[Text.Encoding]::UTF8.GetString($bytes)
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$env:ComSpec
 $init=Join-Path $PSScriptRoot 'native.gradle'
 if($init -match '["%&|<>]'){throw 'Unsafe local launcher path.'}
 $info.Arguments='/d /c gradlew.bat :app:assembleRelease --offline --no-daemon --no-configuration-cache --no-build-cache --max-workers=2 --console=plain --init-script "'+$init+'"'
 $info.WorkingDirectory=Join-Path $projectRoot 'apps\mobile\android'
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables.Clear()
 foreach($p in $envPlan.PSObject.Properties){$info.EnvironmentVariables[$p.Name]=[string]$p.Value}
 $info.EnvironmentVariables['SPARTAN_STAGING_NATIVE_CONTRACT']=$prepared.planPath
 $info.EnvironmentVariables['SPARTAN_RELEASE_STORE_FILE']=Join-Path $signingDir 'spartan-g-release.jks'
 $info.EnvironmentVariables['SPARTAN_RELEASE_KEY_ALIAS']='spartan-g-release'
 $info.EnvironmentVariables['SPARTAN_RELEASE_STORE_PASSWORD']=$secret
 $info.EnvironmentVariables['SPARTAN_RELEASE_KEY_PASSWORD']=$secret
 $process=New-Object Diagnostics.Process;$process.StartInfo=$info
 if(-not $process.Start()){throw 'Staging build process did not start.'}
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();$process.WaitForExit()
 $log=($stdout.Result+[Environment]::NewLine+$stderr.Result).Replace($secret,'<redacted>')
 $log=[regex]::Replace($log,'AIza[A-Za-z0-9_-]{35}','<public-firebase-key-redacted>')
 [IO.File]::WriteAllText((Join-Path $privateRoot 'BUILD.log'),$log,[Text.UTF8Encoding]::new($false))
 $apk=Join-Path $plan.appBuildDirectory 'outputs\apk\release\app-release.apk'
 $result=[ordered]@{status=if($process.ExitCode -eq 0){'built-awaiting-independent-apk-audit'}else{'build-failed'};exitCode=$process.ExitCode;apk=if(Test-Path -LiteralPath $apk){$apk}else{$null};installed=$false;releaseVerified=$false;automaticRetries=0}
 [IO.File]::WriteAllText((Join-Path $privateRoot 'BUILD_RESULT.json'),($result|ConvertTo-Json))
 $result|ConvertTo-Json
 if($process.ExitCode -ne 0){exit $process.ExitCode}
}catch{
 Write-Output 'Stopped: local_staging_build_failure. No retry. Preserve the private build output for review.'
 exit 1
}finally{
 if($null -ne $bytes){[Array]::Clear($bytes,0,$bytes.Length)}
 if($null -ne $info){$info.EnvironmentVariables.Clear()}
 $secret=$null
 if($null -ne $process){$process.Dispose()}
}

# Motore facoltativo: eseguito soltanto dopo il clic su Installa.
param([Parameter(Mandatory=$true)][string]$Radice)
$ErrorActionPreference = 'Stop'
function Passo($k, $testo) { @{ k=$k; dettaglio=$testo } | ConvertTo-Json -Compress | Write-Output }
function Esegui($programma, $argomenti) {
  $precedente = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $programma @argomenti 2>&1 | Out-File -FilePath (Join-Path $Radice 'installazione.log') -Append -Encoding utf8 -ErrorAction Stop
    $codice = $LASTEXITCODE
  } finally { $ErrorActionPreference = $precedente }
  if ($codice -ne 0) { throw 'Installazione interrotta: consulta installazione.log nella cartella del motore' }
}
try {
  New-Item -ItemType Directory -Force $Radice | Out-Null
  $env:UV_PYTHON_INSTALL_DIR = Join-Path $Radice 'python'
  $env:UV_CACHE_DIR = Join-Path $Radice 'cache-uv'
  $env:UV_NO_PROGRESS = '1'
  $env:UV_PYTHON_DOWNLOADS = 'automatic'
  $uv = Join-Path $Radice 'uv.exe'
  Passo 0.02 'Scarico il gestore Python privato (uv 0.9.7)...'
  $url = 'https://github.com/astral-sh/uv/releases/download/0.9.7/uv-x86_64-pc-windows-msvc.zip'
  $zip = Join-Path $Radice 'uv.zip'
  Esegui 'curl.exe' @('--fail','--location','--retry','3','--output',$zip,$url)
  $sha = Join-Path $Radice 'uv.sha256'
  Esegui 'curl.exe' @('--fail','--location','--retry','3','--output',$sha,($url + '.sha256'))
  $atteso = ((Get-Content -LiteralPath $sha -Raw).Trim() -split '\s+')[0]
  if ($atteso -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $atteso) { throw 'Il controllo SHA-256 di uv non torna: riprova' }
  Expand-Archive -LiteralPath $zip -DestinationPath $Radice -Force
  Passo 0.12 'Preparo Python 3.12 privato e il suo ambiente...'
  $venv = Join-Path $Radice 'venv'
  Esegui $uv @('venv','--clear','--managed-python','--python','3.12.8',$venv)
  $python = Join-Path $venv 'Scripts/python.exe'
  Passo 0.25 'Scarico torch e CUDA: diversi GB, può volerci un po...'
  Esegui $uv @('pip','install','--python',$python,'--only-binary',':all:','torch==2.8.0','torchaudio==2.8.0','--index-url','https://download.pytorch.org/whl/cu128')
  Passo 0.75 'Installo Qwen3-TTS e le librerie della voce...'
  Esegui $uv @('pip','install','--python',$python,'--index-url','https://pypi.org/simple','torch==2.8.0','torchaudio==2.8.0','qwen-tts==0.1.1','huggingface-hub==0.36.0','soundfile==0.13.1')
  Passo 0.95 'Controllo i pacchetti, senza caricare modelli o usare la GPU...'
  Esegui $python @('-c',"from importlib.metadata import version; assert version('qwen-tts') == '0.1.1'; assert version('torch').startswith('2.8.0'); assert 'cu128' in version('torch')")
  & $uv pip freeze --python $python | Set-Content -LiteralPath (Join-Path $Radice 'pacchetti-installati.txt') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Non riesco a salvare le versioni installate' }
  Set-Content -LiteralPath (Join-Path $Radice 'pronto') -Value '1' -Encoding ascii
  Passo 1 'Motore installato. I modelli si scaricano a parte.'
} catch { Passo 0 $_.Exception.Message; exit 1 }

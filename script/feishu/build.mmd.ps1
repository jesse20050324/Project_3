# 从 map-ch3/4/5.md 生成飞书画板适配版 .mmd（副本，原文件未动）
# 用法：powershell -File script\feishu\build.mmd.ps1
# 前提：map-ch*.md 里的对话引号已转为曲引号（本脚本的 Sanitize 会把曲引号去掉，
#       这样飞书标签里不会出现任何引号字符，规避飞书解析器风险）。

$enc = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot   # script\

function Sanitize([string]$s) {
  $s = $s -replace ' · ', ' '
  $s = $s -replace '·', ''
  $s = $s -replace '【','' -replace '】',''
  $s = $s -replace '「','' -replace '」',''
  $s = $s -replace [char]0x201C,'' -replace [char]0x201D,''
  $s = $s -replace [char]0x2018,'' -replace [char]0x2019,''
  $s = $s -replace '⏳等男生',' 需等男生'
  $s = $s -replace '⏳',''
  $s = $s -replace '🏷 ',''
  $s = $s -replace '🏷',''
  $s = $s -replace '→','出口：'
  $s = $s -replace '\{\{"(.+?)"\}\}', '["$1"]'
  $s = $s -replace '([A-Za-z_0-9]+) & ([A-Za-z_0-9]+) & ([A-Za-z_0-9]+) --> ([A-Za-z_0-9]+)', "`$1 --> `$4`n    `$2 --> `$4`n    `$3 --> `$4"
  return $s
}

function ConvertMap($inPath, $outPath, $title) {
  $lines = [System.IO.File]::ReadAllLines($inPath, $enc)
  $blocks = @()
  $curTitle = ''
  $inM = $false
  $buf = $null
  for ($i=0; $i -lt $lines.Count; $i++) {
    $l = $lines[$i]
    if ($l.StartsWith('## ')) { $curTitle = ($l -replace '^##[^·]*·\s*','').Trim() }
    if ($l -eq '```mermaid') { $inM = $true; $buf = New-Object System.Collections.Generic.List[string]; continue }
    if ($inM -and $l -eq '```') { $blocks += @{title=$curTitle; lines=$buf.ToArray()}; $inM=$false; continue }
    if ($inM) { $buf.Add($l) }
  }
  $out = New-Object System.Collections.Generic.List[string]
  $out.Add("%% $title 飞书画板适配版")
  $out.Add("%% 提取自 script/$([System.IO.Path]::GetFileName($inPath))（副本，原文件未动）")
  $out.Add("%% 适配：graph关键字 / subgraph分线 / br换行 / 无花形节点 / 边标签纯文本 / 无&语法 / 无emoji / 无引号")
  $out.Add('')
  $out.Add('graph TD')
  $n = 0
  foreach ($b in $blocks) {
    $n++
    $t = Sanitize $b.title
    $out.Add(('subgraph L' + $n + ' ["' + $t + '"]'))
    foreach ($raw in $b.lines) {
      $s = Sanitize $raw
      if ($s -match '^\s*(flowchart|graph)\s') { continue }
      if ($s.Trim() -eq '') { continue }
      $out.Add($s)
    }
    $out.Add('end')
  }
  [System.IO.File]::WriteAllLines($outPath, $out, $enc)
}

ConvertMap (Join-Path $root 'map-ch3.md') (Join-Path $PSScriptRoot 'ch3.mmd') 'CH3 全文轮次图'
ConvertMap (Join-Path $root 'map-ch4.md') (Join-Path $PSScriptRoot 'ch4.mmd') 'CH4 全文轮次图'
ConvertMap (Join-Path $root 'map-ch5.md') (Join-Path $PSScriptRoot 'ch5.mmd') '幕5 全文轮次图'
Write-Host 'done'

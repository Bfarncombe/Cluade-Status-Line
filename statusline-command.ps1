# Claude Code status line: model name, context-used progress bar, percentage,
# token counts, project name, and git branch.
# Each field is colored (model=cyan, bar/percentage=green/yellow/red by usage
# level, tokens=gray, project=blue, branch=magenta), separated by dimmed " | ".
# Runs under PowerShell on Windows (invoked directly, not via Git Bash).

function Format-TokenCount([double]$n) {
    if ($n -ge 1000000) { return "{0:N1}M" -f ($n / 1000000) }
    if ($n -ge 1000) { return "{0:N1}K" -f ($n / 1000) }
    return "{0:N0}" -f $n
}

$json = [Console]::In.ReadToEnd()

try {
    $data = $json | ConvertFrom-Json
} catch {
    $data = $null
}

$model = $null
$dir = $null
$projectDir = $null
$ctx = $null
if ($data) {
    if ($data.model) { $model = $data.model.display_name }
    if ($data.workspace) {
        $dir = $data.workspace.current_dir
        $projectDir = $data.workspace.project_dir
    }
    if ($data.context_window) { $ctx = $data.context_window }
}

$project = $null
if ($projectDir) {
    $project = Split-Path -Leaf $projectDir
} elseif ($dir) {
    $project = Split-Path -Leaf $dir
}

$branch = $null
if ($dir) {
    $branch = git --no-optional-locks -C "$dir" rev-parse --abbrev-ref HEAD 2>$null
}

$esc = [char]27
$dim = "$esc[2m"
$reset = "$esc[0m"
$sep = "$dim |$reset"

# Distinct colors per field
$cyan = "$esc[36m"
$green = "$esc[32m"
$yellow = "$esc[33m"
$red = "$esc[31m"
$gray = "$esc[37m"
$magenta = "$esc[35m"
$blue = "$esc[34m"

# Progress bar + percentage (color reflects usage level)
$barText = $null
$pctText = $null
if ($ctx -and ($null -ne $ctx.used_percentage)) {
    $pct = [double]$ctx.used_percentage
    $barLength = 20
    $filled = [Math]::Round(($pct / 100) * $barLength)
    if ($filled -lt 0) { $filled = 0 }
    if ($filled -gt $barLength) { $filled = $barLength }
    $empty = $barLength - $filled
    $bar = ("#" * $filled) + ("-" * $empty)

    if ($pct -ge 80) { $levelColor = $red }
    elseif ($pct -ge 50) { $levelColor = $yellow }
    else { $levelColor = $green }

    $barText = "$levelColor[$bar]$reset"
    $pctText = "$levelColor$("{0:N0}%" -f $pct)$reset"
}

# Token counts (used / context window size)
$tokensText = $null
if ($ctx -and $ctx.total_input_tokens -and $ctx.context_window_size) {
    $used = Format-TokenCount([double]$ctx.total_input_tokens)
    $total = Format-TokenCount([double]$ctx.context_window_size)
    $tokensText = "$gray$used/$total tokens$reset"
}

$parts = New-Object System.Collections.Generic.List[string]
if ($model) { $parts.Add("$cyan$model$reset") }
if ($barText) { $parts.Add($barText) }
if ($pctText) { $parts.Add($pctText) }
if ($tokensText) { $parts.Add($tokensText) }
if ($project) { $parts.Add("$blue$project$reset") }
if ($branch) { $parts.Add("$magenta$branch$reset") }

Write-Output ($parts -join " $sep ")

$ErrorActionPreference = "SilentlyContinue"
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
public class PWX {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool EnumWindows(E l, int p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int c);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool E(IntPtr h, int l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L,T,Ri,B; }
}
"@ -ReferencedAssemblies System.Drawing

function Get-PetHwnd {
  $pet = [IntPtr]::Zero
  [PWX]::EnumWindows({ param($h,$l)
    if ([PWX]::IsWindowVisible($h)) {
      $sb = New-Object System.Text.StringBuilder 256
      [PWX]::GetWindowText($h, $sb, 256) | Out-Null
      $title = $sb.ToString()
      if ($title -match 'Pet' -and -not ($title -match 'Chat') -and -not ($title -match '设置')) {
        $script:pet = $h; return $false
      }
    }
    return $true
  }, 0) | Out-Null
  return $pet
}

function Capture-Pet {
  param([string]$Name)
  $pet = Get-PetHwnd
  if ($pet -eq [IntPtr]::Zero) { Write-Host "  no pet"; return }
  $r = New-Object PWX+R
  [PWX]::GetWindowRect($pet, [ref]$r) | Out-Null
  $w = $r.Ri - $r.L; $hi = $r.B - $r.T
  $bmp = New-Object System.Drawing.Bitmap $w, $hi
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Magenta)
  $hdc = $g.GetHdc()
  [PWX]::PrintWindow($pet, $hdc, 2) | Out-Null
  $g.ReleaseHdc($hdc); $g.Dispose()
  $shot = "$env:TEMP\nuwa-pet-$Name.png"
  $bmp.Save($shot, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  saved: $shot ($w x $hi)"
}

# 清掉旧 vault 确保重 seed
Get-Process electron, node | Stop-Process -Force
Start-Sleep -Seconds 2

$names = @(
  @{ key='KUN'; file='1-kun' }
  @{ key='三笠'; file='2-mikasa' }
  @{ key='薇尔莉特'; file='3-violet' }
)

foreach ($n in $names) {
  Write-Host "==== $($n.key) ===="
  # 杀掉之前的 dev
  Get-Process electron, node | Stop-Process -Force
  Start-Sleep -Seconds 2

  # 启动 dev with NUWA_PET_DEV_ACTIVE
  $env:NUWA_PET_DEV_ACTIVE = $n.key
  Push-Location "d:\桌面\文件夹\Bailin"
  Start-Process -FilePath "pnpm" -ArgumentList "dev" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\nuwa-dev-$($n.file).log"
  Pop-Location
  # 等 electron 起来 + sprite 渲染
  Start-Sleep -Seconds 10
  Capture-Pet -Name $n.file
}

# 收尾
Get-Process electron, node | Stop-Process -Force
Write-Host "done"

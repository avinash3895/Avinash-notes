@echo off
setlocal
title Deck Studio - install
cd /d "%~dp0"
echo.
echo  Deck Studio - one-time setup (no admin rights needed)
echo  -----------------------------------------------------
echo.

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo  Python was not found.
  echo  Install Python 3.11, 3.12 or 3.13 from the Company Portal or python.org
  echo  ^(choose "Install for me only" - no admin needed^), then run this again.
  pause
  exit /b 1
)
echo  Using: %PY%
%PY% --version
echo.
echo  Installing the two helper packages from the bundled files (works offline)...
%PY% -m pip install --user --disable-pip-version-check --no-index --find-links "%~dp0vendor\wheels" -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo.
  echo  Offline install did not work for this Python version, trying the internet...
  %PY% -m pip install --user --disable-pip-version-check -r "%~dp0requirements.txt"
  if errorlevel 1 (
    echo  Setup failed. Please send a screenshot of this window.
    pause
    exit /b 1
  )
)
echo.
echo  Creating a "Deck Studio" shortcut on your Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Deck Studio.lnk'); $s.TargetPath='%~dp0Start Deck Studio.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.IconLocation='%SystemRoot%\System32\imageres.dll,186'; $s.Save()"
echo.
echo  Done. Double-click "Deck Studio" on your Desktop to start.
pause

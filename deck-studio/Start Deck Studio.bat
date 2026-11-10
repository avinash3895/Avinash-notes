@echo off
title Deck Studio (keep this window open while you work)
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY set "PY=python"
%PY% "%~dp0server\app.py" %*
if errorlevel 1 (
  echo.
  echo  Deck Studio stopped with an error. If this is the first run, double-click
  echo  "Install Deck Studio.bat" first.
  pause
)

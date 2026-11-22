@echo off
setlocal
cd /d "%~dp0"
py -3 local_agent.py
if errorlevel 1 (
  echo.
  echo Kerno Local Service exited with an error.
  pause
)

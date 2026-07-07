@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
  python build_manifest.py
  if %errorlevel%==0 goto :done
)

where node >nul 2>nul
if %errorlevel%==0 (
  node scripts\build_manifest.cjs
  goto :done
)

echo Neither Python nor Node.js was found. Please install Node.js or Python.

:done
pause

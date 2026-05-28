@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0start-plantdex.ps1" -OpenBrowser %*

@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0start-florivu.ps1" -OpenBrowser %*

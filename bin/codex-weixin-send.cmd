@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0codex-weixin-send.ps1" %*

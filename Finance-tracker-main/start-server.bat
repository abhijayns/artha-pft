@echo off
title Bravo Finance Tracker Server
start "" http://127.0.0.1:5510/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 5510

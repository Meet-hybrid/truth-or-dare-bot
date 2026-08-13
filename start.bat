@echo off
cd /d "%~dp0"
:loop
echo [%date% %time%] Starting bot...
node index.js
echo Bot stopped/crashed. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop

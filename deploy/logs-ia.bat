@echo off
scp deploy\logs-ia.sh roberto@209.126.12.205:/tmp/
ssh -t roberto@209.126.12.205 "sudo bash /tmp/logs-ia.sh"
pause

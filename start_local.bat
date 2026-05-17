@echo off
cd /d %~dp0
if not exist venv (
  python -m venv venv
)
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
if not exist backend\.env (
  copy backend\.env.example backend\.env
  echo 已生成 backend\.env。请先填入 DEEPSEEK_API_KEY 后再重新运行。
  pause
  exit /b
)
python local_server.py
pause

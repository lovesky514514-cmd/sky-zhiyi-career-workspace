#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
if [ ! -f "backend/.env" ]; then
  cp backend/.env.example backend/.env
  echo "已生成 backend/.env。请先填入 DEEPSEEK_API_KEY 后再重新运行。"
  exit 0
fi
python local_server.py

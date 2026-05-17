# 服务器部署说明

推荐使用 Linux + Nginx + Gunicorn + Flask。

## 后端启动

    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    gunicorn -w 2 -b 127.0.0.1:5001 server:app

## Nginx 示例

    server {
        listen 80;
        server_name example.com;

        root /www/wwwroot/sky_zhiyi;
        index index.html;

        location /api/ {
            proxy_pass http://127.0.0.1:5001;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 120s;
        }

        location / {
            try_files $uri $uri/ /index.html;
        }
    }

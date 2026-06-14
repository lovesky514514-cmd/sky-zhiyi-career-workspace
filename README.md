# SKY职忆｜AI Career Workspace

SKY职忆是一个面向学生求职场景的 AI 简历诊断与求职训练工作台。项目围绕“简历导入 → 简历诊断 → 岗位匹配 → 定制简历 → 面试训练 → 求职记忆库”这一流程，帮助学生把分散的求职材料整理成可复用、可迭代的求职准备资产。

当前版本支持本地运行和云服务器部署，可用于网页端作品展示、比赛演示，也可以作为后续原生小程序或校园求职工具的基础版本。

线上演示：<https://skyzhiyi.cc.cd>

Demo 视频B站链接:<https://b23.tv/tSP615e>

---

## 项目定位

很多学生在求职准备中会遇到三个常见问题：

- 不知道简历哪里需要修改；
- 不知道自己适合哪些岗位；
- 面试回答缺少及时反馈和持续训练。

SKY职忆尝试把这些环节整合在一个轻量工作台中，让用户从第一份简历开始，逐步完成简历诊断、岗位筛选、简历优化和面试训练。

---

## 核心功能

### 1. 简历导入与结构化解析

用户可以输入或导入简历材料，系统会提取教育背景、项目经历、技能标签、证书经历等信息，为后续诊断、生成和匹配提供基础数据。

### 2. 简历健康度诊断

系统会从简历完整度、经历表达、技能呈现和岗位相关性等角度给出诊断结果，帮助用户发现简历中需要补充或优化的部分。

### 3. 岗位匹配与推荐

用户可以根据目标方向搜索岗位。系统结合简历内容和岗位要求进行匹配，并展示岗位推荐结果与匹配理由，帮助用户减少盲目投递。

### 4. 定制化简历生成

用户可以围绕目标岗位生成结构化简历草稿，使项目经历、技能描述和岗位需求更加贴合。生成内容支持编辑预览，导出时可生成 docx 文件。

### 5. 面试训练与回答反馈

系统提供常见面试问题，用户输入回答后可获得反馈建议，用于优化表达结构、岗位相关性和个人经历呈现。

### 6. 求职记忆库

系统会整理用户的项目经历、技能证书和面试反馈，形成可复用的求职材料库，方便后续继续生成简历和准备面试。

### 7. 移动端与小程序演示入口

网页端已做移动端适配，可用于手机端演示。项目也保留了微信小程序演示入口思路，便于后续改造为原生小程序版本。

---

## 技术栈

### 前端

- HTML
- CSS
- JavaScript
- 响应式页面适配

### 后端

- Python
- Flask
- requests
- python-dotenv
- Gunicorn

### 部署

- Linux
- Nginx
- systemd
- HTTPS

---

## 项目结构

```text
sky_zhiyi/
├── index.html
├── css/
│   ├── style.css
│   └── mobile-fix.css
├── js/
│   └── main.js
├── assets/
│   └── logo_sky_zhiyi.png
├── data/
│   ├── jobs.json
│   └── interview_questions.json
├── backend/
│   ├── server.py
│   ├── requirements.txt
│   ├── .env.example
│   └── __init__.py
├── docs/
│   └── server_deploy.md
├── local_server.py
├── start_local.bat
├── start_local.sh
├── miniprogram-demo-note.md
├── .gitignore
└── README.md
```

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/sky-zhiyi.git
cd sky-zhiyi
```

### 2. 配置 API Key

复制环境变量示例文件：

```bash
cp backend/.env.example backend/.env
```

然后编辑 `backend/.env`，填入自己的 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/chat/completions
```

### 3. Windows 启动

双击运行：

```text
start_local.bat
```

第一次运行会自动创建虚拟环境并安装依赖。如果脚本提示已生成 `backend/.env`，请填入 API Key 后再次运行。

### 4. Linux / macOS 启动

```bash
bash start_local.sh
```

启动后访问：

```text
http://127.0.0.1:5001
```

---

## 手动启动方式

如果不使用启动脚本，也可以手动运行：

```bash
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
python local_server.py
```

Windows PowerShell 可使用：

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r backend\requirements.txt
python local_server.py
```

---

## 云服务器部署参考

推荐使用：

```text
Nginx + Gunicorn + Flask
```

后端运行示例：

```bash
cd backend
gunicorn -w 2 -b 127.0.0.1:5001 server:app
```

Nginx 可将 `/api/` 反向代理到 Flask 后端：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:5001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}
```

前端静态文件由 Nginx 托管，API 请求由 Flask 后端处理。更详细的服务器部署说明可查看：

```text
docs/server_deploy.md
```

---

## 微信小程序说明

本项目保留了微信小程序演示入口思路。由于个人主体小程序不适合直接使用 `web-view` 外链正式上线，当前演示入口主要用于开发环境展示。

如果需要正式上线，建议后续改造为原生小程序页面，通过以下能力调用后端接口：

```text
wx.request
wx.uploadFile
```

---

## 安全与脱敏说明

公开仓库中不包含以下内容：

- `backend/.env`
- API Key
- 服务器证书
- 日志文件
- 虚拟环境
- 真实个人简历
- 真实手机号、邮箱、学号等个人信息

本仓库只保留：

```text
backend/.env.example
```

真实 API Key 只保存在本地或服务器环境中。

---

## 后续计划

- 完善原生小程序版本；
- 增加岗位数据更新能力；
- 优化简历诊断指标；
- 增强面试追问和多轮反馈；
- 增加用户数据持久化与账号系统；
- 支持更多简历模板导出。

---

## 本项目为参赛作品，用于参赛展示。


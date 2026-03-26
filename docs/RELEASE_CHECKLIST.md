# Release Checklist

## 1. 服务器准备

- 一台 Linux 服务器
- 已安装 Node.js 18+ 或 Node.js 20+
- 已安装 Nginx（如果要走域名）

## 2. 上传项目

建议部署目录：

```bash
/opt/carhome
```

上传代码后进入目录：

```bash
cd /opt/carhome
```

## 3. 配置环境变量

复制模板：

```bash
cp .env.example .env
```

至少填写：

```bash
HOST=0.0.0.0
PORT=3100
NODE_ENV=production
PHOTOROOM_API_KEY=your_photoroom_api_key
```

可选备用：

```bash
REMOVE_BG_API_KEY=your_remove_bg_api_key
```

## 4. 本地启动验证

```bash
cd /opt/carhome
npm run start:prod
```

检查：

```bash
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:3100/api/config
```

确认：

- `status` 为 `ok`
- `photoroom.configured` 为 `true`

## 5. 配置 systemd

复制服务文件：

```bash
sudo cp deploy/carhome.service /etc/systemd/system/carhome.service
```

如果你的部署目录不是 `/opt/carhome`，先修改 `deploy/carhome.service` 里的：

- `WorkingDirectory`
- `EnvironmentFile`
- `User`
- `Group`

然后启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable carhome
sudo systemctl start carhome
sudo systemctl status carhome
```

## 6. 配置 Nginx

复制示例配置：

```bash
sudo cp deploy/nginx.carhome.conf /etc/nginx/sites-available/carhome.conf
```

修改：

- `server_name your-domain.example.com`

启用：

```bash
sudo ln -s /etc/nginx/sites-available/carhome.conf /etc/nginx/sites-enabled/carhome.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 7. 上线后验证

- 打开域名首页
- 上传真实车图
- 检查：
  - 抠图成功
  - 商品图成功
  - PNG 下载正常

## 8. 建议

- 生产只保留服务器端 key
- 不要把 `.env` 提交进仓库
- 如果团队量大，建议加日志采集和请求限流

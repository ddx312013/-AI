# Ubuntu Ops Commands

下面这份清单适合 Ubuntu 22.04 / 24.04 服务器。

## 1. 安装基础环境

```bash
sudo apt update
sudo apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2. 创建部署目录

```bash
sudo mkdir -p /opt/carhome
sudo chown -R $USER:$USER /opt/carhome
cd /opt/carhome
```

## 3. 上传代码

如果用 git：

```bash
git clone <your-repo-url> /opt/carhome
cd /opt/carhome
```

如果是压缩包上传，解压后进入：

```bash
cd /opt/carhome
```

## 4. 配置环境变量

```bash
cp .env.example .env
nano .env
```

至少写入：

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

## 5. 本地启动验证

```bash
cd /opt/carhome
npm run start:prod
```

另开一个 SSH 窗口检查：

```bash
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:3100/api/config
```

看到 `status: ok` 且 `photoroom.configured: true` 后，停止前台服务：

```bash
Ctrl + C
```

## 6. 创建运行用户

```bash
sudo useradd -r -s /usr/sbin/nologin www-data || true
sudo chown -R www-data:www-data /opt/carhome
```

## 7. 配置 systemd

```bash
sudo cp /opt/carhome/deploy/carhome.service /etc/systemd/system/carhome.service
sudo systemctl daemon-reload
sudo systemctl enable carhome
sudo systemctl start carhome
sudo systemctl status carhome
```

查看日志：

```bash
sudo journalctl -u carhome -f
```

重启服务：

```bash
sudo systemctl restart carhome
```

## 8. 配置 Nginx

```bash
sudo cp /opt/carhome/deploy/nginx.carhome.conf /etc/nginx/sites-available/carhome.conf
sudo nano /etc/nginx/sites-available/carhome.conf
```

把：

```nginx
server_name your-domain.example.com;
```

改成你的域名。

然后启用：

```bash
sudo ln -sf /etc/nginx/sites-available/carhome.conf /etc/nginx/sites-enabled/carhome.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 9. 配 HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
```

测试自动续期：

```bash
sudo certbot renew --dry-run
```

## 10. 上线后回归

```bash
curl https://your-domain.example.com/health
curl https://your-domain.example.com/api/config
```

浏览器检查：

- 首页可以打开
- 上传车图成功
- 商品图成功生成
- 下载 PNG 正常

## 11. 更新版本

```bash
cd /opt/carhome
git pull
sudo systemctl restart carhome
sudo systemctl status carhome
```

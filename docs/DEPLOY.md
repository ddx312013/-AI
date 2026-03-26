# Deployment Guide

这个版本适合团队内部使用，推荐三种部署方式：

- 方式 0：用 Render 直接托管，最适合你自己交付给运营团队
- 方式 A：直接用 Node.js 启动
- 方式 B：用 Docker 部署

如果你不想自己维护服务器，优先看 [docs/RENDER.md](./RENDER.md)。

## 1. 生产环境准备

要求：

- Node.js 18+
- 可用的 `PHOTOROOM_API_KEY`
- 可选的 `REMOVE_BG_API_KEY` 作为备用抠图 provider

先复制环境变量模板：

```bash
cd carhome
cp .env.example .env
```

至少需要配置：

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

## 2. Node.js 启动

开发机 / 云服务器直接跑：

```bash
cd carhome
npm run start:prod
```

健康检查：

```bash
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:3100/api/config
```

推荐配一个反向代理，例如 Nginx 或 Caddy，把外部域名代理到 `3100` 端口。

## 3. Docker 部署

构建镜像：

```bash
cd carhome
npm run docker:build
```

运行容器：

```bash
docker run --rm \
  -p 3100:3100 \
  --env-file .env \
  carhome:latest
```

如果你把生产配置写在 `.env.local`，也可以这样：

```bash
docker run --rm \
  -p 3100:3100 \
  --env-file .env.local \
  carhome:latest
```

## 4. 团队使用建议

- 统一走 `Photoroom` 生成商品图
- `remove.bg` 只作为备用 provider
- 团队成员只访问网页，不直接接触 key
- API key 只放在服务器 `.env` 中，不提交到仓库

## 5. 上线前检查清单

- `/health` 返回 `status: ok`
- `/api/config` 中 `photoroom.configured` 为 `true`
- 上传一张真实车图，验证：
  - 透明抠图正常
  - 商品图可生成
  - 下载 PNG 正常

## 6. 当前已知限制

- 商品图最终效果高度依赖上游抠图 / 商品图模型
- 若 `Photoroom` 返回的阴影风格不稳定，当前前端只做极轻量兜底，不建议再堆大量本地图像规则
- 单进程零依赖 HTTP 服务适合内部工具和轻量团队使用；高并发生产场景建议放在反向代理和进程守护器后面

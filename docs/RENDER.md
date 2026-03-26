# Render 部署指南

如果你想自己直接交付给运营团队使用，`Render` 是这套项目最省心的部署方式。

## 1. 准备代码仓库

先把项目推到 GitHub：

```bash
cd carhome
git add .
git commit -m "Prepare Render deployment"
git push origin main
```

如果你还不想提交全部内容，也至少保证以下文件在仓库里：

- `server.js`
- `package.json`
- `render.yaml`
- `public/`
- `lib/`

## 2. 在 Render 创建服务

登录 Render 后：

1. 点击 `New +`
2. 选择 `Blueprint`
3. 连接你的 GitHub 仓库
4. 选择当前项目仓库
5. Render 会自动识别根目录下的 `render.yaml`

这份 `render.yaml` 已经帮你预设好：

- Runtime: `Node`
- Start Command: `npm run start:prod`
- Health Check: `/health`
- 监听地址：`0.0.0.0`
- 端口：`10000`

## 3. 配环境变量

第一次创建时，至少要填：

```bash
PHOTOROOM_API_KEY=your_photoroom_api_key
```

可选备用：

```bash
REMOVE_BG_API_KEY=your_remove_bg_api_key
```

Render 会自动带上这些基础值：

```bash
HOST=0.0.0.0
NODE_ENV=production
PORT=10000
```

## 4. 部署完成后验证

部署完成后，Render 会给你一个公开网址，例如：

```text
https://carhome.onrender.com
```

用下面两个地址检查：

- `/health`
- `/api/config`

你应该确认：

- `status` 是 `ok`
- `photoroom.configured` 是 `true`

## 5. 给运营团队怎么用

部署成功后，你只需要把这个网址发给运营团队。

运营使用流程就是：

1. 打开网页
2. 上传单张汽车图片
3. 等待生成
4. 下载 PNG 成品图

他们不需要接触任何 API key，也不需要懂部署。

## 6. 后续更新

你以后只需要：

```bash
cd carhome
git add .
git commit -m "Update carhome"
git push origin main
```

如果 Render 开启了 `autoDeploy`，它会自动重新部署。

## 7. 推荐做法

- 正式团队使用时，优先只保留 `PHOTOROOM_API_KEY`
- `REMOVE_BG_API_KEY` 只作为备用
- 先用 Render 默认域名跑通，再考虑自定义域名
- 如果访问量上涨，再升级 Render 套餐

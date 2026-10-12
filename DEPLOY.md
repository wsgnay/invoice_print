# 纸间公网部署

推荐把工具部署到 `pdf.wsgnay.cn`，保留 `wsgnay.cn` 当前的根域名解析。应用、OCR 和 PDF 处理运行在服务器内；Caddy 负责 HTTPS 和反向代理。

如果服务器无法连接 Docker 官方镜像仓库，可使用 [Ubuntu 系统服务部署方案](DEPLOY_SYSTEMD.md)，通过 Python 虚拟环境、systemd、Nginx 和 Certbot 运行。

## 服务器建议

- 区域：无需立即办理 ICP 备案时选香港；主要用户都在中国大陆且希望更低延迟时，购买大陆服务器并先完成 ICP 备案。
- 系统：Ubuntu 24.04 LTS，64 位。
- 配置：MVP 建议 2 vCPU、4 GB 内存、20 GB 以上磁盘和独立公网 IPv4。批量扫描件 OCR 较多时选 4 vCPU、8 GB。
- 防火墙：开放 TCP 80、443；SSH 22 只允许自己的 IP 更稳妥。

## 第一次部署

1. 按 Docker 官方 Ubuntu 文档安装 Docker Engine 和 Compose 插件。
2. 把项目复制到服务器，例如 `/opt/paperdesk`。
3. 在项目目录创建环境配置：

   ```bash
   cp .env.example .env
   ```

4. 编辑 `.env`，保留 `DOMAIN=pdf.wsgnay.cn`，并把邮箱换成接收 HTTPS 证书通知的邮箱。
5. 在阿里云 DNS 为 `pdf` 添加 A 记录，记录值填服务器公网 IPv4。DNS 生效后再启动 Caddy，证书申请会更顺利。
6. 构建并启动：

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs -f --tail=100
   ```

7. 打开 `https://pdf.wsgnay.cn`。健康检查地址为 `https://pdf.wsgnay.cn/healthz`。

## 更新版本

把新代码同步到服务器后运行：

```bash
docker compose up -d --build
docker image prune -f
```

## 域名和代理注意事项

- Caddy 会自动申请和续期 HTTPS 证书，并把 HTTP 跳转到 HTTPS；服务器的 80 和 443 端口必须能从公网访问。
- 当前阿里云 DNS 可以直接使用，无需迁移域名。
- 如果以后把 DNS 迁到 Cloudflare，建议先使用“仅 DNS”模式。Cloudflare 代理存在请求体和超时限制，而当前应用一次导出可能重新上传多份原文件，合计上限为 150 MB；大量扫描件 OCR 也可能超过代理等待时间。
- 如果一定要启用 Cloudflare 代理，应把应用的单次请求限制降至对应套餐上限以下，并将长时间 OCR 改为后台任务。

## 上线前检查

- 这是一个可上传文件并执行 OCR 的 CPU 密集服务。若只供自己或团队使用，应增加访问认证，避免公网用户消耗服务器资源。
- 用户上传的发票包含财务和身份信息，应补充隐私说明、保留期限、日志脱敏和异常文件监控。当前应用不主动保存上传原件，但请求处理期间会占用内存或临时空间。
- PyMuPDF/MuPDF 提供 AGPL 和商业许可。公开提供服务前，需要选择符合项目发布方式的许可路径；闭源商业服务应先进行许可评估。
- 中国大陆服务器上线网站前需要办理 ICP 备案，并按要求在首页展示备案号。

## 常用排查

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 caddy
curl -I https://pdf.wsgnay.cn
```

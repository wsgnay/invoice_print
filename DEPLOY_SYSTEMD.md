# Ubuntu 系统服务部署

适用于无法访问 Docker 镜像仓库的 Ubuntu 服务器。应用只监听 `127.0.0.1:8000`，Nginx 对外提供 HTTPS，并用密码保护发票上传入口。

## 准备应用

```bash
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y git python3-venv libgl1 libglib2.0-0 nginx certbot python3-certbot-nginx apache2-utils
git clone https://github.com/wsgnay/invoice_print.git /opt/paperdesk
cd /opt/paperdesk
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
id paperdesk >/dev/null 2>&1 || useradd --system --home-dir /var/lib/paperdesk --shell /usr/sbin/nologin paperdesk
chown -R paperdesk:paperdesk /opt/paperdesk
install -m 0644 deploy/paperdesk.service /etc/systemd/system/paperdesk.service
systemctl daemon-reload
systemctl enable --now paperdesk.service
curl -fsS http://127.0.0.1:8000/healthz
```

内存只有 2 GB 的服务器可配置 2 GB 交换空间以缓解 OCR 峰值；并发较高时仍建议升级内存。

## 准备域名和 HTTP 验证

在 DNS 中把 `pdf.wsgnay.cn` 的 A 记录指向服务器公网 IPv4，并在云平台安全组开放 TCP 80、443。服务器内的防火墙也需允许这两个端口。

```bash
mkdir -p /var/www/letsencrypt
install -m 0644 /opt/paperdesk/deploy/nginx-http.conf /etc/nginx/sites-available/paperdesk
ln -sfn /etc/nginx/sites-available/paperdesk /etc/nginx/sites-enabled/paperdesk
test -L /etc/nginx/sites-enabled/default && unlink /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

此时网站仍返回 503，只开放证书签发所需的验证路径。

## 签发 HTTPS 并开放站点

确认 DNS 生效且公网可以访问 80 端口后执行。把邮箱替换成自己的地址；`htpasswd` 会交互式要求输入访问密码。

```bash
certbot certonly --webroot -w /var/www/letsencrypt -d pdf.wsgnay.cn --non-interactive --agree-tos --email you@example.com
htpasswd -c -B /etc/nginx/.paperdesk.htpasswd paperdesk
chmod 640 /etc/nginx/.paperdesk.htpasswd
chown root:www-data /etc/nginx/.paperdesk.htpasswd
install -m 0644 /opt/paperdesk/deploy/nginx-https.conf.example /etc/nginx/sites-available/paperdesk
nginx -t && systemctl reload nginx
```

在 `/etc/letsencrypt/renewal-hooks/deploy/` 添加可执行脚本，内容为 `#!/bin/sh` 和 `systemctl reload nginx`，确保证书续期后重新加载 Nginx。

访问 `https://pdf.wsgnay.cn`，输入用户名 `paperdesk` 和刚设置的密码。应用健康接口也受密码保护。

## 更新与排查

```bash
cd /opt/paperdesk
git pull --ff-only
.venv/bin/python -m pip install -r requirements.txt
systemctl restart paperdesk.service
systemctl status paperdesk.service
journalctl -u paperdesk.service -n 100 --no-pager
nginx -t
```

项目不保存上传原件，但处理中的发票会进入服务器内存或临时目录。正式开放前，应限制访问人员并按需要制定隐私和日志保留规则。

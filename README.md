# 台湾大老二联网版

这是一个零依赖 Node.js 网站，支持 3-4 人用浏览器实时联机玩台湾大老二。Windows 和 macOS 玩家只需要能打开网页，不需要安装客户端。

## 本机启动

Windows 可以双击：

```text
start-windows.bat
```

macOS 可以在终端运行：

```bash
sh start-macos.sh
```

也可以直接运行：

```bash
node server.js
```

默认端口是 `3000`。启动后打开：

```text
http://localhost:3000
```

## 同一 Wi-Fi / 局域网联机

启动服务器的电脑会在首页显示类似这样的地址：

```text
http://192.168.1.25:3000
```

其他 Windows 或 Mac 电脑只要在同一个 Wi-Fi/LAN，打开这个地址即可加入房间。

如果其他电脑打不开：

- 确认所有电脑在同一个网络。
- Windows 可能需要允许 Node.js 通过防火墙。
- macOS 可能需要在系统设置里允许传入连接。
- 不要把 `localhost` 发给别人；`localhost` 只代表各自自己的电脑。

## 公网联机

跨城市或不在同一个网络时，需要把这个项目部署到一台公网服务器，或支持 WebSocket 的平台。部署后玩家打开你的域名即可，例如：

```text
https://cards.example.com
```

前端会自动根据当前网页地址连接 WebSocket：

- HTTP 页面使用 `ws://`
- HTTPS 页面使用 `wss://`

如果你放在 Nginx、Caddy、Cloudflare Tunnel、反向代理或云服务器后面，要确保代理允许 WebSocket `Upgrade` 请求。

## 配置

可用环境变量：

```bash
PORT=3000 HOST=0.0.0.0 node server.js
```

- `PORT`：服务端口。
- `HOST`：监听地址。默认 `0.0.0.0`，表示允许局域网设备访问。

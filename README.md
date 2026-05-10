# Taiwan Big Two Multiplayer

A zero-dependency Node.js website for playing Taiwan Big Two with 3-4 players in real time.

Players on Windows, macOS, iPhone, Android, or any modern browser can join by opening the same website URL.

## Run Locally

Windows:

```text
start-windows.bat
```

macOS or Linux:

```bash
sh start-macos.sh
```

Or run Node directly:

```bash
node server.js
```

Then open:

```text
http://localhost:3000
```

## LAN Play

The home page displays network URLs such as:

```text
http://192.168.1.25:3000
```

Other computers on the same Wi-Fi or LAN can open that address and join the room.

If other devices cannot connect:

- Make sure all players are on the same network.
- Allow Node.js through Windows Firewall if prompted.
- On macOS, allow incoming network connections if prompted.
- Do not share `localhost` with other players. `localhost` only works on the server computer.

## Public Internet Play

For players outside the same network, deploy this project to a public server or a hosting platform that supports WebSocket connections.

The client automatically connects to the current site host:

- `http://` uses `ws://`
- `https://` uses `wss://`

If using a reverse proxy such as Nginx, Caddy, or Cloudflare Tunnel, make sure WebSocket upgrade requests are allowed.

## Configuration

```bash
PORT=3000 HOST=0.0.0.0 node server.js
```

- `PORT`: server port, default `3000`
- `HOST`: bind address, default `0.0.0.0` for LAN access

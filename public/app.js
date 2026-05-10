const state = {
  ws: null,
  game: null,
  selected: new Set()
};

const $ = (id) => document.getElementById(id);
const suitText = { C: "♣", D: "♦", H: "♥", S: "♠" };
const rankText = { J: "J", Q: "Q", K: "K", A: "A" };

function connect() {
  if (state.ws && state.ws.readyState <= 1) return state.ws;
  state.ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  state.ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      state.game = message.state;
      state.selected.clear();
      render();
    }
    if (message.type === "error") {
      $("status").textContent = message.message;
    }
  });
  return state.ws;
}

async function loadNetworkInfo() {
  try {
    const response = await fetch("/api/info", { cache: "no-store" });
    const info = await response.json();
    const links = info.urls.map((url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`).join("");
    $("networkUrls").innerHTML = `${links}<div>同一 Wi-Fi/LAN 的 Windows 或 Mac 电脑可打开局域网地址加入。正式公网部署时使用你的域名即可。</div>`;
  } catch {
    $("networkUrls").textContent = "无法检测地址；本机可使用 http://localhost:3000。";
  }
}

function send(payload) {
  const ws = connect();
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  else ws.addEventListener("open", () => ws.send(JSON.stringify(payload)), { once: true });
}

function cardLabel(card) {
  return `${suitText[card.suit]}${rankText[card.rank] || card.rank}`;
}

function cardNode(card) {
  const el = document.createElement("button");
  el.className = `card ${card.suit === "D" || card.suit === "H" ? "red" : ""} ${state.selected.has(card.id) ? "selected" : ""}`;
  el.textContent = cardLabel(card);
  el.title = card.id;
  el.addEventListener("click", () => {
    if (state.selected.has(card.id)) state.selected.delete(card.id);
    else state.selected.add(card.id);
    renderHand();
  });
  return el;
}

function renderCards(cards) {
  const wrap = document.createElement("div");
  wrap.className = "cards";
  cards.forEach((card) => wrap.appendChild(cardNode(card)));
  return wrap;
}

function renderPlayers() {
  const game = state.game;
  $("players").innerHTML = "";
  if (!game) return;
  game.players.forEach((player) => {
    const el = document.createElement("div");
    el.className = `player ${game.turn === player.id ? "active" : ""}`;
    const flags = [];
    if (player.roleLabel) flags.push(player.roleLabel);
    if (player.ready) flags.push("已准备");
    if (game.passed.includes(player.id)) flags.push("Pass");
    if (player.finishedRank) flags.push(`第 ${player.finishedRank} 名`);
    el.innerHTML = `
      <div class="player-name">${player.name}${player.connected ? "" : "（离线）"}</div>
      <div class="player-meta">${flags.join(" · ") || "等待"} · ${player.cardCount} 张</div>
    `;
    $("players").appendChild(el);
  });
}

function renderHand() {
  const game = state.game;
  $("hand").innerHTML = "";
  if (!game) return;
  game.hand.forEach((card) => $("hand").appendChild(cardNode(card)));
}

function render() {
  const game = state.game;
  $("lobby").hidden = Boolean(game);
  $("readyBtn").hidden = !game || !["lobby", "gameOver"].includes(game.phase);
  $("playBtn").hidden = !game || !["play", "exchange"].includes(game.phase);
  $("passBtn").hidden = !game || game.phase !== "play";
  $("roomCode").textContent = game ? `房间 ${game.roomId}` : "";
  $("status").textContent = game ? game.message : "建立房间或输入房间码加入。";

  renderPlayers();
  renderHand();

  if (!game) return;
  const last = $("lastPlay");
  last.innerHTML = "";
  if (game.lastPlay) {
    const label = document.createElement("div");
    label.textContent = `${game.lastPlay.playerName}：${game.lastPlay.label}`;
    last.appendChild(label);
    const cards = document.createElement("div");
    cards.className = "cards";
    game.lastPlay.cards.forEach((card) => {
      const el = document.createElement("div");
      el.className = `card ${card.suit === "D" || card.suit === "H" ? "red" : ""}`;
      el.textContent = cardLabel(card);
      cards.appendChild(el);
    });
    last.appendChild(cards);
  } else {
    last.textContent = game.phase === "exchange" ? "换牌阶段" : "新一轮，可任意出合法牌";
  }

  const myReturn = game.exchange?.myReturn;
  if (myReturn) {
    $("hint").textContent = `请选择 ${myReturn.count} 张牌还给对方。`;
    $("playBtn").textContent = "还牌";
  } else {
    $("hint").textContent = game.turn ? (game.players.find((p) => p.id === game.turn)?.name + " 的回合") : "你的手牌";
    $("playBtn").textContent = "出牌";
  }
  $("results").innerHTML = game.results ? game.results.map((item) => `第 ${item.rank} 名：${item.name}`).join("<br>") : "";
}

$("createBtn").addEventListener("click", () => send({ action: "create", name: $("nameInput").value }));
$("joinBtn").addEventListener("click", () => send({ action: "join", name: $("nameInput").value, roomId: $("roomInput").value }));
$("readyBtn").addEventListener("click", () => send({ action: "ready" }));
$("passBtn").addEventListener("click", () => send({ action: "pass" }));
$("playBtn").addEventListener("click", () => {
  const cards = [...state.selected];
  if (state.game?.exchange?.myReturn) send({ action: "returnTribute", cards });
  else send({ action: "play", cards });
});

connect();
loadNetworkInfo();

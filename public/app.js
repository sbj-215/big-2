const state = {
  ws: null,
  game: null,
  selected: new Set(),
  handOrder: []
};

const $ = (id) => document.getElementById(id);
const suitText = { C: "♣", D: "♦", H: "♥", S: "♠" };
const rankText = { J: "J", Q: "Q", K: "K", A: "A" };
const rankOrder = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const suitOrder = ["C", "D", "H", "S"];

function cardStrength(card) {
  return rankOrder.indexOf(card.rank) * 4 + suitOrder.indexOf(card.suit);
}

function connect() {
  if (state.ws && state.ws.readyState <= 1) return state.ws;
  state.ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  state.ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      state.game = message.state;
      syncHandOrder(message.state.hand);
      state.selected.clear();
      render();
    }
    if (message.type === "error") {
      $("status").textContent = message.message;
      renderActions();
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

function syncHandOrder(hand) {
  const known = new Set(hand.map((card) => card.id));
  const kept = state.handOrder.filter((id) => known.has(id));
  const newCards = hand.filter((card) => !kept.includes(card.id)).sort((a, b) => cardStrength(a) - cardStrength(b)).map((card) => card.id);
  state.handOrder = [...kept, ...newCards];
}

function orderedHand() {
  const hand = state.game?.hand || [];
  const byId = new Map(hand.map((card) => [card.id, card]));
  return state.handOrder.map((id) => byId.get(id)).filter(Boolean);
}

function sortHand() {
  state.handOrder = orderedHand().sort((a, b) => cardStrength(a) - cardStrength(b)).map((card) => card.id);
  renderHand();
}

function moveSelected(direction) {
  const ids = [...state.handOrder];
  if (direction < 0) {
    for (let i = 1; i < ids.length; i += 1) {
      if (state.selected.has(ids[i]) && !state.selected.has(ids[i - 1])) {
        [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      }
    }
  } else {
    for (let i = ids.length - 2; i >= 0; i -= 1) {
      if (state.selected.has(ids[i]) && !state.selected.has(ids[i + 1])) {
        [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
      }
    }
  }
  state.handOrder = ids;
  renderHand();
}

function cardLabel(card) {
  return `${suitText[card.suit]}${rankText[card.rank] || card.rank}`;
}

function cardNode(card, selectable = true) {
  const el = document.createElement(selectable ? "button" : "div");
  el.className = `card ${card.suit === "D" || card.suit === "H" ? "red" : ""} ${state.selected.has(card.id) ? "selected" : ""}`;
  el.textContent = cardLabel(card);
  el.title = card.id;
  if (selectable) {
    el.type = "button";
    el.addEventListener("click", () => {
      if (state.selected.has(card.id)) state.selected.delete(card.id);
      else state.selected.add(card.id);
      renderHand();
      renderActions();
    });
  }
  return el;
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
  orderedHand().forEach((card) => $("hand").appendChild(cardNode(card)));
  const hasSelection = state.selected.size > 0;
  $("moveLeftBtn").disabled = !hasSelection;
  $("moveRightBtn").disabled = !hasSelection;
  $("sortHandBtn").disabled = orderedHand().length < 2;
}

function renderLastPlay() {
  const game = state.game;
  const last = $("lastPlay");
  last.innerHTML = "";
  if (game.lastPlay) {
    const label = document.createElement("div");
    label.textContent = `${game.lastPlay.playerName}：${game.lastPlay.label}`;
    last.appendChild(label);
    const cards = document.createElement("div");
    cards.className = "cards";
    game.lastPlay.cards.forEach((card) => cards.appendChild(cardNode(card, false)));
    last.appendChild(cards);
  } else {
    last.textContent = game.phase === "exchange" ? "换牌阶段" : "新一轮，可任意出合法牌";
  }
}

function renderActions() {
  const game = state.game;
  const myReturn = game?.exchange?.myReturn;
  const isMyTurn = Boolean(game?.turn && game.turn === game.me);
  const hasPassed = Boolean(game?.passed?.includes(game.me));
  const canActInPlay = Boolean(game && game.phase === "play" && isMyTurn && !hasPassed);

  $("readyBtn").hidden = !game || !["lobby", "gameOver"].includes(game.phase);
  $("playBtn").hidden = !game || !((game.phase === "play" && canActInPlay) || myReturn);
  $("playBtn").disabled = Boolean(game && game.phase === "play" && !canActInPlay) || Boolean(myReturn && state.selected.size !== myReturn.count);
  $("passBtn").hidden = !game || game.phase !== "play" || !game.lastPlay || !canActInPlay;
  $("passBtn").disabled = !game || game.phase !== "play" || !game.lastPlay || !canActInPlay;

  if (myReturn) {
    $("hint").textContent = `请选择 ${myReturn.count} 张牌还给对方。`;
    $("playBtn").textContent = "还牌";
  } else if (hasPassed) {
    $("hint").textContent = "你本轮已经 Pass，等待下一轮。";
    $("playBtn").textContent = "出牌";
  } else if (game?.turn) {
    $("hint").textContent = `${game.players.find((p) => p.id === game.turn)?.name || "玩家"} 的回合`;
    $("playBtn").textContent = "出牌";
  } else {
    $("hint").textContent = "你的手牌";
    $("playBtn").textContent = "出牌";
  }

  if (game?.phase === "play" && !game.lastPlay && isMyTurn) {
    $("status").textContent = "新一轮拿到牌权的人必须出牌，不能 Pass。";
  }
}

function renderChat() {
  const log = $("chatLog");
  if (!log) return;
  log.innerHTML = "";
  const messages = state.game?.chat || [];
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "player-meta";
    empty.textContent = "还没有聊天消息。";
    log.appendChild(empty);
    return;
  }
  messages.forEach((message) => {
    const row = document.createElement("div");
    row.className = "chat-message";
    const name = document.createElement("span");
    name.className = "chat-name";
    name.textContent = message.name;
    const text = document.createElement("span");
    text.textContent = message.text;
    row.append(name, text);
    log.appendChild(row);
  });
  log.scrollTop = log.scrollHeight;
}

function render() {
  const game = state.game;
  $("lobby").hidden = Boolean(game);
  $("handTools").hidden = !game;
  $("roomCode").textContent = game ? `房间 ${game.roomId}` : "";
  $("status").textContent = game ? game.message : "建立房间或输入房间码加入。";

  renderPlayers();
  renderHand();

  if (!game) return;
  renderLastPlay();
  renderActions();
  renderChat();
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
$("moveLeftBtn").addEventListener("click", () => moveSelected(-1));
$("moveRightBtn").addEventListener("click", () => moveSelected(1));
$("sortHandBtn").addEventListener("click", sortHand);
$("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  send({ action: "chat", text });
  input.value = "";
});

connect();
loadNetworkInfo();

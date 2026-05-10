const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");

const SUITS = ["C", "D", "H", "S"];
const SUIT_LABEL = { C: "梅", D: "方", H: "红", S: "黑" };
const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index]));
const SUIT_VALUE = Object.fromEntries(SUITS.map((suit, index) => [suit, index]));
const ROLE_ORDER = ["bigPoor", "smallPoor", "smallRich", "bigRich"];
const ROLE_LABEL = {
  bigRich: "大富",
  smallRich: "小富",
  smallPoor: "小贫",
  bigPoor: "大贫"
};

const rooms = new Map();
const sockets = new Map();

function getNetworkUrls() {
  const urls = [`http://localhost:${PORT}`];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${PORT}`);
      }
    }
  }
  return [...new Set(urls)];
}

function makeId(length = 6) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length).toUpperCase();
}

function makeDeck() {
  return RANKS.flatMap((rank) => SUITS.map((suit) => ({ id: `${suit}${rank}`, rank, suit })));
}

function cardValue(card) {
  return RANK_VALUE[card.rank] * 4 + SUIT_VALUE[card.suit];
}

function sortCards(cards) {
  return [...cards].sort((a, b) => cardValue(a) - cardValue(b));
}

function shuffle(cards) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function findCard(cards, id) {
  return cards.find((card) => card.id === id);
}

function removeCards(hand, ids) {
  const want = new Set(ids);
  const removed = [];
  const next = [];
  for (const card of hand) {
    if (want.has(card.id)) {
      removed.push(card);
      want.delete(card.id);
    } else {
      next.push(card);
    }
  }
  if (want.size) return null;
  return { removed, next: sortCards(next) };
}

function countByRank(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  return counts;
}

function straightInfo(cards) {
  if (cards.length !== 5) return null;
  const ranks = [...new Set(cards.map((card) => card.rank))];
  if (ranks.length !== 5) return null;
  const key = ranks.slice().sort((a, b) => RANK_VALUE[a] - RANK_VALUE[b]).join(",");
  const sequences = [
    { key: "3,4,5,A,2", order: 0, keyRank: "A" },
    { key: "3,4,5,6,7", order: 1, keyRank: "7" },
    { key: "4,5,6,7,8", order: 2, keyRank: "8" },
    { key: "5,6,7,8,9", order: 3, keyRank: "9" },
    { key: "6,7,8,9,10", order: 4, keyRank: "10" },
    { key: "7,8,9,10,J", order: 5, keyRank: "J" },
    { key: "8,9,10,J,Q", order: 6, keyRank: "Q" },
    { key: "9,10,J,Q,K", order: 7, keyRank: "K" },
    { key: "10,J,Q,K,A", order: 8, keyRank: "A" },
    { key: "3,4,5,6,2", order: 9, keyRank: "2" }
  ];
  const found = sequences.find((seq) => seq.key === key);
  if (!found) return null;
  const keyCard = cards.filter((card) => card.rank === found.keyRank).sort((a, b) => SUIT_VALUE[b.suit] - SUIT_VALUE[a.suit])[0];
  return { order: found.order, keyRank: found.keyRank, keySuit: SUIT_VALUE[keyCard.suit] };
}

function classify(cards) {
  const sorted = sortCards(cards);
  const counts = countByRank(sorted);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || RANK_VALUE[b[0]] - RANK_VALUE[a[0]]);
  if (cards.length === 1) {
    return { kind: "single", size: 1, label: "单张", rank: RANK_VALUE[sorted[0].rank], suit: SUIT_VALUE[sorted[0].suit] };
  }
  if (cards.length === 2 && groups.length === 1) {
    return { kind: "pair", size: 2, label: "对子", rank: RANK_VALUE[groups[0][0]], suit: Math.max(...sorted.map((card) => SUIT_VALUE[card.suit])) };
  }
  const straight = straightInfo(sorted);
  const isFlush = sorted.every((card) => card.suit === sorted[0].suit);
  if (cards.length === 5 && straight && isFlush) {
    return { kind: "straightFlush", size: 5, label: "同花顺", suit: SUIT_VALUE[sorted[0].suit], order: straight.order, keySuit: straight.keySuit };
  }
  if (cards.length === 5 && groups.length === 2 && groups[0][1] === 3 && groups[1][1] === 2) {
    const tripleCards = sorted.filter((card) => card.rank === groups[0][0]);
    const pairCards = sorted.filter((card) => card.rank === groups[1][0]);
    return {
      kind: "fullHouse",
      size: 5,
      label: "葫芦",
      tripleRank: RANK_VALUE[groups[0][0]],
      tripleSuit: Math.max(...tripleCards.map((card) => SUIT_VALUE[card.suit])),
      pairRank: RANK_VALUE[groups[1][0]],
      pairSuit: Math.max(...pairCards.map((card) => SUIT_VALUE[card.suit]))
    };
  }
  if ((cards.length === 4 || cards.length === 5) && groups[0] && groups[0][1] === 4) {
    return { kind: "fourKind", size: cards.length, label: cards.length === 4 ? "铁支" : "铁支带牌", quadRank: RANK_VALUE[groups[0][0]] };
  }
  if (cards.length === 5 && straight) {
    return { kind: "straight", size: 5, label: "顺子", order: straight.order, keySuit: straight.keySuit };
  }
  return null;
}

function compareSameKind(a, b) {
  if (a.kind === "single" || a.kind === "pair") return (a.rank - b.rank) || (a.suit - b.suit);
  if (a.kind === "straight") return (a.order - b.order) || (a.keySuit - b.keySuit);
  if (a.kind === "fullHouse") return (a.tripleRank - b.tripleRank) || (a.tripleSuit - b.tripleSuit) || (a.pairRank - b.pairRank) || (a.pairSuit - b.pairSuit);
  if (a.kind === "fourKind") return a.quadRank - b.quadRank;
  if (a.kind === "straightFlush") return (a.suit - b.suit) || (a.order - b.order) || (a.keySuit - b.keySuit);
  return 0;
}

function canBeat(play, previous) {
  if (!previous) return true;
  if (play.kind === previous.kind) return compareSameKind(play, previous) > 0;
  if (play.kind === "fourKind" && (previous.kind === "straight" || previous.kind === "fullHouse")) return true;
  if (play.kind === "straightFlush" && ["straight", "fullHouse", "fourKind"].includes(previous.kind)) return true;
  return false;
}

function playerPublic(player) {
  return {
    id: player.id,
    name: player.name,
    ready: player.ready,
    connected: player.connected,
    cardCount: player.hand.length,
    role: player.role || null,
    roleLabel: player.role ? ROLE_LABEL[player.role] : null,
    finishedRank: player.finishedRank || null
  };
}

function viewFor(room, viewerId) {
  const viewer = room.players.find((player) => player.id === viewerId);
  return {
    roomId: room.id,
    phase: room.phase,
    mode: room.mode,
    message: room.message,
    players: room.players.map(playerPublic),
    hand: viewer ? sortCards(viewer.hand) : [],
    turn: room.turn,
    order: room.order,
    lastPlay: room.lastPlay ? {
      playerId: room.lastPlay.playerId,
      playerName: room.players.find((player) => player.id === room.lastPlay.playerId)?.name || "已离线玩家",
      cards: room.lastPlay.cards,
      label: room.lastPlay.combo.label
    } : null,
    passed: [...room.passed],
    finished: room.finished,
    exchange: room.exchange ? {
      awaiting: room.exchange.awaiting.map((item) => ({ richId: item.richId, poorId: item.poorId, count: item.count, done: item.done })),
      myReturn: room.exchange.awaiting.find((item) => item.richId === viewerId && !item.done) || null
    } : null,
    results: room.results || null
  };
}

function send(ws, payload) {
  if (ws.readyState === 1 || ws.writable) ws.send(JSON.stringify(payload));
}

function broadcast(room) {
  for (const player of room.players) {
    const ws = sockets.get(player.id);
    if (ws) send(ws, { type: "state", state: viewFor(room, player.id) });
  }
}

function nextActiveAfter(room, playerId) {
  const active = new Set(room.players.filter((player) => !player.finishedRank).map((player) => player.id));
  const order = room.order.length ? room.order : room.players.map((player) => player.id);
  const start = Math.max(0, order.indexOf(playerId));
  for (let step = 1; step <= order.length; step += 1) {
    const id = order[(start + step) % order.length];
    if (active.has(id)) return id;
  }
  return null;
}

function activePlayers(room) {
  return room.players.filter((player) => !player.finishedRank);
}

function finishNormalIfNeeded(room) {
  const active = activePlayers(room);
  if (active.length === 1) {
    active[0].finishedRank = room.finished.length + 1;
    room.finished.push({ playerId: active[0].id, name: active[0].name, rank: active[0].finishedRank });
    endGame(room);
  }
}

function endGame(room) {
  room.phase = "gameOver";
  room.turn = null;
  room.passed = new Set();
  room.results = room.finished.map((item) => ({ ...item }));
  if (room.players.length === 4) {
    const byRank = [...room.finished].sort((a, b) => a.rank - b.rank);
    const roleByRank = ["bigRich", "smallRich", "smallPoor", "bigPoor"];
    for (const player of room.players) {
      const rank = byRank.find((item) => item.playerId === player.id)?.rank;
      player.role = rank ? roleByRank[rank - 1] : null;
    }
    room.message = "本局结束，名次已决定下一局大富/大贫身份。";
  } else {
    room.message = "本局结束，下一局仍由梅花 3 先出。";
  }
}

function settlePovertyGame(room, winner) {
  winner.finishedRank = 1;
  const remaining = room.players.filter((player) => player.id !== winner.id);
  remaining.sort((a, b) => {
    if (a.hand.length !== b.hand.length) return a.hand.length - b.hand.length;
    const aMax = Math.max(...a.hand.map(cardValue));
    const bMax = Math.max(...b.hand.map(cardValue));
    return aMax - bMax;
  });
  room.finished = [{ playerId: winner.id, name: winner.name, rank: 1 }];
  remaining.forEach((player, index) => {
    player.finishedRank = index + 2;
    room.finished.push({ playerId: player.id, name: player.name, rank: player.finishedRank });
  });
  endGame(room);
}

function startTrick(room, starterId) {
  room.turn = starterId;
  room.lastPlay = null;
  room.passed = new Set();
}

function advanceAfterPlay(room, player) {
  if (room.mode === "poverty" && player.hand.length === 0) {
    settlePovertyGame(room, player);
    return;
  }
  if (player.hand.length === 0 && !player.finishedRank) {
    player.finishedRank = room.finished.length + 1;
    room.finished.push({ playerId: player.id, name: player.name, rank: player.finishedRank });
    finishNormalIfNeeded(room);
    if (room.phase === "gameOver") return;
  }
  room.turn = nextActiveAfter(room, player.id);
}

function advanceAfterPass(room, playerId) {
  const activeIds = activePlayers(room).map((player) => player.id);
  const challengerIds = activeIds.filter((id) => id !== room.lastPlay?.playerId);
  if (challengerIds.every((id) => room.passed.has(id))) {
    const starter = nextActiveAfter(room, room.lastPlay.playerId);
    startTrick(room, starter);
    return;
  }
  room.turn = nextActiveAfter(room, playerId);
  while (room.turn && room.passed.has(room.turn)) room.turn = nextActiveAfter(room, room.turn);
}

function deal(room) {
  const deck = shuffle(makeDeck());
  for (const player of room.players) {
    player.hand = [];
    player.finishedRank = null;
    player.ready = false;
  }
  room.finished = [];
  room.results = null;
  room.lastPlay = null;
  room.passed = new Set();

  if (room.players.length === 3) {
    for (let i = 0; i < 51; i += 1) room.players[i % 3].hand.push(deck[i]);
    const extra = deck[51];
    const club3Holder = room.players.find((player) => findCard(player.hand, "C3"));
    const target = club3Holder || room.players.find((player) => findCard(player.hand, "D3"));
    target.hand.push(extra);
    room.mode = "normal";
  } else {
    for (let i = 0; i < 52; i += 1) room.players[i % 4].hand.push(deck[i]);
    room.mode = room.players.every((player) => player.role) ? "poverty" : "normal";
  }
  for (const player of room.players) player.hand = sortCards(player.hand);
}

function beginPlay(room) {
  room.phase = "play";
  if (room.mode === "poverty") {
    const byRole = Object.fromEntries(room.players.map((player) => [player.role, player.id]));
    room.order = ROLE_ORDER.map((role) => byRole[role]).filter(Boolean);
    startTrick(room, byRole.bigPoor);
    room.message = "大贫先出，可任意出合法牌。";
  } else {
    room.order = room.players.map((player) => player.id);
    const starter = room.players.find((player) => findCard(player.hand, "C3"))?.id;
    startTrick(room, starter);
    room.mustContainClub3 = true;
    room.message = "梅花 3 先出，第一手必须包含梅花 3。";
  }
}

function startExchange(room) {
  const bigPoor = room.players.find((player) => player.role === "bigPoor");
  const bigRich = room.players.find((player) => player.role === "bigRich");
  const smallPoor = room.players.find((player) => player.role === "smallPoor");
  const smallRich = room.players.find((player) => player.role === "smallRich");
  const tribute = (poor, rich, count) => {
    const cards = sortCards(poor.hand).slice(-count);
    poor.hand = poor.hand.filter((card) => !cards.some((taken) => taken.id === card.id));
    rich.hand = sortCards([...rich.hand, ...cards]);
    return { poorId: poor.id, richId: rich.id, count, cards, done: false };
  };
  room.phase = "exchange";
  room.exchange = { awaiting: [tribute(bigPoor, bigRich, 2), tribute(smallPoor, smallRich, 1)] };
  room.message = "大贫/小贫已自动进贡最大牌，等待大富/小富选择还牌。";
}

function startHand(room) {
  deal(room);
  if (room.mode === "poverty") startExchange(room);
  else beginPlay(room);
}

function createRoom(name) {
  const room = {
    id: makeId(5),
    players: [],
    phase: "lobby",
    mode: "normal",
    order: [],
    turn: null,
    lastPlay: null,
    passed: new Set(),
    finished: [],
    message: "等待 3-4 位玩家加入并准备。"
  };
  rooms.set(room.id, room);
  return joinRoom(room.id, name);
}

function joinRoom(roomId, name) {
  const room = rooms.get(roomId);
  if (!room) throw new Error("找不到房间。");
  if (room.phase !== "lobby" && room.phase !== "gameOver") throw new Error("游戏已经开始。");
  if (room.players.length >= 4) throw new Error("房间已满。");
  const player = { id: makeId(8), name: String(name || "玩家").slice(0, 16), hand: [], ready: false, connected: true, role: null, finishedRank: null };
  room.players.push(player);
  return { room, player };
}

function handleAction(ws, payload) {
  try {
    const { action } = payload;
    if (action === "create") {
      const { room, player } = createRoom(payload.name);
      ws.playerId = player.id;
      ws.roomId = room.id;
      sockets.set(player.id, ws);
      broadcast(room);
      return;
    }
    if (action === "join") {
      const { room, player } = joinRoom(String(payload.roomId || "").toUpperCase(), payload.name);
      ws.playerId = player.id;
      ws.roomId = room.id;
      sockets.set(player.id, ws);
      broadcast(room);
      return;
    }
    const room = rooms.get(ws.roomId);
    const player = room?.players.find((item) => item.id === ws.playerId);
    if (!room || !player) throw new Error("尚未加入房间。");

    if (action === "ready") {
      player.ready = !player.ready;
      if ((room.phase === "lobby" || room.phase === "gameOver") && room.players.length >= 3 && room.players.every((item) => item.ready)) startHand(room);
      broadcast(room);
      return;
    }

    if (action === "returnTribute") {
      if (room.phase !== "exchange") throw new Error("现在不是还牌阶段。");
      const job = room.exchange.awaiting.find((item) => item.richId === player.id && !item.done);
      if (!job) throw new Error("你现在不需要还牌。");
      const ids = payload.cards || [];
      if (ids.length !== job.count) throw new Error(`请选择 ${job.count} 张牌。`);
      const removed = removeCards(player.hand, ids);
      if (!removed) throw new Error("选择的牌不在手牌中。");
      const poor = room.players.find((item) => item.id === job.poorId);
      player.hand = removed.next;
      poor.hand = sortCards([...poor.hand, ...removed.removed]);
      job.done = true;
      if (room.exchange.awaiting.every((item) => item.done)) {
        room.exchange = null;
        beginPlay(room);
      }
      broadcast(room);
      return;
    }

    if (action === "pass") {
      if (room.phase !== "play" || room.turn !== player.id) throw new Error("现在不是你的回合。");
      if (!room.lastPlay) throw new Error("新一轮必须出牌。");
      room.passed.add(player.id);
      advanceAfterPass(room, player.id);
      broadcast(room);
      return;
    }

    if (action === "play") {
      if (room.phase !== "play" || room.turn !== player.id) throw new Error("现在不是你的回合。");
      if (room.passed.has(player.id)) throw new Error("你这一轮已经 Pass，等下一轮才可出牌。");
      const ids = payload.cards || [];
      const removed = removeCards(player.hand, ids);
      if (!removed) throw new Error("选择的牌不在手牌中。");
      if (room.mustContainClub3 && !ids.includes("C3")) throw new Error("第一手必须包含梅花 3。");
      const combo = classify(removed.removed);
      if (!combo) throw new Error("这不是允许的牌型。");
      if (!canBeat(combo, room.lastPlay?.combo || null)) throw new Error("这手牌压不过上一手。");
      player.hand = removed.next;
      room.lastPlay = { playerId: player.id, cards: sortCards(removed.removed), combo };
      room.passed = new Set();
      room.mustContainClub3 = false;
      advanceAfterPlay(room, player);
      broadcast(room);
      return;
    }
  } catch (error) {
    send(ws, { type: "error", message: error.message });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (urlPath === "/api/info") {
    const body = JSON.stringify({
      port: PORT,
      host: HOST,
      urls: getNetworkUrls(),
      roomCount: rooms.size
    });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(body);
    return;
  }
  const filePath = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function decodeFrame(buffer) {
  const second = buffer[1];
  let length = second & 127;
  let offset = 2;
  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const data = buffer.subarray(offset, offset + length);
  for (let i = 0; i < data.length; i += 1) data[i] ^= mask[i % 4];
  return data.toString("utf8");
}

function encodeFrame(text) {
  const data = Buffer.from(text);
  const header = data.length < 126 ? Buffer.from([129, data.length]) : Buffer.from([129, 126, data.length >> 8, data.length & 255]);
  return Buffer.concat([header, data]);
}

const server = http.createServer(serveStatic);

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));
  socket.readyState = 1;
  socket.send = (text) => socket.write(encodeFrame(text));
  socket.on("data", (buffer) => {
    try {
      const message = JSON.parse(decodeFrame(Buffer.from(buffer)));
      handleAction(socket, message);
    } catch (error) {
      send(socket, { type: "error", message: "消息格式错误。" });
    }
  });
  socket.on("close", () => {
    const room = rooms.get(socket.roomId);
    const player = room?.players.find((item) => item.id === socket.playerId);
    if (player) {
      player.connected = false;
      sockets.delete(player.id);
      broadcast(room);
    }
  });
  socket.on("error", () => {
    const room = rooms.get(socket.roomId);
    const player = room?.players.find((item) => item.id === socket.playerId);
    if (player) {
      player.connected = false;
      sockets.delete(player.id);
      broadcast(room);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log("Dalaoer server running:");
  for (const url of getNetworkUrls()) console.log(`  ${url}`);
});

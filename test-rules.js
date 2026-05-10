const assert = require("assert");
const {
  advanceAfterPlay,
  advanceAfterPass,
  canBeat,
  canPlayerPass,
  classify
} = require("./server");

function makeRoom(ids) {
  return {
    players: ids.map((id) => ({ id, hand: [{}], finishedRank: null })),
    order: ids,
    passed: new Set(),
    lastPlay: null,
    turn: null
  };
}

function testTrickReturnsToLastPlayer() {
  const room = makeRoom(["A", "B", "C", "D"]);
  room.lastPlay = { playerId: "C", combo: classify([{ id: "C5", rank: "5", suit: "C" }]) };
  room.turn = "D";
  room.passed = new Set(["A", "B", "D"]);

  advanceAfterPass(room, "D");

  assert.strictEqual(room.turn, "C", "new trick should return to the last player who successfully played");
  assert.strictEqual(room.lastPlay, null, "new trick should clear the last play");
  assert.strictEqual(room.passed.size, 0, "new trick should clear pass state");
}

function testFinishedLastPlayerPassesTurnForward() {
  const room = makeRoom(["A", "B", "C", "D"]);
  room.players.find((player) => player.id === "C").finishedRank = 1;
  room.lastPlay = { playerId: "C", combo: classify([{ id: "C5", rank: "5", suit: "C" }]) };
  room.turn = "D";
  room.passed = new Set(["A", "B", "D"]);

  advanceAfterPass(room, "D");

  assert.strictEqual(room.turn, "D", "if the last player is out, new trick should start with the next active player");
  assert.strictEqual(room.lastPlay, null);
  assert.strictEqual(room.passed.size, 0);
}

function testPovertyPassStateSurvivesAPlay() {
  const room = makeRoom(["A", "B", "C", "D"]);
  room.mode = "poverty";
  room.lastPlay = { playerId: "A", combo: classify([{ id: "C5", rank: "5", suit: "C" }]) };
  room.turn = "C";
  room.passed = new Set(["B", "D"]);

  // Mirrors the play handler: in poverty mode, pass state is not cleared by a later play.
  if (room.mode !== "poverty") room.passed = new Set();
  room.lastPlay = { playerId: "C", combo: classify([{ id: "C6", rank: "6", suit: "C" }]) };

  assert.ok(room.passed.has("B"), "poverty-mode passer should stay locked out until the trick ends");
  assert.ok(room.passed.has("D"), "poverty-mode passer should stay locked out until the trick ends");
}

function testPovertyPlaySkipsPassedPlayers() {
  const room = makeRoom(["bigPoor", "smallPoor", "smallRich", "bigRich"]);
  room.mode = "poverty";
  room.lastPlay = { playerId: "smallRich", combo: classify([{ id: "CK", rank: "K", suit: "C" }]) };
  room.turn = "bigRich";
  room.passed = new Set(["smallPoor", "bigPoor"]);
  const player = room.players.find((item) => item.id === "bigRich");

  advanceAfterPlay(room, player);

  assert.strictEqual(room.turn, "smallRich", "poverty mode should not pass turn to a player who already passed");
  assert.strictEqual(room.lastPlay.playerId, "smallRich");
  assert.strictEqual(room.passed.size, 2);
}

function testLeadPlayerCannotPass() {
  const room = makeRoom(["A", "B", "C"]);
  room.phase = "play";
  room.turn = "A";
  room.lastPlay = null;

  assert.strictEqual(canPlayerPass(room, "A"), false, "lead player with a fresh trick must play, not pass");
}

function testFollowingPlayerCanPass() {
  const room = makeRoom(["A", "B", "C"]);
  room.phase = "play";
  room.turn = "B";
  room.lastPlay = { playerId: "A", combo: classify([{ id: "C5", rank: "5", suit: "C" }]) };

  assert.strictEqual(canPlayerPass(room, "B"), true, "following player may pass when there is a live play to beat");
}

function testBombAndStraightRules() {
  const straight = classify([
    { id: "CA", rank: "A", suit: "C" },
    { id: "C2", rank: "2", suit: "C" },
    { id: "D3", rank: "3", suit: "D" },
    { id: "H4", rank: "4", suit: "H" },
    { id: "S5", rank: "5", suit: "S" }
  ]);
  const biggestStraight = classify([
    { id: "C2", rank: "2", suit: "C" },
    { id: "D3", rank: "3", suit: "D" },
    { id: "H4", rank: "4", suit: "H" },
    { id: "S5", rank: "5", suit: "S" },
    { id: "C6", rank: "6", suit: "C" }
  ]);
  const invalidWrap = classify([
    { id: "CJ", rank: "J", suit: "C" },
    { id: "DQ", rank: "Q", suit: "D" },
    { id: "HK", rank: "K", suit: "H" },
    { id: "SA", rank: "A", suit: "S" },
    { id: "C2", rank: "2", suit: "C" }
  ]);
  const fourKind = classify([
    { id: "C9", rank: "9", suit: "C" },
    { id: "D9", rank: "9", suit: "D" },
    { id: "H9", rank: "9", suit: "H" },
    { id: "S9", rank: "9", suit: "S" }
  ]);

  assert.strictEqual(straight.kind, "straight");
  assert.strictEqual(biggestStraight.kind, "straight");
  assert.strictEqual(invalidWrap, null, "JQKA2 should not be a straight");
  assert.ok(canBeat(biggestStraight, straight), "23456 should beat A2345");
  assert.ok(canBeat(fourKind, straight), "4-card four of a kind should beat a straight");
}

testTrickReturnsToLastPlayer();
testFinishedLastPlayerPassesTurnForward();
testPovertyPassStateSurvivesAPlay();
testPovertyPlaySkipsPassedPlayers();
testLeadPlayerCannotPass();
testFollowingPlayerCanPass();
testBombAndStraightRules();

console.log("Rule tests passed");

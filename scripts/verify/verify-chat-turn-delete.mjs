#!/usr/bin/env node
/**
 * chat_turns 删除逻辑回归（纯内存模拟，不依赖 better-sqlite3 / Electron）。
 */

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL ${name}`);
    process.exit(1);
  }
  console.log(`OK ${name}`);
}

const cid = "char1";
const sid = "sess1";
/** @type {Array<{id:string, characterId:string, sessionId:string, role:string, content:string, createdAt:number}>} */
let rows = [];

function append(id, role, content, createdAt) {
  rows.push({ id, characterId: cid, sessionId: sid, role, content, createdAt });
}

function deleteTurn(turnId) {
  const before = rows.length;
  rows = rows.filter((r) => r.id !== turnId);
  return rows.length < before;
}

function deleteTurnsFrom(characterId, sessionId, turnId) {
  const row = rows.find((r) => r.id === turnId);
  if (!row) return false;
  rows = rows.filter(
    (r) =>
      !(
        r.characterId === characterId &&
        r.sessionId === sessionId &&
        r.createdAt >= row.createdAt
      )
  );
  return true;
}

function ids() {
  return rows
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => r.id)
    .join(",");
}

append("u1", "user", "hello", 100);
append("a1", "assistant", "hi", 200);
append("u2", "user", "again", 300);
append("a2", "assistant", "sure", 400);

assert("initial 4 turns", ids() === "u1,a1,u2,a2");
assert("deleteTurn removes one", deleteTurn("a1") === true);
assert("after deleteTurn", ids() === "u1,u2,a2");

deleteTurnsFrom(cid, sid, "u2");
assert("deleteTurnsFrom cascades", ids() === "u1");

append("u3", "user", "new", 500);
assert("deleteTurn missing id", deleteTurn("nope") === false);
assert("deleteTurnsFrom missing id", deleteTurnsFrom(cid, sid, "nope") === false);

console.log("verify-chat-turn-delete: all passed");

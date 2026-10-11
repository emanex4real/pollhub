const test = require("node:test");
const assert = require("node:assert");
const { parseVote } = require("./vote");

test("parses a valid vote", () => {
  assert.deepStrictEqual(parseVote('{"user_id":1,"option_id":2}'), { userId: 1, optionId: 2 });
});
test("rejects bad JSON", () => assert.strictEqual(parseVote("nope"), null));
test("rejects missing fields", () => assert.strictEqual(parseVote('{"user_id":1}'), null));

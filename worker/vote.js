// Turns a queue message into a vote, or null if it is malformed.
function parseVote(raw) {
  try {
    const { user_id, option_id } = JSON.parse(raw);
    if (!Number.isInteger(user_id) || !Number.isInteger(option_id)) return null;
    return { userId: user_id, optionId: option_id };
  } catch {
    return null;
  }
}
module.exports = { parseVote };

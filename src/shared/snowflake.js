'use strict';

// Discord-IDs ("Snowflakes") sind 17–20-stellige Zahlen als String.
const SNOWFLAKE_RE = /^\d{17,20}$/;

function isSnowflake(value) {
  return typeof value === 'string' && SNOWFLAKE_RE.test(value);
}

// Vergleich als BigInt, da IDs größer als Number.MAX_SAFE_INTEGER sind.
function compareSnowflakes(a, b) {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

module.exports = { isSnowflake, compareSnowflakes };

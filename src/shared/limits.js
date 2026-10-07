'use strict';

// Offizielle Discord-Limits (docs.discord.com/developers). Zentral, damit Main und Renderer dieselben Werte nutzen.
module.exports = Object.freeze({
  MESSAGE_CONTENT_MAX: 2000,
  MESSAGES_PER_FETCH_MAX: 100,
  ALLOWED_MENTIONS_IDS_MAX: 100,
  UPLOAD_MAX_BYTES: 25 * 1024 * 1024, // "maximum request size when sending a message is 25 MiB" (Doku, geprüft 07.10.2026)
  FILES_PER_MESSAGE_MAX: 10,
  EMBEDS_PER_MESSAGE_MAX: 10,
  EMBED_TOTAL_CHARS_MAX: 6000,
  GROUPING_WINDOW_MS: 5 * 60 * 1000,
  VIRTUALIZE_THRESHOLD: 200,
  TYPING_THROTTLE_MS: 8000,
});

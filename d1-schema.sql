DROP TABLE IF EXISTS anilist_user;
DROP TABLE IF EXISTS anilist_guild;
CREATE TABLE anilist_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id VARCHAR(255) NOT NULL,
  discord_guild_id VARCHAR(255) NOT NULL,
  anilist_id INTEGER NOT NULL,
  anilist_username VARCHAR(255) NOT NULL,
  UNIQUE(discord_id, discord_guild_id, anilist_id)
);
CREATE TABLE anilist_guild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_guild_id VARCHAR(255) NOT NULL,
  hentai BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_anilist_user_discord_id_discord_guild_id ON anilist_user (discord_guild_id, discord_id);
CREATE INDEX IF NOT EXISTS idx_anilist_guild_discord_guild_id ON anilist_guild (discord_guild_id);
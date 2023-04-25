import { Generated } from 'kysely';

export interface UserTable {
  id: Generated<number>;
  discord_id: string;
  discord_guild_id: string;
  anilist_id: number;
  anilist_username: string;
}

export interface AnimeAiringScheduleTable {
  id: Generated<number>;
  discord_guild_id: string;
  discord_user_id: string;
  media_id: number;
}

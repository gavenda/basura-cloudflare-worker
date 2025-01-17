import { Media, MediaFormat, MediaList, MediaListStatus, MediaRankType, MediaType } from '@anilist/gql/types';
import { findMedia, findMediaTitles, findScoreByUsersAndMedias } from '@anilist/media';
import { Env } from '@env/env';
import { App, CommandHandler, Page, handlePaginatorComponents, paginator } from '@studio-bogus/discord-interaction-app';
import {
  ApplicationCommandContext,
  AutocompleteContext,
  ComponentContext,
  SlashCommandContext
} from '@studio-bogus/discord-interaction-app/context';
import { mediaFormatDisplay, toStars } from '@util/anilist';
import { EMBED_DESCRIPTION_LIMIT, EMBED_FIELD_LIMIT } from '@util/discord';
import { appendIfNotMax, htmlToMarkdown, titleCase, truncate } from '@util/strings';
import { APIApplicationCommandOptionChoice, APIEmbed, APIEmbedField } from 'discord-api-types/v10';
import { decode } from 'he';

export class FindCommand implements CommandHandler<SlashCommandContext> {
  ephemeral: boolean = false;
  async handle(context: SlashCommandContext): Promise<void> {
    const query = context.getRequiredString(`query`);
    await handleFindMedia(context, query);
  }

  async handleAutocomplete(context: AutocompleteContext): Promise<APIApplicationCommandOptionChoice[]> {
    return await handleMediaTitleAutocomplete(context);
  }

  async handleComponent(context: ComponentContext): Promise<void> {
    await handlePaginatorComponents(context);
  }
}

export const handleMediaTitleAutocomplete = async (
  context: AutocompleteContext,
  type?: MediaType
): Promise<APIApplicationCommandOptionChoice[]> => {
  // Grab hentai setting
  let hentai = false;

  if (context.guildId) {
    const db = context.app.env<Env>().DB;
    const result = await db
      .selectFrom(`anilist_guild`)
      .where(`discord_guild_id`, '=', context.guildId)
      .selectAll()
      .executeTakeFirst();
    hentai = result?.hentai || false;
  }

  const query = context.getRequiredString(`query`);
  const titles = await findMediaTitles(query, type, hentai);

  return titles
    .filter((value, index, array) => array.indexOf(value) === index)
    .map((x) => {
      return {
        name: truncate(x, 100),
        value: truncate(x, 100)
      };
    });
};

export const handleFindMedia = async (
  context: ApplicationCommandContext,
  query: string,
  type?: MediaType
): Promise<void> => {
  // Grab hentai setting
  let hentai = false;

  if (context.guildId) {
    const db = context.app.env<Env>().DB;
    const result = await db
      .selectFrom(`anilist_guild`)
      .where(`discord_guild_id`, '=', context.guildId)
      .selectAll()
      .executeTakeFirst();
    hentai = result?.hentai || false;
  }

  const medias = await findMedia(query, type, hentai);

  if (medias === undefined || medias.length === 0) {
    await context.reply({
      message: `No matching anime/manga media found.`
    });
    return;
  }

  await sendMediaEmbed(context, medias);
};

export const sendMediaEmbed = async (context: ApplicationCommandContext, medias: Media[]) => {
  const mediaIds = medias.map((x) => x.id);
  const mediaList = await lookupMediaList(context.app, mediaIds, context.guildId);
  const userIds = mediaList?.map((x) => x.userId);
  const nameMap = await mapNameToDiscordName(context.app, userIds);

  const pages: Page[] = [];
  let pageNumber = 1;
  const pageMax = medias.length;

  for (const media of medias) {
    pages.push({
      embed: createMediaEmbed({
        media,
        mediaList,
        nameMap,
        pageNumber,
        pageMax
      }),
      link: {
        label: 'View on AniList',
        url: media.siteUrl!
      }
    });
    pageNumber = pageNumber + 1;
  }

  await paginator({ context, pages });
};

const createMediaEmbed = (options: {
  media: Media;
  mediaList?: MediaList[];
  nameMap: Record<number, string>;
  pageNumber: number;
  pageMax: number;
}): APIEmbed => {
  const { media, mediaList, nameMap, pageNumber, pageMax } = options;

  const mediaFormat = media.format && mediaFormatDisplay(media.format);
  const season = media.season ? titleCase(media.season) : '-';
  const seasonYear = media.seasonYear && media.seasonYear != 0 ? media.seasonYear : '-';
  const score = media.meanScore && media.meanScore != 0 ? toStars(media.meanScore) : '-';
  const episodes = media.episodes && media.episodes != 0 ? `${media.episodes}` : '-';
  const episodicFormats = [MediaFormat.ONA, MediaFormat.OVA, MediaFormat.TV, MediaFormat.SPECIAL];

  let duration = media.duration && media.duration != 0 ? `${media.duration} minutes` : '-';

  // Add 'per episode' for TV, OVA, ONA and Specials.
  if (media.format && duration != '-' && episodicFormats.includes(media.format)) {
    duration += ' per episode';
  }

  // Description operations
  let description = '';

  if (media.title?.romaji && media.title.english) {
    description = description + `_(Romaji: ${media.title.romaji})_\n`;
  }
  if (media.title?.native) {
    description = description + `_(Native: ${media.title.native})_\n`;
  }

  for (const title of media.synonyms || []) {
    description = description + `_(Synonym: ${title})_\n`;
  }

  description = description + '\n';
  // Replace all double line breaks.
  description = description + htmlToMarkdown(media.description || '');
  description = decode(description);
  description = truncate(description, EMBED_DESCRIPTION_LIMIT);
  description = description.trim();

  // Author operations
  let author = `ID#${media.id}`;

  const mediaRankAscending = media.rankings?.sort((a, b) => a.rank - b.rank);
  const allTimeRank = mediaRankAscending?.find((x) => x.type === MediaRankType.RATED && x.allTime);
  const seasonRank = mediaRankAscending?.find((x) => x.type === MediaRankType.RATED && !x.allTime && x.season);

  if (allTimeRank != null) {
    author = author + ` • `;
    author = author + `Rank #${allTimeRank.rank} (${mediaFormat})`;
  }
  if (seasonRank != null && seasonRank.season) {
    if (allTimeRank != null) {
      author = author + ` • `;
    }
    author = author + `Rank #${seasonRank.rank} (${mediaFormat}) of ${titleCase(seasonRank.season)} ${seasonRank.year}`;
  }

  const fields: APIEmbedField[] = [];

  // First row

  if (media.type) {
    fields.push({
      name: `Type`,
      value: titleCase(media.type),
      inline: true
    });
  }

  if (media.status) {
    fields.push({
      name: `Status`,
      value: titleCase(media.status),
      inline: true
    });
  }

  if (season == '-' && seasonYear == '-') {
    fields.push({
      name: `Season`,
      value: `?`,
      inline: true
    });
  } else {
    fields.push({
      name: `Season`,
      value: `${season} ${seasonYear}`,
      inline: true
    });
  }

  // Second row
  fields.push({
    name: `Rating`,
    value: media.meanScore ? `${score} (${media.meanScore})` : `-`,
    inline: true
  });
  fields.push({
    name: `Popularity`,
    value: `${media.popularity}`,
    inline: true
  });
  fields.push({
    name: `Favorites`,
    value: `${media.favourites}`,
    inline: true
  });

  // Third row
  fields.push({
    name: `Episodes`,
    value: episodes,
    inline: true
  });
  fields.push({
    name: `Duration`,
    value: duration,
    inline: true
  });

  if (media.format) {
    fields.push({
      name: `Format`,
      value: mediaFormatDisplay(media.format),
      inline: true
    });
  }

  // Fourth row
  if (media.genres && media.genres.length > 0) {
    fields.push({
      name: `Genres`,
      value: media.genres.map((x) => `\`${x}\``).join(` - `),
      inline: false
    });
  }

  // User statuses operations
  let completed = '';
  let planned = '';
  let inProgress = '';
  let paused = '';
  let dropped = '';
  let notOnList = '';
  let repeating = '';

  const mediaListFiltered = mediaList
    ?.filter((mediaList) => mediaList.mediaId === media.id)
    .map((mediaList) => {
      return {
        discordName: nameMap[mediaList.userId],
        status: mediaList.status,
        score: mediaList.score,
        progress: mediaList.progress
      };
    });
  const mediaListSorted = mediaListFiltered?.sort(
    (a, b) => (a.progress || 0) - (b.progress || 0) || a.discordName.localeCompare(b.discordName)
  );

  if (mediaListSorted) {
    for (const embedMedia of mediaListSorted) {
      const scoreStr = embedMedia.score === 0 ? 'Unrated' : `${embedMedia.score}`;
      const score = embedMedia.score && embedMedia.score > 0 ? `${toStars(embedMedia.score)} (Score: ${scoreStr})` : '';
      const progress = `[Progress: ${embedMedia.progress}]`;

      switch (embedMedia.status) {
        case MediaListStatus.COMPLETED: {
          completed = appendIfNotMax(completed, `- ${embedMedia.discordName} ‣ ${score}\n`, EMBED_FIELD_LIMIT);
          break;
        }
        case MediaListStatus.CURRENT: {
          inProgress = appendIfNotMax(
            inProgress,
            `- ${embedMedia.discordName} ‣ ${score} ${progress}\n`,
            EMBED_FIELD_LIMIT
          );
          break;
        }
        case MediaListStatus.DROPPED: {
          dropped = appendIfNotMax(dropped, `- ${embedMedia.discordName} ‣ ${score} ${progress}\n`, EMBED_FIELD_LIMIT);
          break;
        }
        case MediaListStatus.PAUSED: {
          paused = appendIfNotMax(paused, `- ${embedMedia.discordName} ‣ ${score} ${progress}\n`, EMBED_FIELD_LIMIT);
          break;
        }
        case MediaListStatus.PLANNING: {
          planned = appendIfNotMax(planned, `- ${embedMedia.discordName}\n`, EMBED_FIELD_LIMIT);
          break;
        }
        case MediaListStatus.REPEATING: {
          repeating = appendIfNotMax(
            repeating,
            `- ${embedMedia.discordName} ‣ ${score} ${progress}\n`,
            EMBED_FIELD_LIMIT
          );
          break;
        }
        default: {
          notOnList = appendIfNotMax(notOnList, `- ${embedMedia.discordName}\n`, EMBED_FIELD_LIMIT);
          break;
        }
      }
    }
  }

  // User scores
  if (paused) {
    fields.push({
      name: `Paused`,
      value: paused,
      inline: false
    });
  }

  if (inProgress) {
    fields.push({
      name: `In Progress`,
      value: inProgress,
      inline: false
    });
  }

  if (repeating) {
    fields.push({
      name: `Rewatching`,
      value: repeating,
      inline: false
    });
  }

  if (completed) {
    fields.push({
      name: `Completed`,
      value: completed,
      inline: false
    });
  }

  if (dropped) {
    fields.push({
      name: `Dropped`,
      value: dropped,
      inline: false
    });
  }

  if (planned) {
    fields.push({
      name: `Planned`,
      value: planned,
      inline: false
    });
  }

  if (notOnList) {
    fields.push({
      name: `Not On List`,
      value: notOnList,
      inline: false
    });
  }

  const embed: APIEmbed = {
    author: {
      name: author
    },
    title: media.title?.english ?? media.title?.romaji,
    description,
    thumbnail: {
      url: media.coverImage?.extraLarge ?? ''
    },
    color: 16711680,
    footer: {
      text: `Page ${pageNumber} / ${pageMax}`
    },
    fields
  };

  if (media.bannerImage) {
    embed.image = {
      url: media.bannerImage
    };
  }

  return embed;
};

const mapNameToDiscordName = async (app: App, userIds: number[] = []): Promise<Record<number, string>> => {
  if (userIds.length === 0) {
    return {};
  }

  const db = app.env<Env>().DB;
  const result = await db.selectFrom(`anilist_user`).where(`anilist_id`, `in`, userIds).selectAll().execute();
  const nameMap: Record<number, string> = {};

  for (const row of result) {
    nameMap[row.anilist_id] = `<@${row.discord_id}>`;
  }

  return nameMap;
};

const lookupMediaList = async (
  app: App,
  mediaIds: number[],
  guildId: string = '-1'
): Promise<MediaList[] | undefined> => {
  const db = app.env<Env>().DB;
  const result = await db.selectFrom(`anilist_user`).where(`discord_guild_id`, `=`, guildId).selectAll().execute();
  const userIds = result.map((x) => x.anilist_id);
  return findScoreByUsersAndMedias(userIds, mediaIds);
};

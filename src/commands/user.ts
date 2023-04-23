import { MediaFormat, MediaListStatus, User, UserGenreStatistic, UserTagStatistic } from '@anilist/gql/types.js';
import { findUserName, findUserStatisticsByName } from '@anilist/user.js';
import { CommandHandler } from '@app/command.js';
import { AutocompleteContext } from '@app/context/autocomplete-context.js';
import { SlashCommandContext } from '@app/context/slash-command-context.js';
import { APIApplicationCommandOptionChoice, APIEmbed, APIEmbedField } from 'discord-api-types/v10';
import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions';
import { distinctByKey, toIntColor, trimIndent } from './util.js';

export class UserCommand implements CommandHandler<SlashCommandContext> {
  ephemeral: boolean = false;
  async handle(context: SlashCommandContext): Promise<void> {
    const username = context.getStringOption(`username`).value;
    const user = await findUserStatisticsByName(username);

    if (user === undefined) {
      await context.edit({
        message: `User not found.`,
      });
      return;
    }
    if (user.statistics === undefined) {
      await context.edit({
        message: `Statistics not found for this user.`,
      });
      return;
    }

    await context.edit({
      message: [createUserEmbed(user)],
      components: [
        {
          type: MessageComponentTypes.ACTION_ROW,
          components: [
            {
              type: MessageComponentTypes.BUTTON,
              style: ButtonStyleTypes.LINK,
              label: `Profile`,
              url: user.siteUrl,
            },
            {
              type: MessageComponentTypes.BUTTON,
              style: ButtonStyleTypes.LINK,
              label: `Anime List`,
              url: `${user.siteUrl}/animelist`,
            },
            {
              type: MessageComponentTypes.BUTTON,
              style: ButtonStyleTypes.LINK,
              label: `Manga List`,
              url: `${user.siteUrl}/mangalist`,
            },
            {
              type: MessageComponentTypes.BUTTON,
              style: ButtonStyleTypes.LINK,
              label: `Stats`,
              url: `${user.siteUrl}/stats/anime/overview`,
            },
          ],
        },
      ],
    });
  }

  async handleAutocomplete(context: AutocompleteContext): Promise<APIApplicationCommandOptionChoice[]> {
    const username = context.getStringOption(`username`).value;
    const names = await findUserName(username);

    return names.map((x) => {
      return {
        name: x,
        value: x,
      };
    });
  }
}

interface TopStats {
  name: string;
  count: number;
  meanScore: number;
}

const createUserEmbed = (user: User): APIEmbed => {
  const fields: APIEmbedField[] = [];
  const statistics = user.statistics;
  // Minutes
  const watchDurationSeconds = Math.floor((statistics?.anime?.minutesWatched || 0) * 60);
  const daysWatched = Math.floor(watchDurationSeconds / (3600 * 24));
  const hoursWatched = Math.floor((watchDurationSeconds % (3600 * 24)) / 3600);
  const minutesWatched = Math.floor((watchDurationSeconds % 3600) / 60);
  // Genres
  const mangaGenres = statistics?.manga?.genres || [];
  const animeGenres = statistics?.anime?.genres || [];
  const genres = [...mangaGenres, ...animeGenres];
  // Tags
  const mangaTags = statistics?.manga?.tags || [];
  const animeTags = statistics?.anime?.tags || [];
  const tags = [...mangaTags, ...animeTags];

  const genresByMean: TopStats[] = distinctByKey<UserGenreStatistic>(genres, 'genre').map((stats) => {
    const anime = statistics?.anime?.genres?.find((x) => x.genre === stats.genre);
    const manga = statistics?.manga?.genres?.find((x) => x.genre === stats.genre);

    if (anime && manga) {
      // Calculate mean score of both groups
      const count = anime.count + manga.count;
      const meanScore = (anime.meanScore * anime.count + manga.meanScore * manga.count) / count;
      return {
        name: anime.genre || 'Unknown',
        count: count,
        meanScore: Math.ceil(meanScore),
      };
    }

    const animeOrManga = anime ?? manga;

    if (!animeOrManga) {
      throw new Error(`Both anime and manga are null, data error from AniList?`);
    }
    return {
      name: animeOrManga.genre || 'Unknown',
      count: animeOrManga.count,
      meanScore: animeOrManga.meanScore,
    };
  });

  const tagsByMean: TopStats[] = distinctByKey<UserTagStatistic>(tags, 'tag.name').map((stats) => {
    const anime = statistics?.anime?.tags?.find((x) => x.tag?.name === stats.tag?.name);
    const manga = statistics?.manga?.tags?.find((x) => x.tag?.name === stats.tag?.name);

    if (anime && manga) {
      // Calculate mean score of both groups
      const count = anime.count + manga.count;
      const meanScore = (anime.meanScore * anime.count + manga.meanScore * manga.count) / count;
      return {
        name: anime.tag?.name || 'Unknown',
        count: count,
        meanScore: Math.ceil(meanScore),
      };
    }

    const animeOrManga = anime ?? manga;

    if (!animeOrManga) {
      throw new Error(`Both anime and manga are null, data error from AniList?`);
    }
    return {
      name: animeOrManga.tag?.name || 'Unknown',
      count: animeOrManga.count,
      meanScore: animeOrManga.meanScore,
    };
  });

  // Release years
  const mangaReleaseYears = statistics?.manga?.releaseYears || [];
  const animeReleaseYears = statistics?.anime?.releaseYears || [];
  const releaseYears = [...mangaReleaseYears, ...animeReleaseYears];
  // Start years
  const mangaStartYears = statistics?.manga?.startYears || [];
  const animeStartYears = statistics?.anime?.startYears || [];
  const startYears = [...mangaStartYears, ...animeStartYears];
  // Statuses
  const mangaStatuses = statistics?.manga?.statuses || [];
  const animeStatuses = statistics?.anime?.statuses || [];
  const statuses = [...mangaStatuses, ...animeStatuses];
  // Formats
  const mangaFormats = statistics?.manga?.formats || [];
  const animeFormats = statistics?.anime?.formats || [];
  const formats = [...mangaFormats, ...animeFormats];

  const animeStats = `
		- Total: **${statistics?.anime?.count}**
		- Episodes: **${statistics?.anime?.episodesWatched}**
		- Time: **${daysWatched}** days, **${hoursWatched} hours**, **${minutesWatched}** minutes
		- Mean Score: **${statistics?.anime?.meanScore}**
	`;

  fields.push({
    name: `Anime`,
    value: trimIndent(animeStats).trim(),
    inline: false,
  });

  const mangaStats = `
		- Total: **${statistics?.manga?.count}**
		- Volumes: **${statistics?.manga?.volumesRead}**
		- Chapters: **${statistics?.manga?.chaptersRead}**
		- Mean Score: **${statistics?.manga?.meanScore}**
	`;

  fields.push({
    name: `Manga`,
    value: trimIndent(mangaStats).trim(),
    inline: false,
  });

  // Generate weab tendencies
  let weabTendencies = '';

  if (releaseYears) {
    weabTendencies += `- Loves **${releaseYears[0].releaseYear}** media.\n`;
  }

  if (animeStartYears) {
    weabTendencies += `- Started consuming weabness in **${animeStartYears[0].startYear}**.\n`;
  }

  if (mangaStartYears) {
    weabTendencies += `- Started consuming trash in **${mangaStartYears[0].startYear}**.\n`;
  }

  if (formats && formats[0].format != MediaFormat.TV) {
    weabTendencies += `- Addicted to the **${formats[0].format}** format.\n`;
  }

  if (statuses) {
    const total = statuses.filter((x) => x.status != MediaListStatus.PLANNING).reduce((sum, current) => sum + current.count, 0);

    const completed = statuses.filter((x) => x.status === MediaListStatus.COMPLETED || x.status === MediaListStatus.REPEATING).reduce((sum, current) => sum + current.count, 0);

    const dropped = statuses.filter((x) => x.status != MediaListStatus.DROPPED).reduce((sum, current) => sum + current.count, 0);

    const completedRatio = (completed / total) * 100;
    const completedRatioStr = completedRatio.toFixed(2);

    if (dropped == 0) {
      weabTendencies += `- Has **never** dropped an anime/manga!\n`;
    }

    weabTendencies += `- Ends up completing **${completedRatioStr}%**.\n`;

    if (statuses[0].status == MediaListStatus.PLANNING) {
      weabTendencies += `- Apparently thinks PLANNING > WATCHING...\n`;
    }
  }

  if (weabTendencies) {
    fields.push({
      name: `Weab Tendencies`,
      value: weabTendencies,
      inline: false,
    });
  }

  if (genres.length >= 3) {
    const worseGenre = genresByMean.filter((x) => x.meanScore > 0).reduce((prev, curr) => (prev.meanScore < curr.meanScore ? prev : curr));
    const s1 = genresByMean[0];
    const s2 = genresByMean[1];
    const s3 = genresByMean[2];

    const topGenres = `
			- ${s1.name} (Score: ${s1.meanScore}, Count: ${s1.count})
			- ${s2.name} (Score: ${s2.meanScore}, Count: ${s2.count})
			- ${s3.name} (Score: ${s3.meanScore}, Count: ${s3.count})
		`;

    fields.push({
      name: `Top Genres`,
      value: trimIndent(topGenres).trim(),
      inline: false,
    });

    fields.push({
      name: `Most Hated Genre`,
      value: `- ${worseGenre.name} (Score: ${worseGenre.meanScore}, Count: ${worseGenre.count})`,
      inline: false,
    });

    let genreStats = '';
    const maxAnimeGenre = statistics?.anime?.genres?.reduce((prev, curr) => (prev.minutesWatched > curr.minutesWatched ? prev : curr));
    const maxMangaGenre = statistics?.manga?.genres?.reduce((prev, curr) => (prev.chaptersRead > curr.chaptersRead ? prev : curr));

    if (maxAnimeGenre) {
      genreStats += `- Wasted **${maxAnimeGenre.minutesWatched}** minutes on **${maxAnimeGenre.genre}**.\n`;
    }

    if (maxMangaGenre) {
      genreStats += `- Wasted **${maxMangaGenre.chaptersRead}** minutes on **${maxMangaGenre.genre}**.\n`;
    }

    if (genreStats) {
      fields.push({
        name: `Genre Stats`,
        value: genreStats,
        inline: false,
      });
    }
  }

  if (tags.length >= 3) {
    const worseTag = tagsByMean.filter((x) => x.meanScore > 0).reduce((prev, curr) => (prev.meanScore < curr.meanScore ? prev : curr));
    const s1 = tagsByMean[0];
    const s2 = tagsByMean[1];
    const s3 = tagsByMean[2];

    const topTags = `
			- ${s1.name} (Score: ${s1.meanScore}, Count: ${s1.count})
			- ${s2.name} (Score: ${s2.meanScore}, Count: ${s2.count})
			- ${s3.name} (Score: ${s3.meanScore}, Count: ${s3.count})
		`;

    fields.push({
      name: `Top Tags`,
      value: trimIndent(topTags).trim(),
      inline: false,
    });

    fields.push({
      name: `Most Hated Tag`,
      value: `
			- ${worseTag.name} (Score: ${worseTag.meanScore}, Count: ${worseTag.count})
			`.trim(),
      inline: false,
    });

    let tagStats = '';
    const maxAnimeTag = statistics?.anime?.tags?.reduce((prev, curr) => (prev.minutesWatched > curr.minutesWatched ? prev : curr));
    const maxMangaTag = statistics?.manga?.tags?.reduce((prev, curr) => (prev.chaptersRead > curr.chaptersRead ? prev : curr));

    if (maxAnimeTag) {
      tagStats += `- Wasted **${maxAnimeTag.minutesWatched}** minutes on **${maxAnimeTag.tag?.name}**.\n`;
    }

    if (maxMangaTag) {
      tagStats += `- Wasted **${maxMangaTag.chaptersRead}** minutes on **${maxMangaTag.tag?.name}**.\n`;
    }

    if (tagStats) {
      fields.push({
        name: `Tag Stats`,
        value: tagStats,
        inline: false,
      });
    }
  }

  let description = user.about || '';
  description = description.replaceAll('~!', '').replaceAll('!~', '').replaceAll('~~~', '');

  return {
    author: {
      name: `ID#${user.id}`,
    },
    title: user.name,
    description,
    image: {
      url: user.bannerImage || '',
    },
    thumbnail: {
      url: user.avatar?.large || '',
    },
    fields,
    color: toIntColor(user.options?.profileColor || 'black'),
    footer: {
      text: `Note: These are merely statistics based on user data and may not be accurate.`,
    },
  };
};

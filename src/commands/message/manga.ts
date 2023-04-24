import { MediaType } from '@anilist/gql/types.js';
import { CommandHandler } from '@app/command.js';
import { ComponentContext } from '@app/context/component-context.js';
import { MessageCommandContext } from '@app/context/message-command-context.js';
import { handlePaginatorComponents } from '@app/paginator.js';
import { handleFindMedia } from '../find.js';

export class FindMangaMessageCommand implements CommandHandler<MessageCommandContext> {
  ephemeral: boolean = true;
  async handle(context: MessageCommandContext): Promise<void> {
    const query = context.message.content;
    await handleFindMedia(context, query, MediaType.MANGA);
  }

  async handleComponent(context: ComponentContext): Promise<void> {
    await handlePaginatorComponents(context);
  }
}
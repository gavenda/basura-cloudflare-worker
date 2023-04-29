import { CommandHandler } from '@app/command.js';
import { SlashCommandContext } from '@app/context/slash-command-context.js';
import { Env, KVWebhook } from '@env/env';
import { APIWebhook, ChannelType, Routes } from 'discord-api-types/v10';

export class BindCommand implements CommandHandler<SlashCommandContext> {
  ephemeral: boolean = true;
  async handle(context: SlashCommandContext): Promise<void> {
    const channel = context.getRequiredChannel('channel');

    const kv = context.app.env<Env>().NOTIFICATION;

    const key = `notification:anime-airing:webhook:${context.guildId}`;
    // Check if webhook exists
    const exists = await kv.get<KVWebhook>(key, 'json');
    if (exists) {
      await context.edit({
        message: `Notifications is already bound to a channel!`,
      });
      return;
    }
    try {
      const channelId = channel.type === (ChannelType.PublicThread || ChannelType.PrivateThread) && channel.parent_id ? channel.parent_id : channel.id;
      const threadId = ChannelType.PublicThread || ChannelType.PrivateThread ? channel.id : '';

      // Create webhook
      const webhook = await context.app.rest.post<APIWebhook>(Routes.channelWebhooks(channelId), {
        body: {
          name: `Anime Airing Notifications`,
        },
      });

      await kv.put(
        key,
        JSON.stringify({
          id: webhook.id,
          threadId,
          token: webhook.token,
        })
      );

      await context.edit({
        message: `Notifications now bound to <#${channel.id}>.`,
      });
    } catch (err) {
      console.error(err);
      await context.edit({
        message: `I need the \`Manage Webhooks\` permission to be able to send notifications.`,
      });
    }
  }
}

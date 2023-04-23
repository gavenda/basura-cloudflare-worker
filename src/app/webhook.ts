import { Client } from '@client/client.js';
import { APIEmbed, APIMessage, MessageFlags, RESTPostAPIInteractionFollowupJSONBody, Routes, Snowflake } from 'discord-api-types/v10';
import { MessageComponent } from 'discord-interactions';

const toFollowUp = (message: string | APIEmbed[], components: any[], ephemeral: boolean): RESTPostAPIInteractionFollowupJSONBody => {
  const body: RESTPostAPIInteractionFollowupJSONBody = {
    components,
  };

  if (typeof message === 'string') {
    body.content = message;
  } else {
    body.embeds = message;
  }

  if (ephemeral) {
    body.flags = MessageFlags.Ephemeral;
  }

  return body;
};

export class Webhook {
  private id: Snowflake;
  private token: string;
  private rest: Client;

  constructor(client: Client, id: Snowflake, token: string) {
    this.id = id;
    this.token = token;
    this.rest = client;
  }

  async followUp(message: string | APIEmbed[], components: MessageComponent[] = [], ephemeral: boolean = false): Promise<APIMessage> {
    return this.rest.post<APIMessage>(Routes.webhook(this.id, this.token), {
      auth: false,
      body: toFollowUp(message, components, ephemeral),
    });
  }

  async edit(message: string | APIEmbed[], messageId: string, components: MessageComponent[] = [], ephemeral: boolean = false): Promise<APIMessage> {
    return this.rest.patch<APIMessage>(Routes.webhookMessage(this.id, this.token, messageId), {
      auth: false,
      body: toFollowUp(message, components, ephemeral),
    });
  }

  async delete(id: Snowflake): Promise<void> {
    await this.rest.delete(Routes.webhookMessage(this.id, this.token, id), { auth: false });
  }
}

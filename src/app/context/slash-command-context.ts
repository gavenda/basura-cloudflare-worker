import {
  APIApplicationCommandInteractionDataAttachmentOption,
  APIApplicationCommandInteractionDataBasicOption,
  APIApplicationCommandInteractionDataBooleanOption,
  APIApplicationCommandInteractionDataChannelOption,
  APIApplicationCommandInteractionDataMentionableOption,
  APIApplicationCommandInteractionDataNumberOption,
  APIApplicationCommandInteractionDataRoleOption,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandInteractionDataUserOption,
  APIAttachment,
  APIChatInputApplicationCommandInteraction,
  APIInteractionDataResolved,
  APIInteractionDataResolvedChannel,
  APIInteractionDataResolvedGuildMember,
  APIRole,
  APIUser,
} from 'discord-api-types/v10';
import { MessageComponent, MessageComponentTypes } from 'discord-interactions';
import { v4 as uuidv4 } from 'uuid';
import { App } from '../app.js';
import { InteractionContext } from './interaction-context.js';

export class SlashCommandContext extends InteractionContext {
  command: string;
  private options = new Map<string, APIApplicationCommandInteractionDataBasicOption>();

  resolved: Required<APIInteractionDataResolved> = {
    users: {},
    members: {},
    roles: {},
    channels: {},
    attachments: {},
  };

  constructor(app: App, interaction: APIChatInputApplicationCommandInteraction) {
    super(app, interaction);

    if (interaction.data.resolved) {
      Object.assign(this.resolved, interaction.data.resolved);
    }

    this.command = interaction.data.name;
    this.parseOptions(interaction.data.options as APIApplicationCommandInteractionDataBasicOption[]);
  }

  async createComponent<T extends MessageComponent>(options: { id: string; component: T; data?: any }): Promise<T> {
    if (options.component.type != MessageComponentTypes.ACTION_ROW) {
      const uniqueId = uuidv4();
      options.component.custom_id = `${this.command}:${options.id}:${uniqueId}`;
      if (options.data) {
        // Only put data if its not null, otherwise it would be pointless
        await this.app.componentCache.put(options.component.custom_id, options.data);
      }
      return options.component;
    }
    throw new Error(`Cannot create action row components!`);
  }

  private parseOptions(options: APIApplicationCommandInteractionDataBasicOption[] = []): void {
    for (const option of options) {
      this.options.set(option.name, option);
    }
  }

  getString(name: string): string | undefined {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataStringOption | undefined;
    if (option !== undefined) {
      return option.value;
    }
  }

  getRequiredString(name: string): string {
    return this.getStringOption(name).value;
  }

  getStringOption(name: string): APIApplicationCommandInteractionDataStringOption {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataStringOption | undefined;
    if (option === undefined) {
      throw new Error(`String option ${name} does not exist.`);
    }
    return option;
  }

  getInteger(name: string): number | undefined {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataNumberOption | undefined;
    if (option !== undefined) {
      return option.value;
    }
  }

  getRequiredInteger(name: string): number {
    return this.getIntegerOption(name).value;
  }

  getIntegerOption(name: string): APIApplicationCommandInteractionDataNumberOption {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataNumberOption | undefined;
    if (option === undefined) {
      throw new Error(`Integer option ${name} does not exist.`);
    }
    return option;
  }

  getBoolean(name: string): boolean | undefined {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataBooleanOption | undefined;
    if (option !== undefined) {
      return option.value;
    }
  }

  getRequiredBoolean(name: string): boolean {
    return this.getBooleanOption(name).value;
  }

  getBooleanOption(name: string): APIApplicationCommandInteractionDataBooleanOption {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataBooleanOption | undefined;
    if (option === undefined) {
      throw new Error(`Boolean option ${name} does not exist.`);
    }
    return option;
  }

  getUserOption(name: string): APIApplicationCommandInteractionDataUserOption & {
    user: APIUser;
    member?: APIInteractionDataResolvedGuildMember;
  } {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataUserOption | undefined;
    if (option === undefined) {
      throw new Error(`User option ${name} does not exist.`);
    }
    const user = this.resolved.users[option.value];
    if (user === undefined) {
      throw new Error(`Resolved user not found.`);
    }
    const member = this.resolved.members[option.value];

    return { user, member, ...option };
  }

  getChannelOption(name: string): APIApplicationCommandInteractionDataChannelOption & { channel: APIInteractionDataResolvedChannel } {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataChannelOption | undefined;
    if (option === undefined) {
      throw new Error(`Channel option ${name} does not exist.`);
    }
    const channel = this.resolved.channels[option.value];
    if (channel === undefined) {
      throw new Error(`Resolved channel not found.`);
    }
    return { channel, ...option };
  }

  getRoleOption(name: string): APIApplicationCommandInteractionDataRoleOption & { role: APIRole } {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataRoleOption | undefined;
    if (option === undefined) {
      throw new Error(`Role option ${name} does not exist.`);
    }
    const role = this.resolved.roles[option.value];
    if (role === undefined) {
      throw new Error(`Resolved role not found.`);
    }
    return { role, ...option };
  }

  getMentionableOption(name: string): APIApplicationCommandInteractionDataMentionableOption & { user?: APIUser; role?: APIRole } {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataMentionableOption | undefined;
    if (option === undefined) {
      throw new Error(`Mentionable option ${name} does not exist.`);
    }
    const user = this.resolved.users[option.value];
    const role = this.resolved.roles[option.value];

    return { user, role, ...option };
  }

  getNumber(name: string): number | undefined {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataNumberOption | undefined;
    if (option !== undefined) {
      return option.value;
    }
  }

  getRequiredNumber(name: string): number {
    return this.getNumberOption(name).value;
  }

  getNumberOption(name: string): APIApplicationCommandInteractionDataNumberOption {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataNumberOption | undefined;
    if (option === undefined) {
      throw new Error(`Number option ${name} does not exist.`);
    }
    return { ...option };
  }

  getAttachmentOption(name: string): APIApplicationCommandInteractionDataAttachmentOption & { attachment: APIAttachment } {
    const option = this.options.get(name) as APIApplicationCommandInteractionDataAttachmentOption | undefined;
    if (option === undefined) {
      throw new Error(`Attachment option ${name} does not exist.`);
    }
    const attachment = this.resolved.attachments[option.value];
    if (attachment === undefined) {
      throw new Error(`Resolved attachment not found.`);
    }
    return { attachment, ...option };
  }
}

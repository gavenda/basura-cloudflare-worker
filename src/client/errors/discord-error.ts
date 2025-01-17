export type ErrorBody = DiscordErrorBody | OAuthErrorBody;

export interface OAuthErrorBody {
  error: string;
  error_description?: string;
}

export interface DiscordErrorBody {
  code: number;
  message: string;
  errors?: APIError;
}

export interface ErrorGroup {
  _errors: APIError[];
}

export interface ErrorField {
  code: string;
  message: string;
}

export type APIError = ErrorGroup | ErrorField | { [k: string]: APIError } | string;

export function isDiscordError(error: ErrorBody): error is DiscordErrorBody {
  return 'code' in error;
}

export function isErrorGroup(error: APIError): error is ErrorGroup {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  return '_errors' in error;
}

export function isErrorField(error: APIError): error is ErrorField {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  return 'message' in error;
}

export function getMessage(error: ErrorBody) {
  if (isDiscordError(error)) {
    const stack: string[] = [];

    if (error.message) {
      stack.push(error.message);
    }

    if (error.errors) {
      stack.push(...Array.from(parse(error.errors)));
    }

    if (stack.length > 0) {
      return stack.join('\n');
    }

    return 'Unknown Error';
  }

  return error.error_description ?? 'No Description';
}

function* parse(value: APIError, key: string | null = null): IterableIterator<string> {
  // Handle leaf fields
  if (isErrorField(value)) {
    const prefix = key != null ? `${key}[${value.code}]` : `${value.code}`;
    return yield `${prefix}: ${value.message.trim()}`;
  }

  // Handle nested fields
  for (const entry of Object.entries(value)) {
    const label = entry[0];
    const item = entry[1] as string | APIError;
    const nextKey = getNextKey(key, label);

    if (typeof item === 'string') {
      yield item;
    } else if (isErrorGroup(item)) {
      for (const error of item._errors) {
        yield* parse(error, nextKey);
      }
    } else {
      yield* parse(item, nextKey);
    }
  }
}

function getNextKey(key: string | null, label: string) {
  if (label.startsWith('_')) {
    return key;
  }

  if (key != null) {
    if (Number.isNaN(Number(label))) {
      return `${key}.${label}`;
    }

    return `${key}[${label}]`;
  }

  return label;
}

export class DiscordError extends Error {
  code: string | number;
  raw: ErrorBody;

  constructor(code: string | number, raw: ErrorBody) {
    super(getMessage(raw));

    this.code = code;
    this.raw = raw;
  }

  get name() {
    return `${DiscordError.name}[${this.code}]`;
  }
}

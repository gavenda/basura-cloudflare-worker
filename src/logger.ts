export type LogLevel = 'error' | 'warn' | 'info' | 'trace' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
}

export interface Transport {
  log(entry: LogEntry, obj?: any): void;
}

export class Logger {
  transports: Transport[];

  constructor(options: { transports: Transport[] }) {
    this.transports = options.transports;
  }

  log(level: LogLevel, msg: any, obj?: any) {
    let message: string;

    if (typeof msg === 'string') {
      message = msg;
    } else {
      message = JSON.stringify(msg);
    }

    this.transports.forEach((t) => t.log({ level, message }, obj));
  }

  error(err: any, obj?: any) {
    this.log('error', err, obj);
  }

  info(err: any, obj?: any) {
    this.log('info', err, obj);
  }

  verbose(err: any, obj?: any) {
    this.log('trace', err, obj);
  }

  trace(err: any, obj?: any) {
    this.log('trace', err, obj);
  }

  add(transport: Transport) {
    this.transports.push(transport);
  }
}

export class ConsoleTransport implements Transport {
  log(entry: LogEntry): void {
    switch (entry.level) {
      case 'info':
        console.info(entry.message);
        break;
      case 'debug':
        console.debug(entry.message);
        break;
      case 'trace':
        console.trace(entry.message);
        break;
      case 'warn':
        console.warn(entry.message);
        break;
      case 'error':
        console.error(entry.message);
        break;
      default:
        console.log(entry.message);
    }
  }
}

export const logger = new Logger({
  transports: [new ConsoleTransport()],
});

const LOGTAIL_REMOTE = `https://in.logtail.com`;

export class LogtailTransport implements Transport {
  context: ExecutionContext;
  token: string;

  constructor(token: string, context: ExecutionContext) {
    this.token = token;
    this.context = context;
  }

  log(entry: LogEntry, obj?: any) {
    this.context.passThroughOnException();
    this.context.waitUntil(
      fetch(LOGTAIL_REMOTE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          level: entry.level,
          message: entry.message,
          ...obj,
        }),
      })
    );
  }
}

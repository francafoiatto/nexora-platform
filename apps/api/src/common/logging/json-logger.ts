import { ConsoleLogger, type LogLevel } from '@nestjs/common';

/** Minimal structured logger: one JSON object per line, suitable for any log collector. */
export class JsonLogger extends ConsoleLogger {
  protected override printMessages(messages: unknown[], context = '', logLevel: LogLevel = 'log', writeStreamType?: 'stdout' | 'stderr') {
    for (const message of messages) {
      const entry = {
        time: new Date().toISOString(),
        level: logLevel,
        context,
        message: message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message),
      };
      process[writeStreamType ?? 'stdout'].write(`${JSON.stringify(entry)}\n`);
    }
  }

  protected override printStackTrace(stack: string) {
    if (stack) process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', stack })}\n`);
  }
}

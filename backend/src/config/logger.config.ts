import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

export function createWinstonConfig(logLevel: string, logDir: string): WinstonModuleOptions {
  const { combine, timestamp, errors, json, colorize, printf } = winston.format;

  const consoleFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp: ts, context, trace, ...meta }) => {
      let msg = `[${ts}] [${level}]`;
      if (context) msg += ` [${context}]`;
      msg += ` ${message}`;
      if (Object.keys(meta).length > 0) msg += ` ${JSON.stringify(meta)}`;
      if (trace) msg += `\n${trace}`;
      return msg;
    }),
  );

  const fileFormat = combine(timestamp(), errors({ stack: true }), json());

  return {
    transports: [
      new winston.transports.Console({
        level: logLevel,
        format: consoleFormat,
      }),
      new (winston.transports as any).DailyRotateFile({
        level: logLevel,
        dirname: logDir,
        filename: 'application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '50m',
        maxFiles: '30d',
        format: fileFormat,
      }),
      new (winston.transports as any).DailyRotateFile({
        level: 'error',
        dirname: logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '50m',
        maxFiles: '90d',
        format: fileFormat,
      }),
    ],
  };
}

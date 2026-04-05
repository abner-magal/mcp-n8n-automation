export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}
export interface LoggerConfig {
    level: LogLevel;
    prefix?: string;
    timestamp?: boolean;
}
export declare class Logger {
    private config;
    private static instance;
    private useFileLogging;
    private fileStream;
    private readonly isStdio;
    private readonly isDisabled;
    private readonly isHttp;
    private readonly isTest;
    constructor(config?: Partial<LoggerConfig>);
    static getInstance(config?: Partial<LoggerConfig>): Logger;
    private formatMessage;
    private log;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    setLevel(level: LogLevel): void;
    static parseLogLevel(level: string): LogLevel;
}
export declare const logger: Logger;
export declare function sanitizeRequestData(url: string | undefined, data: unknown): unknown;
//# sourceMappingURL=logger.d.ts.map
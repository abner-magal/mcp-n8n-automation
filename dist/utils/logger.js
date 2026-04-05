"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.LogLevel = void 0;
exports.sanitizeRequestData = sanitizeRequestData;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(config) {
        this.useFileLogging = false;
        this.fileStream = null;
        this.isStdio = process.env.MCP_MODE === 'stdio';
        this.isDisabled = process.env.DISABLE_CONSOLE_OUTPUT === 'true';
        this.isHttp = process.env.MCP_MODE === 'http';
        this.isTest = process.env.NODE_ENV === 'test' || process.env.TEST_ENVIRONMENT === 'true';
        this.config = {
            level: LogLevel.INFO,
            prefix: 'n8n-mcp',
            timestamp: true,
            ...config,
        };
    }
    static getInstance(config) {
        if (!Logger.instance) {
            Logger.instance = new Logger(config);
        }
        return Logger.instance;
    }
    formatMessage(level, message) {
        const parts = [];
        if (this.config.timestamp) {
            parts.push(`[${new Date().toISOString()}]`);
        }
        if (this.config.prefix) {
            parts.push(`[${this.config.prefix}]`);
        }
        parts.push(`[${level}]`);
        parts.push(message);
        return parts.join(' ');
    }
    log(level, levelName, message, ...args) {
        const allowErrorLogs = level === LogLevel.ERROR && (this.isHttp || process.env.DEBUG === 'true');
        if (this.isStdio || this.isDisabled || (this.isTest && process.env.DEBUG !== 'true')) {
            if (!allowErrorLogs) {
                return;
            }
        }
        if (level <= this.config.level || allowErrorLogs) {
            const formattedMessage = this.formatMessage(levelName, message);
            if (this.isHttp && process.env.MCP_REQUEST_ACTIVE === 'true' && !allowErrorLogs) {
                return;
            }
            switch (level) {
                case LogLevel.ERROR:
                    console.error(formattedMessage, ...args);
                    break;
                case LogLevel.WARN:
                    console.warn(formattedMessage, ...args);
                    break;
                default:
                    console.log(formattedMessage, ...args);
            }
        }
    }
    error(message, ...args) {
        this.log(LogLevel.ERROR, 'ERROR', message, ...args);
    }
    warn(message, ...args) {
        this.log(LogLevel.WARN, 'WARN', message, ...args);
    }
    info(message, ...args) {
        this.log(LogLevel.INFO, 'INFO', message, ...args);
    }
    debug(message, ...args) {
        this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
    }
    setLevel(level) {
        this.config.level = level;
    }
    static parseLogLevel(level) {
        switch (level.toLowerCase()) {
            case 'error':
                return LogLevel.ERROR;
            case 'warn':
                return LogLevel.WARN;
            case 'debug':
                return LogLevel.DEBUG;
            case 'info':
            default:
                return LogLevel.INFO;
        }
    }
}
exports.Logger = Logger;
exports.logger = Logger.getInstance({
    level: Logger.parseLogLevel(process.env.LOG_LEVEL || 'info'),
});
function sanitizeRequestData(url, data) {
    if (!url || !data || typeof data !== 'object')
        return data;
    if (url.includes('/credentials') && data.data) {
        const d = data;
        return { ...d, data: '[REDACTED - credential secrets]' };
    }
    return data;
}
//# sourceMappingURL=logger.js.map
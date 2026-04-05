"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getN8nApiConfig = getN8nApiConfig;
exports.isN8nApiConfigured = isN8nApiConfigured;
exports.getN8nApiConfigFromContext = getN8nApiConfigFromContext;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
const n8nApiConfigSchema = zod_1.z.object({
    N8N_API_URL: zod_1.z.string().url().optional(),
    N8N_API_KEY: zod_1.z.string().optional(),
    N8N_API_TIMEOUT: zod_1.z.coerce.number().positive().default(30000),
    N8N_API_MAX_RETRIES: zod_1.z.coerce.number().positive().default(3),
});
let envLoaded = false;
function getN8nApiConfig() {
    if (!envLoaded) {
        dotenv_1.default.config();
        envLoaded = true;
    }
    const result = n8nApiConfigSchema.safeParse(process.env);
    if (!result.success) {
        return null;
    }
    const config = result.data;
    if (!config.N8N_API_URL) {
        return null;
    }
    return {
        baseUrl: config.N8N_API_URL,
        apiKey: config.N8N_API_KEY || '',
        timeout: config.N8N_API_TIMEOUT,
        maxRetries: config.N8N_API_MAX_RETRIES,
    };
}
function isN8nApiConfigured() {
    const config = getN8nApiConfig();
    return config !== null;
}
function getN8nApiConfigFromContext(context) {
    if (!context.n8nApiUrl) {
        return null;
    }
    return {
        baseUrl: context.n8nApiUrl,
        apiKey: context.n8nApiKey ?? '',
        timeout: context.n8nApiTimeout ?? 30000,
        maxRetries: context.n8nApiMaxRetries ?? 3,
    };
}
//# sourceMappingURL=n8n-api.js.map
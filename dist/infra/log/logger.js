import pino from "pino";
const loggerOptions = process.env.NODE_ENV === "production"
    ? { level: process.env.LOG_LEVEL || "info" }
    : {
        level: process.env.LOG_LEVEL || "info",
        transport: {
            target: "pino-pretty",
            options: { colorize: true, singleLine: true }
        }
    };
export const logger = pino(loggerOptions);
//# sourceMappingURL=logger.js.map
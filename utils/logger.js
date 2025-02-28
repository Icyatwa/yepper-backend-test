// utils/logger.js
const createLogger = (module) => {
    return {
      info: (message, data) => {
        console.log(`[INFO][${module}] ${message}`, data || '');
      },
      error: (message, error) => {
        console.error(`[ERROR][${module}] ${message}`, error || '');
      },
      warn: (message, data) => {
        console.warn(`[WARN][${module}] ${message}`, data || '');
      }
    };
  };
  
  module.exports = { createLogger };
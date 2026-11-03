import rateLimit from 'express-rate-limit';
import { error } from '../utils/response.js';

// Shared JSON body when a client hits the limit
function limitHandler(_req, res) {
  return error(res, 'Too many requests. Please try again later.', 429, 'RATE_LIMITED');
}

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Local POS is not behind a reverse proxy
  validate: { xForwardedForHeader: false },
  handler: limitHandler,
});

// Auth endpoints — slow brute-force on login / unlock / setup login
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: limitHandler,
});

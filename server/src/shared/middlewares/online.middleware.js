import config from '../../config/index.js';

export function isRequestOnline(req) {
  const header = req.headers['x-network-status'];
  if (header === 'offline') {
    return false;
  }
  if (header === 'online') {
    return true;
  }
  return config.isOnline;
}

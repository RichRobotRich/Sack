import { base44 } from '@/api/base44Client';

// Cached bridge days list
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function getBridgeDays() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  try {
    const days = await base44.entities.BridgeDay.list();
    _cache = new Set(days.map(d => d.date));
    _cacheTime = now;
    return _cache;
  } catch {
    return new Set();
  }
}

export function isBridgeDay(dateStr, bridgeDaySet) {
  if (!bridgeDaySet) return false;
  return bridgeDaySet.has(dateStr);
}

export function invalidateBridgeDayCache() {
  _cache = null;
}
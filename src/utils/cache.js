/**
 * Simple in-memory cache with TTL support
 */

class Cache {
  constructor(ttlMinutes = 5) {
    this.cache = new Map();
    this.ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Generate a cache key from name and tag
   * @param {string} name
   * @param {string} tag
   * @param {string} region
   * @returns {string}
   */
  generateKey(name, tag, region = 'na') {
    return `${name.toLowerCase()}#${tag.toUpperCase()}@${region}`;
  }

  /**
   * Set a value in cache
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    const expiry = Date.now() + this.ttl;
    this.cache.set(key, { value, expiry });
  }

  /**
   * Get a value from cache
   * @param {string} key
   * @returns {*} value or null if expired or not found
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache stats (for debugging)
   * @returns {object}
   */
  getStats() {
    return {
      size: this.cache.size,
      ttlMinutes: this.ttl / 60 / 1000,
    };
  }
}

module.exports = Cache;

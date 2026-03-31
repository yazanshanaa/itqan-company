module.exports = function getClientIp(req) {
  if (process.env.BEHIND_PROXY === 'true') {
    // Only trust X-Forwarded-For when running behind a known reverse proxy.
    // Take the LAST entry added by the trusted proxy, not the first
    // (the first can be spoofed by the client).
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = forwarded.split(',').map(s => s.trim());
      // Last IP in chain is set by the actual proxy — most trustworthy
      return ips[ips.length - 1] || req.socket.remoteAddress;
    }
  }
  return req.socket.remoteAddress;
};

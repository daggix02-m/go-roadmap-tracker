/**
 * Device label — human-readable string for sync metadata.
 * e.g. "Chrome · Linux", "Safari · macOS", "Firefox · Windows"
 */
export function getDeviceLabel(): string {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav) return 'Unknown device';

  let browser = 'Browser';
  if (nav.userAgent.includes('Firefox')) browser = 'Firefox';
  else if (nav.userAgent.includes('Edg/')) browser = 'Edge';
  else if (nav.userAgent.includes('Chrome')) browser = 'Chrome';
  else if (nav.userAgent.includes('Safari')) browser = 'Safari';

  let os = 'device';
  const ua = nav.userAgent;
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} · ${os}`;
}

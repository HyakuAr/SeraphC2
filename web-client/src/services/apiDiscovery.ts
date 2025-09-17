/**
 * API Discovery Service
 * Automatically discovers the correct API endpoint by trying common ports
 */

const DEFAULT_PORTS = [3000, 3001, 3002, 3003, 8000, 8080];
const HEALTH_ENDPOINT = '/api/health';

/**
 * Check if a port is responding
 */
async function checkPort(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await fetch(`http://localhost:${port}${HEALTH_ENDPOINT}`, {
      signal: controller.signal,
      method: 'GET',
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Discover the API base URL by trying common ports
 */
export async function discoverApiUrl(): Promise<string> {
  // First try the environment variable if set
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
      if (await checkPort(port)) {
        console.log(`✅ Using configured API URL: ${envUrl}`);
        return envUrl;
      }
    } catch (error) {
      console.warn(`⚠️  Configured API URL ${envUrl} is not responding, trying discovery...`);
    }
  }

  // Try common ports
  console.log('🔍 Discovering API endpoint...');

  for (const port of DEFAULT_PORTS) {
    console.log(`🔍 Trying port ${port}...`);
    if (await checkPort(port)) {
      const apiUrl = `http://localhost:${port}`;
      console.log(`✅ Found API server at: ${apiUrl}`);
      return apiUrl;
    }
  }

  // Fallback to default
  const fallbackUrl = 'http://localhost:3000';
  console.warn(`⚠️  No API server found, falling back to: ${fallbackUrl}`);
  return fallbackUrl;
}

/**
 * Get the discovered API URL (cached after first discovery)
 */
let cachedApiUrl: string | null = null;

export async function getApiUrl(): Promise<string> {
  if (!cachedApiUrl) {
    cachedApiUrl = await discoverApiUrl();
  }
  return cachedApiUrl;
}

/**
 * Reset the cached API URL (useful for retrying discovery)
 */
export function resetApiUrl(): void {
  cachedApiUrl = null;
}

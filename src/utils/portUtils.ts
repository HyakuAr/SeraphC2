import * as net from 'net';

/**
 * Check if a port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();

    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });

    server.on('error', () => resolve(false));
  });
}

/**
 * Find an available port starting from the default port
 */
export async function findAvailablePort(
  startPort: number = 3000,
  maxAttempts: number = 10
): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

/**
 * Get port from environment with fallback
 */
export async function getServerPort(): Promise<number> {
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // If environment port is available, use it
  if (await isPortAvailable(envPort)) {
    return envPort;
  }

  console.warn(`⚠️  Port ${envPort} is busy, searching for alternative...`);

  // Otherwise find next available port
  const availablePort = await findAvailablePort(envPort);

  if (availablePort !== envPort) {
    console.warn(`⚠️  Using port ${availablePort} instead of ${envPort}`);
  }

  return availablePort;
}

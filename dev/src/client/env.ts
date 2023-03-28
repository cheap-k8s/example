export interface EnvVars {
  protocol: string
  apiServerHost: string
  apiServerPort: number
}

export function getEnvVars(): EnvVars {
  const isDev = import.meta.env.DEV
  if (isDev) {
    return {
      protocol: 'ws',
      apiServerHost: 'localhost',
      apiServerPort: 3000,
    }
  }
  const isStaging = location.hostname.includes('staging')
  if (isStaging) {
    return {
      protocol: 'wss',
      apiServerHost: 'api-staging.poc.epdndo.com',
      apiServerPort: 443,
    }
  }
  return {
    protocol: 'wss',
    apiServerHost: 'api-production.poc.epdndo.com',
    apiServerPort: 443,
  }
}

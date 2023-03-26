export interface EnvVars {
  apiServerHost: string
  apiServerPort: number
}

export function getEnvVars(): EnvVars {
  const apiServerPort = 3000
  const isDev = import.meta.env.DEV
  if (isDev) {
    return {
      apiServerHost: 'localhost',
      apiServerPort,
    }
  }
  const isStaging = location.hostname.includes('staging')
  if (isStaging) {
    return {
      apiServerHost: 'api-staging.poc.epdndo.com',
      apiServerPort,
    }
  }
  return {
    apiServerHost: 'api-production.poc.epdndo.com',
    apiServerPort,
  }
}

import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'
import { createKubeSystemResourcesPatches } from './patch'
import { createFlux2Resources } from './flux'
import { createPGOResources } from './pgo'
import { createIngressResources } from './ingress'
import { createCaddyResources } from './caddy'
import { createK8sClusterResources } from './cluster'
import { createDeschedulerResources } from './descheduler'

const providerCfg = new pulumi.Config('gcp')
const project = providerCfg.require('project')
const region = providerCfg.require('region')
const cfg = new pulumi.Config()
const nodesPerZone = cfg.requireNumber('nodesPerZone')
const githubToken = cfg.requireSecret('githubToken')
const zones = gcp.compute.getZones()

const domainNames = [
  'staging.poc.epdndo.com',
  'api-staging.poc.epdndo.com',
  'production.poc.epdndo.com',
  'api-production.poc.epdndo.com',
]

const gitOpsConfigs = [
  {
    name: 'example',
    secret: {
      username: 'cheap-k8s',
      password: githubToken,
    },
    repository: {
      url: 'https://github.com/cheap-k8s/example/',
      branch: 'main',
      targets: [
        {
          name: 'staging',
          path: './ops/app/staging',
          step: {
            pre: {
              enable: true,
              path: './ops/app/staging/pre',
            },
            post: {
              enable: true,
              path: './ops/app/staging/post',
            },
          },
        },
        {
          name: 'production',
          path: './ops/app/production',
          step: {
            pre: {
              enable: true,
              path: './ops/app/production/pre',
            },
            post: {
              enable: true,
              path: './ops/app/production/post',
            },
          },
        },
      ],
    },
  },
]

const pgoConfig = {
  backupSchedules: {
    full: '5 12 * * *',
    incremental: '0 */1 * * *',
  },
}

const network = new gcp.compute.Network('network', {
  autoCreateSubnetworks: false,
})

const subnet = new gcp.compute.Subnetwork('subnet', {
  ipCidrRange: '10.128.0.0/12',
  network: network.id,
  privateIpGoogleAccess: true,
})

const { cluster, kubeconfig, clusterNodeTag } = createK8sClusterResources({
  network,
  subnet,
  zones,
  nodesPerZone,
  projectName: project,
})

const k8sProvider = new k8s.Provider('k8s-provider', {
  kubeconfig,
  enableServerSideApply: true,
})

createKubeSystemResourcesPatches(k8sProvider)
createIngressResources({ k8sProvider })
const { arAdminWIPGithubProvider, arAdminSA, registories } =
  createFlux2Resources({
    cluster,
    gitOpsConfigs,
    projectName: project,
    region,
    k8sProvider,
  })
createPGOResources({
  pgoConfig,
  gitOpsConfigs,
  cluster,
  projectName: project,
  region,
  k8sProvider,
})
createCaddyResources({
  cluster,
  network,
  subnet,
  zones,
  clusterNodeTag,
  projectName: project,
  domainNames,
})

export const projectId = project
export const artifactRegistryAdminWorkloadIdentityPoolGithubProvierName =
  arAdminWIPGithubProvider.name
export const artifactRegistryAdminServiceAccountEmail = arAdminSA.email
export const artifactRegistryDomain = `${region}-docker.pkg.dev`
export const artifactResistryTagPrefixs = registories.map(
  (x) => pulumi.interpolate`${region}-docker.pkg.dev/${project}/${x.name}`,
)

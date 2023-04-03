import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'

export type K8sClusterResourcesProps = {
  network: gcp.compute.Network
  subnet: gcp.compute.Subnetwork
  zones: Promise<gcp.compute.GetZonesResult>
  nodesPerZone: pulumi.Input<number>
  projectName: pulumi.Input<string>
}

export function createK8sClusterResources({
  network,
  subnet,
  zones,
  nodesPerZone,
  projectName,
}: K8sClusterResourcesProps) {
  const cluster = new gcp.container.Cluster('cluster', {
    addonsConfig: {
      dnsCacheConfig: {
        enabled: true,
      },
      httpLoadBalancing: {
        disabled: true,
      },
    },
    //   monitoringConfig: {
    //     managedPrometheus: {
    //       enabled: true,
    //     },
    //   },
    binaryAuthorization: {
      evaluationMode: 'PROJECT_SINGLETON_POLICY_ENFORCE',
    },
    datapathProvider: 'ADVANCED_DATAPATH',
    initialNodeCount: 1,
    ipAllocationPolicy: {
      clusterIpv4CidrBlock: '/14',
      servicesIpv4CidrBlock: '/20',
    },
    location: zones.then((x) => x.names[0]),
    masterAuthorizedNetworksConfig: {
      cidrBlocks: [
        {
          cidrBlock: '0.0.0.0/0',
          displayName: 'All networks',
        },
      ],
    },
    network: network.name,
    networkingMode: 'VPC_NATIVE',
    privateClusterConfig: {
      enablePrivateNodes: true,
      enablePrivateEndpoint: false,
      masterIpv4CidrBlock: '10.100.0.0/28',
    },
    removeDefaultNodePool: true,
    releaseChannel: {
      channel: 'STABLE',
    },
    subnetwork: subnet.name,
    workloadIdentityConfig: {
      workloadPool: `${projectName}.svc.id.goog`,
    },
  })

  const nodepoolSA = new gcp.serviceaccount.Account('nodepool-sa', {
    accountId: pulumi.interpolate`${cluster.name}-np-1-sa`,
    displayName: 'GKE Nodepool Service Account',
  })

  const nodepoolSARoles = [
    {
      name: 'node-service-account',
      role: 'roles/container.nodeServiceAccount',
    },
    {
      name: 'artifactregistry-reader',
      role: 'roles/artifactregistry.reader',
    },
  ]
  nodepoolSARoles.map((x) => {
    new gcp.projects.IAMMember(`nodepool-sa-${x.name}-iam-binding`, {
      project: projectName,
      role: x.role,
      member: pulumi.interpolate`serviceAccount:${nodepoolSA.email}`,
    })
  })

  const clusterNodeTag = pulumi.interpolate`${cluster.name}-node`

  const nodeAllowMasterTcp8443Firewall = new gcp.compute.Firewall(
    'node-allow-master-tcp8443-firewall',
    {
      network: network.name,
      direction: 'INGRESS',
      allows: [
        {
          protocol: 'tcp',
          ports: ['8443'],
        },
      ],
      sourceRanges: ['10.100.0.0/28'],
      targetTags: [clusterNodeTag],
    },
  )

  const nodepool = new gcp.container.NodePool('nodepool', {
    cluster: cluster.id,
    nodeCount: nodesPerZone,
    nodeConfig: {
      spot: true,
      machineType: 'e2-small',
      diskSizeGb: 20,
      diskType: 'pd-standard',
      oauthScopes: ['https://www.googleapis.com/auth/cloud-platform'],
      serviceAccount: nodepoolSA.email,
      tags: [clusterNodeTag],
    },
  })

  const kubeconfig = pulumi.interpolate`apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${cluster.masterAuth.clusterCaCertificate}
    server: https://${cluster.endpoint}
  name: ${cluster.name}
contexts:
- context:
    cluster: ${cluster.name}
    user: ${cluster.name}
  name: ${cluster.name}
current-context: ${cluster.name}
kind: Config
preferences: {}
users:
- name: ${cluster.name}
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: gke-gcloud-auth-plugin
      installHint: Install gke-gcloud-auth-plugin for use with kubectl by following
        https://cloud.google.com/blog/products/containers-kubernetes/kubectl-auth-changes-in-gke
      provideClusterInfo: true
`

  return {
    cluster,
    clusterNodeTag,
    kubeconfig,
  }
}

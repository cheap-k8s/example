import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'

export type CaddyResourcesProps = {
  cluster: gcp.container.Cluster
  network: gcp.compute.Network
  subnet: gcp.compute.Subnetwork
  zones: Promise<gcp.compute.GetZonesResult>
  projectName: pulumi.Input<string>
  domainNames: string[]
  clusterNodeTag: pulumi.Input<string>
}

export function createCaddyResources({
  cluster,
  network,
  subnet,
  zones,
  clusterNodeTag,
  projectName,
  domainNames,
}: CaddyResourcesProps) {
  const caddyIp = new gcp.compute.Address('caddy-ip')

  const allowHttp = new gcp.compute.Firewall('allow-http-firewall', {
    network: network.name,
    direction: 'INGRESS',
    allows: [
      {
        protocol: 'tcp',
        ports: ['80'],
      },
    ],
    sourceRanges: ['0.0.0.0/0'],
    targetTags: ['allow-http'],
  })

  const allowHttps = new gcp.compute.Firewall('allow-https-firewall', {
    network: network.name,
    direction: 'INGRESS',
    allows: [
      {
        protocol: 'tcp',
        ports: ['443'],
      },
    ],
    sourceRanges: ['0.0.0.0/0'],
    targetTags: ['allow-https'],
  })

  const allowSSH = new gcp.compute.Firewall('allow-ssh-firewall', {
    network: network.name,
    direction: 'INGRESS',
    allows: [
      {
        protocol: 'tcp',
        ports: ['22'],
      },
    ],
    sourceRanges: ['0.0.0.0/0'],
    targetTags: ['allow-ssh'],
  })

  const caddySA = new gcp.serviceaccount.Account('caddy-sa', {
    accountId: pulumi.interpolate`caddy-sa`,
    displayName: 'Caddy Service Account',
  })

  const caddySARoles = [
    {
      name: 'compute-viewer',
      role: 'roles/compute.viewer',
    },
    {
      name: 'log-writer',
      role: 'roles/logging.logWriter',
    },
    {
      name: 'metric-writer',
      role: 'roles/monitoring.metricWriter',
    },
    {
      name: 'monitoring-viewer',
      role: 'roles/monitoring.viewer',
    },
  ]
  caddySARoles.map((x) => {
    new gcp.projects.IAMMember(`caddy-sa-${x.name}-iam-binding`, {
      project: projectName,
      role: x.role,
      member: pulumi.interpolate`serviceAccount:${caddySA.email}`,
    })
  })

  const caddy = new gcp.compute.Instance(
    'caddy',
    {
      allowStoppingForUpdate: true,
      machineType: 'e2-micro',
      zone: zones.then((x) => x.names[0]),
      canIpForward: true,
      networkInterfaces: [
        {
          network: network.id,
          subnetwork: subnet.id,
          accessConfigs: [{ natIp: caddyIp.address }],
        },
      ],
      bootDisk: {
        initializeParams: {
          size: 10,
          type: 'pd-standard',
          image: 'projects/cos-cloud/global/images/family/cos-stable',
        },
      },
      metadata: {
        'gce-container-declaration': pulumi.interpolate`spec:
  containers:
  - image: ghcr.io/cheap-k8s/cheap-k8s/caddy:latest
    name: caddy
    env:
    - name: DOMAIN_NAMES
      value: ${domainNames.join(', ')}
    - name: NODE_NAME_PREFIX
      value: gke-${cluster.name}
    securityContext:
      privileged: false
    stdin: false
    tty: false
    volumeMounts: []
  volumes: []
  restartPolicy: Always
`,
        'google-logging-enabled': 'true',
        'google-monitoring-enabled': 'true',
      },
      tags: ['allow-http', 'allow-https', 'allow-ssh'],
      serviceAccount: {
        email: caddySA.email,
        scopes: ['cloud-platform'],
      },
      metadataStartupScript:
        'sudo iptables -t nat -A POSTROUTING -o eth0 -s 10.0.0.0/8 -j MASQUERADE',
    },
    {
      deleteBeforeReplace: true,
    },
  )

  const natRoute = new gcp.compute.Route('nat-route', {
    network: network.name,
    destRange: '0.0.0.0/0',
    priority: 500,
    tags: [clusterNodeTag],
    nextHopInstance: caddy.selfLink,
  })
}

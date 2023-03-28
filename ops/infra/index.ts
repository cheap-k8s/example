import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";

const providerCfg = new pulumi.Config("gcp");
const project = providerCfg.require("project");
const region = providerCfg.require("region");
const cfg = new pulumi.Config();
const nodesPerZone = cfg.requireNumber("nodesPerZone");
const githubToken = cfg.requireSecret("githubToken");
const zones = gcp.compute.getZones();

const domainNames = [
  "staging.poc.epdndo.com",
  "api-staging.poc.epdndo.com",
  "production.poc.epdndo.com",
  "api-production.poc.epdndo.com",
];

const gitOpsConfigs = [
  {
    name: "example",
    secret: {
      username: "cheap-k8s",
      password: githubToken,
    },
    repository: {
      url: "https://github.com/cheap-k8s/example/",
      branch: "main",
      targets: [
        {
          name: "staging",
          path: "./ops/app/staging",
          step: {
            pre: {
              enable: true,
            },
            post: {
              enable: true,
            },
          },
        },
        {
          name: "production",
          path: "./ops/app/production",
          step: {
            pre: {
              enable: true,
            },
            post: {
              enable: true,
            },
          },
        },
      ],
    },
  },
];

const pgoConfig = {
  users: gitOpsConfigs
    .flatMap((x) =>
      x.repository.targets.map((t) => {
        const name = `${x.name}-${t.name}`;
        return {
          name,
          databases: [name],
        };
      })
    )
    .concat({
      name: "postgres",
      databases: [],
    }),
  backupSchedules: {
    full: "5 12 * * *",
    incremental: "0 */1 * * *",
  },
};

console.log(pgoConfig);

const network = new gcp.compute.Network("network", {
  autoCreateSubnetworks: false,
});

const subnet = new gcp.compute.Subnetwork("subnet", {
  ipCidrRange: "10.128.0.0/12",
  network: network.id,
  privateIpGoogleAccess: true,
});

const cluster = new gcp.container.Cluster("cluster", {
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
    evaluationMode: "PROJECT_SINGLETON_POLICY_ENFORCE",
  },
  datapathProvider: "ADVANCED_DATAPATH",
  initialNodeCount: 1,
  ipAllocationPolicy: {
    clusterIpv4CidrBlock: "/14",
    servicesIpv4CidrBlock: "/20",
  },
  location: zones.then((x) => x.names[0]),
  masterAuthorizedNetworksConfig: {
    cidrBlocks: [
      {
        cidrBlock: "0.0.0.0/0",
        displayName: "All networks",
      },
    ],
  },
  network: network.name,
  networkingMode: "VPC_NATIVE",
  privateClusterConfig: {
    enablePrivateNodes: true,
    enablePrivateEndpoint: false,
    masterIpv4CidrBlock: "10.100.0.0/28",
  },
  removeDefaultNodePool: true,
  releaseChannel: {
    channel: "STABLE",
  },
  subnetwork: subnet.name,
  workloadIdentityConfig: {
    workloadPool: `${project}.svc.id.goog`,
  },
});

const nodepoolSA = new gcp.serviceaccount.Account("nodepool-sa", {
  accountId: pulumi.interpolate`${cluster.name}-np-1-sa`,
  displayName: "GKE Nodepool Service Account",
});

const nodepoolSARoles = [
  {
    name: "node-service-account",
    role: "roles/container.nodeServiceAccount",
  },
  {
    name: "artifactregistry-reader",
    role: "roles/artifactregistry.reader",
  },
];
nodepoolSARoles.map((x) => {
  new gcp.projects.IAMMember(`nodepool-sa-${x.name}-iam-binding`, {
    project: project,
    role: x.role,
    member: pulumi.interpolate`serviceAccount:${nodepoolSA.email}`,
  });
});

const clusterNodeTag = pulumi.interpolate`${cluster.name}-node`;

const nodeAllowMasterTcp8443Firewall = new gcp.compute.Firewall(
  "node-allow-master-tcp8443-firewall",
  {
    network: network.name,
    direction: "INGRESS",
    allows: [
      {
        protocol: "tcp",
        ports: ["8443"],
      },
    ],
    sourceRanges: ["10.100.0.0/28"],
    targetTags: [clusterNodeTag],
  }
);

const nodepool = new gcp.container.NodePool("nodepool", {
  cluster: cluster.id,
  nodeCount: nodesPerZone,
  nodeConfig: {
    spot: true,
    machineType: "e2-small",
    diskSizeGb: 20,
    diskType: "pd-standard",
    oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
    serviceAccount: nodepoolSA.email,
    tags: [clusterNodeTag],
  },
});

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
`;

const k8sProvider = new k8s.Provider("k8s-provider", {
  kubeconfig,
  enableServerSideApply: true,
});

const disableKubeDNSAutoscalerPatch = new k8s.apps.v1.DeploymentPatch(
  "disable-kube-dns-autoscaler-patch",
  {
    metadata: {
      namespace: "kube-system",
      name: "kube-dns-autoscaler",
    },
    spec: {
      replicas: 0,
    },
  },
  { provider: k8sProvider }
);

const minimizeKubeDNSPatch = new k8s.apps.v1.DeploymentPatch(
  "minimize-kube-dns-patch",
  {
    metadata: {
      namespace: "kube-system",
      name: "kube-dns",
    },
    spec: {
      replicas: 1,
    },
  },
  { provider: k8sProvider }
);

const nginxNamespace = new k8s.core.v1.Namespace(
  "nginx-namespace",
  {
    metadata: {
      name: "ingress-nginx",
    },
  },
  {
    provider: k8sProvider,
  }
);
const nginx = new k8s.helm.v3.Release(
  "ingress-nginx",
  {
    chart: "ingress-nginx",
    namespace: "ingress-nginx",
    repositoryOpts: {
      repo: "https://kubernetes.github.io/ingress-nginx",
    },
    values: {
      controller: {
        service: {
          type: "NodePort",
          nodePorts: {
            http: 32080,
            https: 32443,
          },
        },
      },
    },
  },
  { provider: k8sProvider }
);

const flux2Namespace = new k8s.core.v1.Namespace(
  "flux2-namespace",
  {
    metadata: {
      name: "flux2",
    },
  },
  {
    provider: k8sProvider,
  }
);
const flux2 = new k8s.helm.v3.Release(
  "flux2",
  {
    chart: "flux2",
    namespace: flux2Namespace.metadata.name,
    repositoryOpts: {
      repo: "https://fluxcd-community.github.io/helm-charts/",
    },
    values: [
      "helmController",
      "imageAutomationController",
      "imageReflectionController",
      "kustomizeController",
      "notificationController",
      "sourceController",
    ].reduce<any>((acc, x) => {
      acc[x] = {
        resources: {
          requests: {
            cpu: "50m",
            memory: "48Mi",
          },
        },
      };
      return acc;
    }, {}),
  },
  {
    provider: k8sProvider,
  }
);

const pgoBackupSA = new gcp.serviceaccount.Account("pgo-backup-sa", {
  accountId: pulumi.interpolate`${cluster.name}-pgo-backup-sa`,
  displayName: "PGO Backup SA",
});

const pgoBackupSARoles = [
  {
    name: "storage-object-admin",
    role: "roles/storage.objectAdmin",
  },
];

pgoBackupSARoles.map((x) => {
  new gcp.projects.IAMMember(`pgo-backup-sa-${x.name}-iam-binding`, {
    project: project,
    role: x.role,
    member: pulumi.interpolate`serviceAccount:${pgoBackupSA.email}`,
  });
});

const pgoBackupBucket = new gcp.storage.Bucket("pgo-backup-bucket", {
  name: pulumi.interpolate`${cluster.name}-db-backup`,
  location: region,
});

const pgoNamespace = new k8s.core.v1.Namespace(
  "pgo-namespace",
  {
    metadata: {
      name: "postgres-operator",
    },
  },
  {
    provider: k8sProvider,
  }
);

const pgo = new k8s.kustomize.Directory(
  "pgo",
  {
    directory:
      "https://github.com/CrunchyData/postgres-operator-examples/tree/main/kustomize/install/default",
  },
  { provider: k8sProvider, dependsOn: [pgoNamespace] }
);

const pgoCluster = new k8s.apiextensions.CustomResource(
  "pgo-cluster",
  {
    apiVersion: "postgres-operator.crunchydata.com/v1beta1",
    kind: "PostgresCluster",
    metadata: {
      name: "pgo-cluster",
      namespace: pgoNamespace.metadata.name,
    },
    spec: {
      image:
        "registry.developers.crunchydata.com/crunchydata/crunchy-postgres:ubi8-14.6-0",
      postgresVersion: 14,
      instances: [
        {
          name: "pgo-instance",
          dataVolumeClaimSpec: {
            accessModes: ["ReadWriteOnce"],
            resources: {
              requests: {
                storage: "1Gi",
              },
            },
          },
        },
      ],
      metadata: {
        annotations: {
          "iam.gke.io/gcp-service-account": pgoBackupSA.email,
        },
      },
      backups: {
        pgbackrest: {
          image:
            "registry.developers.crunchydata.com/crunchydata/crunchy-pgbackrest:ubi8-2.41-0",
          global: {
            "repo1-path": "/",
            "repo1-gcs-key-type": "auto",
            "repo1-retention-full": "14",
            "repo1-retention-full-type": "time",
          },
          repos: [
            {
              name: "repo1",
              schedules: pgoConfig.backupSchedules,
              gcs: {
                bucket: pgoBackupBucket.name,
              },
            },
          ],
        },
      },
      users: pgoConfig.users,
    },
  },
  { provider: k8sProvider, dependsOn: [pgoNamespace, pgo] }
);

// NOTE:
// Clone the DB secret generated by PGO to the namespace where applications run
// This operation will no longer be necessary once the PGO has completed its support.
// https://github.com/CrunchyData/postgres-operator/issues/2831
gitOpsConfigs.map((x) => {
  x.repository.targets.map((t) => {
    const name = `${x.name}-${t.name}`;
    const dbSecret = k8s.core.v1.Secret.get(
      `pgo-secret-${name}`,
      pulumi.interpolate`${pgoNamespace.metadata.name}/${pgoCluster.metadata.name}-pguser-${name}`,
      {
        provider: k8sProvider,
        dependsOn: [pgoCluster],
      }
    );
    const clonedDbSecret = new k8s.core.v1.Secret(
      `cloned-pgo-secret-${name}`,
      {
        metadata: {
          namespace: name,
          name: dbSecret.metadata.name,
        },
        data: dbSecret.data,
      },
      {
        provider: k8sProvider,
      }
    );
  });
});

const pgoKSASuffix = ["instance", "pgbackrest"];

pgoKSASuffix.map((x) => {
  new gcp.serviceaccount.IAMMember(`pgo-backup-sa-wi-iam-binding-${x}`, {
    serviceAccountId: pgoBackupSA.name,
    role: "roles/iam.workloadIdentityUser",
    member: pulumi.interpolate`serviceAccount:${project}.svc.id.goog[${pgoNamespace.metadata.name}/${pgoCluster.metadata.name}-${x}]`,
  });
});

const arAdminSA = new gcp.serviceaccount.Account("artifact-resistry-admin-sa", {
  accountId: pulumi.interpolate`${cluster.name}-ar-admin-sa`,
  displayName: "Artifact Resistry Admin SA",
});

const arAdminSARoles = [
  {
    name: "ar-repo-admin",
    role: "roles/artifactregistry.repoAdmin",
  },
];
arAdminSARoles.map((x) => {
  new gcp.projects.IAMMember(`ar-admin-sa-${x.name}-iam-binding`, {
    project: project,
    role: x.role,
    member: pulumi.interpolate`serviceAccount:${arAdminSA.email}`,
  });
});

const arAdminWIP = new gcp.iam.WorkloadIdentityPool("ar-admin-wip", {
  workloadIdentityPoolId: pulumi.interpolate`${cluster.name}-ar-admin-pool`,
});

const arAdminWIPGithubProvider = new gcp.iam.WorkloadIdentityPoolProvider(
  "github-provider",
  {
    workloadIdentityPoolId: arAdminWIP.workloadIdentityPoolId,
    workloadIdentityPoolProviderId: pulumi.interpolate`${cluster.name}-github`,
    displayName: "github",
    attributeMapping: {
      "google.subject": "assertion.sub",
      "attribute.actor": "assertion.actor",
      "attribute.aud": "assertion.aud",
      "attribute.repository": "assertion.repository",
    },
    oidc: {
      issuerUri: "https://token.actions.githubusercontent.com",
    },
  }
);

const registories = gitOpsConfigs.map((x) => {
  const repositoryPath = new URL(x.repository.url).pathname.slice(0, -1);
  const arAdminSAWorkloadIdentityIAMBinding = new gcp.serviceaccount.IAMMember(
    `ar-admin-wi-iam-binding-${x.name}`,
    {
      serviceAccountId: arAdminSA.name,
      role: "roles/iam.workloadIdentityUser",
      member: pulumi.interpolate`principalSet://iam.googleapis.com/${arAdminWIP.name}/attribute.repository${repositoryPath}`,
    }
  );

  const artifactRegistry = new gcp.artifactregistry.Repository(
    `artifact-registry-${x.name}`,
    {
      description: x.name,
      format: "DOCKER",
      location: region,
      repositoryId: x.name,
    }
  );

  const secretName = `git-secret-${x.name}`;
  new k8s.core.v1.Secret(
    secretName,
    {
      metadata: {
        name: secretName,
        namespace: flux2Namespace.metadata.name,
      },
      stringData: x.secret,
    },
    { provider: k8sProvider }
  );

  const repositoryName = `git-repository-${x.name}`;
  new k8s.apiextensions.CustomResource(
    repositoryName,
    {
      apiVersion: "source.toolkit.fluxcd.io/v1beta2",
      kind: "GitRepository",
      metadata: {
        name: repositoryName,
        namespace: flux2Namespace.metadata.name,
      },
      spec: {
        interval: "1m0s",
        url: x.repository.url,
        secretRef: {
          name: secretName, // Flux user PAT (read-only access)
        },
        ref: {
          branch: x.repository.branch,
        },
      },
    },
    { provider: k8sProvider }
  );

  x.repository.targets.map((t) => {
    const gitopsName = `gitops-${x.name}-${t.name}`;
    const preGitopsName = `${gitopsName}-pre`;
    const preGitopsPath = `${t.path}/pre`;
    const postGitopsName = `${gitopsName}-post`;
    const postGitopsPath = `${t.path}/post`;
    const targetNamespace = `${x.name}-${t.name}`;
    new k8s.core.v1.Namespace(
      `${targetNamespace}-namespace`,
      {
        metadata: {
          name: targetNamespace,
        },
      },
      { provider: k8sProvider }
    );

    if (t.step.pre.enable) {
      new k8s.apiextensions.CustomResource(
        preGitopsName,
        {
          apiVersion: "kustomize.toolkit.fluxcd.io/v1beta2",
          kind: "Kustomization",
          metadata: {
            name: preGitopsName,
            namespace: flux2Namespace.metadata.name,
          },
          spec: {
            interval: "60m",
            timeout: "3m",
            retryInterval: "1m",
            force: true,
            wait: true,
            prune: true,
            path: preGitopsPath,
            targetNamespace,
            sourceRef: {
              kind: "GitRepository",
              name: repositoryName,
              namespace: flux2Namespace.metadata.name,
            },
          },
        },
        { provider: k8sProvider }
      );
    }
    new k8s.apiextensions.CustomResource(
      gitopsName,
      {
        apiVersion: "kustomize.toolkit.fluxcd.io/v1beta2",
        kind: "Kustomization",
        metadata: {
          name: gitopsName,
          namespace: flux2Namespace.metadata.name,
        },
        spec: {
          dependsOn: [
            {
              name: preGitopsName,
            },
          ],
          interval: "60m",
          timeout: "3m",
          retryInterval: "1m",
          wait: true,
          prune: true,
          path: t.path,
          targetNamespace,
          sourceRef: {
            kind: "GitRepository",
            name: repositoryName,
            namespace: flux2Namespace.metadata.name,
          },
        },
      },
      { provider: k8sProvider }
    );
    if (t.step.post.enable) {
      new k8s.apiextensions.CustomResource(
        postGitopsName,
        {
          apiVersion: "kustomize.toolkit.fluxcd.io/v1beta2",
          kind: "Kustomization",
          metadata: {
            name: postGitopsName,
            namespace: flux2Namespace.metadata.name,
          },
          spec: {
            dependsOn: [
              {
                name: gitopsName,
              },
            ],
            interval: "60m",
            timeout: "3m",
            retryInterval: "1m",
            force: true,
            wait: true,
            prune: true,
            path: postGitopsPath,
            targetNamespace,
            sourceRef: {
              kind: "GitRepository",
              name: repositoryName,
              namespace: flux2Namespace.metadata.name,
            },
          },
        },
        { provider: k8sProvider }
      );
    }
  });

  return artifactRegistry;
});

const caddyIp = new gcp.compute.Address("caddy-ip");

const allowHttp = new gcp.compute.Firewall("allow-http-firewall", {
  network: network.name,
  direction: "INGRESS",
  allows: [
    {
      protocol: "tcp",
      ports: ["80"],
    },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["allow-http"],
});

const allowHttps = new gcp.compute.Firewall("allow-https-firewall", {
  network: network.name,
  direction: "INGRESS",
  allows: [
    {
      protocol: "tcp",
      ports: ["443"],
    },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["allow-https"],
});

const allowSSH = new gcp.compute.Firewall("allow-ssh-firewall", {
  network: network.name,
  direction: "INGRESS",
  allows: [
    {
      protocol: "tcp",
      ports: ["22"],
    },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["allow-ssh"],
});

const caddySA = new gcp.serviceaccount.Account("caddy-sa", {
  accountId: pulumi.interpolate`caddy-sa`,
  displayName: "Caddy Service Account",
});

const caddySARoles = [
  {
    name: "compute-viewer",
    role: "roles/compute.viewer",
  },
  {
    name: "log-writer",
    role: "roles/logging.logWriter",
  },
  {
    name: "metric-writer",
    role: "roles/monitoring.metricWriter",
  },
  {
    name: "monitoring-viewer",
    role: "roles/monitoring.viewer",
  },
];
caddySARoles.map((x) => {
  new gcp.projects.IAMMember(`caddy-sa-${x.name}-iam-binding`, {
    project: project,
    role: x.role,
    member: pulumi.interpolate`serviceAccount:${caddySA.email}`,
  });
});

const caddy = new gcp.compute.Instance(
  "caddy",
  {
    allowStoppingForUpdate: true,
    machineType: "e2-micro",
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
        type: "pd-standard",
        image: "projects/cos-cloud/global/images/family/cos-stable",
      },
    },
    metadata: {
      "gce-container-declaration": pulumi.interpolate`spec:
  containers:
  - image: ghcr.io/persol-epdndo/prototype-infra-poc/caddy:latest
    name: caddy
    env:
    - name: DOMAIN_NAMES
      value: ${domainNames.join(", ")}
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
      "google-logging-enabled": "true",
      "google-monitoring-enabled": "true",
    },
    tags: ["allow-http", "allow-https", "allow-ssh"],
    serviceAccount: {
      email: caddySA.email,
      scopes: ["cloud-platform"],
    },
    metadataStartupScript:
      "sudo iptables -t nat -A POSTROUTING -o eth0 -s 10.0.0.0/8 -j MASQUERADE",
  },
  {
    deleteBeforeReplace: true,
  }
);

const natRoute = new gcp.compute.Route("nat-route", {
  network: network.name,
  destRange: "0.0.0.0/0",
  priority: 500,
  tags: [clusterNodeTag],
  nextHopInstance: caddy.selfLink,
});

export const projectId = project;
export const artifactRegistryAdminWorkloadIdentityPoolGithubProvierName =
  arAdminWIPGithubProvider.name;
export const artifactRegistryAdminServiceAccountEmail = arAdminSA.email;
export const artifactRegistryDomain = `${region}-docker.pkg.dev`;
export const artifactResistryTagPrefixs = registories.map(
  (x) => pulumi.interpolate`${region}-docker.pkg.dev/${project}/${x.name}`
);

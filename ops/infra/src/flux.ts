import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'

export type GitOpsConfigTarget = {
  name: string
  path: string
  step: {
    pre: {
      enable: boolean
      path: string
    }
    post: {
      enable: boolean
      path: string
    }
  }
}

export type GitOpsConfig = {
  name: string
  secret: {
    username: string
    password: pulumi.Input<string>
  }
  repository: {
    url: string
    branch: string
    targets: GitOpsConfigTarget[]
  }
}

export type Flux2ResourcesProps = {
  gitOpsConfigs: GitOpsConfig[]
  cluster: gcp.container.Cluster
  projectName: pulumi.Input<string>
  region: pulumi.Input<string>
  k8sProvider: k8s.Provider
}

export function createFlux2Resources({
  gitOpsConfigs,
  cluster,
  projectName,
  region,
  k8sProvider,
}: Flux2ResourcesProps) {
  const flux2Namespace = new k8s.core.v1.Namespace(
    'flux2-namespace',
    {
      metadata: {
        name: 'flux2',
      },
    },
    {
      provider: k8sProvider,
    },
  )
  const flux2 = new k8s.helm.v3.Release(
    'flux2',
    {
      chart: 'flux2',
      namespace: flux2Namespace.metadata.name,
      repositoryOpts: {
        repo: 'https://fluxcd-community.github.io/helm-charts/',
      },
      values: [
        'helmController',
        'imageAutomationController',
        'imageReflectionController',
        'kustomizeController',
        'notificationController',
        'sourceController',
      ].reduce<any>((acc, x) => {
        acc[x] = {
          resources: {
            requests: {
              cpu: '0',
              memory: '0',
            },
          },
        }
        return acc
      }, {}),
    },
    {
      provider: k8sProvider,
    },
  )

  const arAdminSA = new gcp.serviceaccount.Account(
    'artifact-resistry-admin-sa',
    {
      accountId: pulumi.interpolate`${cluster.name}-ar-admin-sa`,
      displayName: 'Artifact Resistry Admin SA',
    },
  )

  const arAdminSARoles = [
    {
      name: 'ar-repo-admin',
      role: 'roles/artifactregistry.repoAdmin',
    },
  ]
  arAdminSARoles.map((x) => {
    new gcp.projects.IAMMember(`ar-admin-sa-${x.name}-iam-binding`, {
      project: projectName,
      role: x.role,
      member: pulumi.interpolate`serviceAccount:${arAdminSA.email}`,
    })
  })

  const arAdminWIP = new gcp.iam.WorkloadIdentityPool('ar-admin-wip', {
    workloadIdentityPoolId: pulumi.interpolate`${cluster.name}-ar-admin-pool`,
  })

  const arAdminWIPGithubProvider = new gcp.iam.WorkloadIdentityPoolProvider(
    'github-provider',
    {
      workloadIdentityPoolId: arAdminWIP.workloadIdentityPoolId,
      workloadIdentityPoolProviderId: pulumi.interpolate`${cluster.name}-github`,
      displayName: 'github',
      attributeMapping: {
        'google.subject': 'assertion.sub',
        'attribute.actor': 'assertion.actor',
        'attribute.aud': 'assertion.aud',
        'attribute.repository': 'assertion.repository',
      },
      oidc: {
        issuerUri: 'https://token.actions.githubusercontent.com',
      },
    },
  )

  const registories = gitOpsConfigs.map((x) => {
    const repositoryPath = new URL(x.repository.url).pathname.slice(0, -1)
    const arAdminSAWorkloadIdentityIAMBinding =
      new gcp.serviceaccount.IAMMember(`ar-admin-wi-iam-binding-${x.name}`, {
        serviceAccountId: arAdminSA.name,
        role: 'roles/iam.workloadIdentityUser',
        member: pulumi.interpolate`principalSet://iam.googleapis.com/${arAdminWIP.name}/attribute.repository${repositoryPath}`,
      })

    const artifactRegistry = new gcp.artifactregistry.Repository(
      `artifact-registry-${x.name}`,
      {
        description: x.name,
        format: 'DOCKER',
        location: region,
        repositoryId: x.name,
      },
    )

    const secretName = `git-secret-${x.name}`
    new k8s.core.v1.Secret(
      secretName,
      {
        metadata: {
          name: secretName,
          namespace: flux2Namespace.metadata.name,
        },
        stringData: x.secret,
      },
      { provider: k8sProvider },
    )

    const repositoryName = `git-repository-${x.name}`
    new k8s.apiextensions.CustomResource(
      repositoryName,
      {
        apiVersion: 'source.toolkit.fluxcd.io/v1beta2',
        kind: 'GitRepository',
        metadata: {
          name: repositoryName,
          namespace: flux2Namespace.metadata.name,
        },
        spec: {
          interval: '1m0s',
          url: x.repository.url,
          secretRef: {
            name: secretName,
          },
          ref: {
            branch: x.repository.branch,
          },
        },
      },
      { provider: k8sProvider },
    )

    x.repository.targets.map((t) => {
      const gitopsName = `gitops-${x.name}-${t.name}`
      const preGitopsName = `${gitopsName}-pre`
      const preGitopsPath = `${t.path}/pre`
      const postGitopsName = `${gitopsName}-post`
      const postGitopsPath = `${t.path}/post`
      const targetNamespace = `${x.name}-${t.name}`
      new k8s.core.v1.Namespace(
        `${targetNamespace}-namespace`,
        {
          metadata: {
            name: targetNamespace,
          },
        },
        { provider: k8sProvider },
      )

      if (t.step.pre.enable) {
        new k8s.apiextensions.CustomResource(
          preGitopsName,
          {
            apiVersion: 'kustomize.toolkit.fluxcd.io/v1beta2',
            kind: 'Kustomization',
            metadata: {
              name: preGitopsName,
              namespace: flux2Namespace.metadata.name,
            },
            spec: {
              interval: '60m',
              timeout: '3m',
              retryInterval: '1m',
              force: true,
              wait: true,
              prune: true,
              path: preGitopsPath,
              targetNamespace,
              sourceRef: {
                kind: 'GitRepository',
                name: repositoryName,
                namespace: flux2Namespace.metadata.name,
              },
            },
          },
          { provider: k8sProvider },
        )
      }
      new k8s.apiextensions.CustomResource(
        gitopsName,
        {
          apiVersion: 'kustomize.toolkit.fluxcd.io/v1beta2',
          kind: 'Kustomization',
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
            interval: '60m',
            timeout: '3m',
            retryInterval: '1m',
            wait: true,
            prune: true,
            path: t.path,
            targetNamespace,
            sourceRef: {
              kind: 'GitRepository',
              name: repositoryName,
              namespace: flux2Namespace.metadata.name,
            },
          },
        },
        { provider: k8sProvider },
      )
      if (t.step.post.enable) {
        new k8s.apiextensions.CustomResource(
          postGitopsName,
          {
            apiVersion: 'kustomize.toolkit.fluxcd.io/v1beta2',
            kind: 'Kustomization',
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
              interval: '60m',
              timeout: '3m',
              retryInterval: '1m',
              force: true,
              wait: true,
              prune: true,
              path: postGitopsPath,
              targetNamespace,
              sourceRef: {
                kind: 'GitRepository',
                name: repositoryName,
                namespace: flux2Namespace.metadata.name,
              },
            },
          },
          { provider: k8sProvider },
        )
      }
    })

    return artifactRegistry
  })

  return {
    flux2Namespace,
    flux2,
    arAdminSA,
    arAdminWIPGithubProvider,
    registories,
  }
}

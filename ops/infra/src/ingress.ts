import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'

export type IngressResourcesProps = {
  k8sProvider: k8s.Provider
}

export function createIngressResources({ k8sProvider }: IngressResourcesProps) {
  const ingressNamespace = new k8s.core.v1.Namespace(
    'nginx-namespace',
    {
      metadata: {
        name: 'ingress-nginx',
      },
    },
    {
      provider: k8sProvider,
    },
  )
  const ingress = new k8s.helm.v3.Release(
    'ingress-nginx',
    {
      chart: 'ingress-nginx',
      namespace: 'ingress-nginx',
      repositoryOpts: {
        repo: 'https://kubernetes.github.io/ingress-nginx',
      },
      values: {
        controller: {
          service: {
            type: 'NodePort',
            nodePorts: {
              http: 32080,
              https: 32443,
            },
          },
          replicaCount: 2,
          resources: {
            requests: {
              cpu: 0,
              memory: 0,
            },
          },
        },
      },
    },
    { provider: k8sProvider },
  )

  return {
    ingressNamespace,
    ingress,
  }
}

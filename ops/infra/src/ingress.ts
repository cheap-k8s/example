import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'

export type IngressResourcesProps = {
  k8sProvider: k8s.Provider
}

export function createIngressResources({ k8sProvider }: IngressResourcesProps) {
  const ingressNamespace = new k8s.core.v1.Namespace(
    'ingress',
    {
      metadata: {
        name: 'ingress',
      },
    },
    {
      provider: k8sProvider,
    },
  )

  const ingress = new k8s.helm.v3.Release(
    'nginx',
    {
      chart: 'nginx-ingress',
      namespace: ingressNamespace.metadata.name,
      repositoryOpts: {
        repo: 'https://helm.nginx.com/stable',
      },
      values: {
        controller: {
          kind: 'daemonset',
          resources: {
            requests: {
              cpu: 0,
              memory: 0,
            },
          },
          service: {
            type: 'NodePort',
            httpPort: {
              nodePort: 30080,
            },
            httpsPort: {
              enable: false,
            },
          },
        },
      },
    },
    {
      provider: k8sProvider,
    },
  )
  // const ingress = new k8s.helm.v3.Release(
  //   'ingress-nginx',
  //   {
  //     chart: 'ingress-nginx',
  //     namespace: ingressNamespace.metadata.name,
  //     repositoryOpts: {
  //       repo: 'https://kubernetes.github.io/ingress-nginx',
  //     },
  //     values: {
  //       controller: {
  //         service: {
  //           type: 'NodePort',
  //           nodePorts: {
  //             http: 30080,
  //             https: 30443,
  //           },
  //         },
  //         replicaCount: 2,
  //         resources: {
  //           requests: {
  //             cpu: 0,
  //             memory: 0,
  //           },
  //         },
  //         topologySpreadConstraints: [
  //           {
  //             maxSkew: 1,
  //             topologyKey: 'kubernetes.io/hostname',
  //             whenUnsatisfiable: 'DoNotSchedule',
  //             labelSelector: {
  //               matchLabels: {
  //                 'app.kubernetes.io/name': 'ingress-nginx',
  //               },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //   },
  //   { provider: k8sProvider },
  // )

  return {
    ingressNamespace,
    // ingress,
  }
}

import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'

export type DeschedulerResourcesProps = {
  k8sProvider: k8s.Provider
}

export function createDeschedulerResources({
  k8sProvider,
}: DeschedulerResourcesProps) {
  const namespace = new k8s.core.v1.Namespace(
    'descheduler-namespace',
    {
      metadata: {
        name: 'descheduler',
      },
    },
    {
      provider: k8sProvider,
    },
  )
  const descheduler = new k8s.helm.v3.Release(
    'descheduler',
    {
      chart: 'descheduler',
      namespace: namespace.metadata.name,
      repositoryOpts: {
        repo: 'https://kubernetes-sigs.github.io/descheduler/',
      },
      values: {
        namespace: {
          requests: {
            cpu: 0,
            memory: 0,
          },
        },
        schedule: '*/5 * * * *',
      },
    },
    { provider: k8sProvider },
  )
  {
    return descheduler
  }
}

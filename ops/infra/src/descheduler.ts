import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'

export type DeschedulerResourcesProps = {
  k8sProvider: k8s.Provider
}

export function createDeschedulerResources({
  k8sProvider,
}: DeschedulerResourcesProps) {
  const descheduler = new k8s.helm.v3.Release(
    'descheduler',
    {
      chart: 'descheduler',
      namespace: 'kube-system',
      repositoryOpts: {
        repo: 'https://kubernetes-sigs.github.io/descheduler/',
      },
      values: {
        resources: {
          requests: {
            cpu: 0,
            memory: 0,
          },
        },
        deschedulerPolicy: {
          strategies: {
            LowNodeUtilization: {
              enabled: false,
            },
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

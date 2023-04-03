import * as pulumi from '@pulumi/pulumi'
import * as gcp from '@pulumi/gcp'
import * as k8s from '@pulumi/kubernetes'

export function createKubeSystemResourcesPatches(k8sProvider: k8s.Provider) {
  const kubeDNSAutoscalerPatch = new k8s.apps.v1.DeploymentPatch(
    'kube-dns-autoscaler-patch',
    {
      metadata: {
        namespace: 'kube-system',
        name: 'kube-dns-autoscaler',
      },
      spec: {
        replicas: 0,
      },
    },
    { provider: k8sProvider },
  )

  const kubeDNSPatch = new k8s.apps.v1.DeploymentPatch(
    'kube-dns-patch',
    {
      metadata: {
        namespace: 'kube-system',
        name: 'kube-dns',
      },
      spec: {
        replicas: 1,
      },
    },
    { provider: k8sProvider },
  )

  // NOTE: The following patch does not work because it is overwritten by the addon-manager.
  // const fluentbitGKEPatch = new k8s.apps.v1.DaemonSetPatch(
  //   'fluentbit-gke-patch',
  //   {
  //     metadata: {
  //       namespace: 'kube-system',
  //       name: 'fluentbit-gke',
  //       labels: {
  //         'addonmanager.kubernetes.io/mode': 'EnsureExists',
  //       },
  //       annotations: {
  //         'pulumi.com/patchForce': 'true',
  //       },
  //     },
  //     spec: {
  //       template: {
  //         spec: {
  //           containers: [
  //             {
  //               name: 'fluentbit',
  //               resources: {
  //                 requests: {
  //                   cpu: '16m',
  //                   memory: '32Mi',
  //                 },
  //               },
  //             },
  //             {
  //               name: 'fluentbit-gke',
  //               resources: {
  //                 requests: {
  //                   cpu: '16m',
  //                   memory: '32Mi',
  //                 },
  //               },
  //             },
  //           ],
  //         },
  //       },
  //     },
  //   },
  //   { provider: k8sProvider },
  // )

  return {
    kubeDNSAutoscalerPatch,
    kubeDNSPatch,
  }
}

### login

```sh
gcloud auth login
```

### create a project

```sh
gcloud projects create cheap-k8s-dev
gcloud projects list
gcloud config set project cheap-k8s-dev
gcloud config list
```

### create a service account

```sh
gcloud iam service-accounts create pulumi-executor

gcloud projects add-iam-policy-binding cheap-k8s-dev \
 --member serviceAccount:pulumi-executor@cheap-k8s-dev.iam.gserviceaccount.com \
 --role roles/owner

gcloud iam service-accounts list
```

### create key

```sh
gcloud iam service-accounts keys create gcp-key.json \
 --iam-account pulumi-executor@cheap-k8s-dev.iam.gserviceaccount.com
```

### logout

```sh
gcloud auth revoke
```

### login as pulumi-executor

```sh
gcloud auth activate-service-account --key-file gcp-key.json
```

### enable gcp apis

```sh
gcloud services enable \
 iam.googleapis.com \
 container.googleapis.com \
 compute.googleapis.com \
 artifactregistry.googleapis.com \
```

### set environment variable for Pulumi

```sh
export GOOGLE_CREDENTIALS=$(cat gcp-key.json)
```

### finally pulumi up

```sh
pulumi up
```

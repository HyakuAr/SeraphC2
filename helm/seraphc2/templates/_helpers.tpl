{{/*
Expand the name of the chart.
*/}}
{{- define "seraphc2.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "seraphc2.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "seraphc2.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "seraphc2.labels" -}}
helm.sh/chart: {{ include "seraphc2.chart" . }}
{{ include "seraphc2.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "seraphc2.selectorLabels" -}}
app.kubernetes.io/name: {{ include "seraphc2.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "seraphc2.serviceAccountName" -}}
{{- if .Values.rbac.create }}
{{- default (include "seraphc2.fullname" .) .Values.rbac.serviceAccountName }}
{{- else }}
{{- default "default" .Values.rbac.serviceAccountName }}
{{- end }}
{{- end }}

{{/*
PostgreSQL fullname
*/}}
{{- define "seraphc2.postgresql.fullname" -}}
{{- printf "%s-postgresql" (include "seraphc2.fullname" .) }}
{{- end }}

{{/*
Redis fullname
*/}}
{{- define "seraphc2.redis.fullname" -}}
{{- printf "%s-redis" (include "seraphc2.fullname" .) }}
{{- end }}

{{/*
Database host
*/}}
{{- define "seraphc2.database.host" -}}
{{- if .Values.externalDatabase.enabled }}
{{- .Values.externalDatabase.host }}
{{- else }}
{{- include "seraphc2.postgresql.fullname" . }}
{{- end }}
{{- end }}

{{/*
Database port
*/}}
{{- define "seraphc2.database.port" -}}
{{- if .Values.externalDatabase.enabled }}
{{- .Values.externalDatabase.port }}
{{- else }}
{{- 5432 }}
{{- end }}
{{- end }}

{{/*
Database name
*/}}
{{- define "seraphc2.database.name" -}}
{{- if .Values.externalDatabase.enabled }}
{{- .Values.externalDatabase.database }}
{{- else }}
{{- .Values.postgresql.auth.database }}
{{- end }}
{{- end }}

{{/*
Database username
*/}}
{{- define "seraphc2.database.username" -}}
{{- if .Values.externalDatabase.enabled }}
{{- .Values.externalDatabase.username }}
{{- else }}
{{- .Values.postgresql.auth.username }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "seraphc2.redis.host" -}}
{{- if .Values.externalRedis.enabled }}
{{- .Values.externalRedis.host }}
{{- else }}
{{- printf "%s-master" (include "seraphc2.redis.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Redis port
*/}}
{{- define "seraphc2.redis.port" -}}
{{- if .Values.externalRedis.enabled }}
{{- .Values.externalRedis.port }}
{{- else }}
{{- 6379 }}
{{- end }}
{{- end }}

{{/*
Image name
*/}}
{{- define "seraphc2.image" -}}
{{- $registry := .Values.image.registry | default .Values.global.imageRegistry }}
{{- if $registry }}
{{- printf "%s/%s:%s" $registry .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- else }}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- end }}
{{- end }}

{{/*
PostgreSQL image name
*/}}
{{- define "seraphc2.postgresql.image" -}}
{{- $registry := .Values.postgresql.image.registry | default .Values.global.imageRegistry }}
{{- if $registry }}
{{- printf "%s/%s:%s" $registry .Values.postgresql.image.repository .Values.postgresql.image.tag }}
{{- else }}
{{- printf "%s:%s" .Values.postgresql.image.repository .Values.postgresql.image.tag }}
{{- end }}
{{- end }}

{{/*
Redis image name
*/}}
{{- define "seraphc2.redis.image" -}}
{{- $registry := .Values.redis.image.registry | default .Values.global.imageRegistry }}
{{- if $registry }}
{{- printf "%s/%s:%s" $registry .Values.redis.image.repository .Values.redis.image.tag }}
{{- else }}
{{- printf "%s:%s" .Values.redis.image.repository .Values.redis.image.tag }}
{{- end }}
{{- end }}

{{/*
Storage class
*/}}
{{- define "seraphc2.storageClass" -}}
{{- .Values.global.storageClass | default "" }}
{{- end }}

{{/*
Image pull secrets
*/}}
{{- define "seraphc2.imagePullSecrets" -}}
{{- $secrets := .Values.image.pullSecrets | default .Values.global.imagePullSecrets }}
{{- if $secrets }}
imagePullSecrets:
{{- range $secrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}
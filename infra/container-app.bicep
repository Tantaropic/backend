@description('Location for resources')
param location string

@description('Project name prefix')
param projectName string

@description('Container image')
param containerImage string

@description('Target port')
param targetPort int

@description('Log Analytics customer ID')
param logAnalyticsCustomerId string

@description('Log Analytics shared key')
@secure()
param logAnalyticsSharedKey string

@description('Azure Container Registry login server')
param containerRegistryServer string

@description('Resource ID of the managed identity used to pull container images')
param containerRegistryIdentityResourceId string

@description('Neon PostgreSQL connection string')
@secure()
param databaseUrl string

@description('GitHub token for GitHub Models')
@secure()
param githubToken string

@description('App Insights connection string')
@secure()
param appInsightsConnectionString string

// ========================================
// Container Apps Environment
// ========================================
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${projectName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

// ========================================
// Container App
// ========================================
module containerApp 'br/public:avm/res/app/container-app:0.22.0' = {
  name: '${projectName}-api'
  params: {
    name: '${projectName}-api'
    location: location
    environmentResourceId: environment.id
    containers: [
      {
        name: '${projectName}-api'
        image: containerImage
        resources: {
          cpu: json('0.25')
          memory: '0.5Gi'
        }
        env: [
          {
            name: 'DATABASE_URL'
            secretRef: 'db-url'
          }
          {
            name: 'GITHUB_TOKEN'
            secretRef: 'github-token'
          }
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            secretRef: 'appinsights-conn'
          }
          {
            name: 'PORT'
            value: '${targetPort}'
          }
          {
            name: 'BASE_URL'
            value: 'http://localhost:${targetPort}/api/v1'
          }
        ]
        probes: [
          {
            type: 'Startup'
            tcpSocket: {
              port: targetPort
            }
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 10
            timeoutSeconds: 3
          }
          {
            type: 'Liveness'
            tcpSocket: {
              port: targetPort
            }
            periodSeconds: 30
            failureThreshold: 3
            timeoutSeconds: 3
          }
          {
            type: 'Readiness'
            tcpSocket: {
              port: targetPort
            }
            periodSeconds: 10
            failureThreshold: 3
            timeoutSeconds: 3
          }
        ]
      }
    ]
    ingressExternal: true
    ingressTargetPort: targetPort
    ingressTransport: 'http'
    ingressAllowInsecure: false
    managedIdentities: {
      userAssignedResourceIds: [
        containerRegistryIdentityResourceId
      ]
    }
    registries: [
      {
        server: containerRegistryServer
        identity: containerRegistryIdentityResourceId
      }
    ]
    secrets: [
      {
        name: 'db-url'
        value: databaseUrl
      }
      {
        name: 'github-token'
        value: githubToken
      }
      {
        name: 'appinsights-conn'
        value: appInsightsConnectionString
      }
    ]
    activeRevisionsMode: 'Single'
    maxInactiveRevisions: 3
    scaleSettings: {
      minReplicas: 1
      maxReplicas: 1
    }
  }
}

// ========================================
// Outputs
// ========================================
output fqdn string = containerApp.outputs.fqdn
output name string = containerApp.outputs.name
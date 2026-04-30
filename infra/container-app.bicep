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
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${projectName}-api'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'http'
        allowInsecure: false
      }
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
    }
    template: {
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
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// ========================================
// Outputs
// ========================================
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output name string = containerApp.name
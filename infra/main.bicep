targetScope = 'resourceGroup'

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Project name used as prefix for all resources')
param projectName string = 'tantaropic'

@description('Container image to deploy')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container app target port')
param targetPort int = 3000

@description('Neon PostgreSQL connection string')
@secure()
param databaseUrl string

@description('GitHub Models token for AI Emotional Engine')
@secure()
param githubToken string

@description('Application Insights connection string (output from monitoring module)')
var appInsightsConnectionString = monitoring.outputs.appInsightsConnectionString

// ========================================
// Module: Monitoring (Log Analytics + App Insights)
// ========================================
module monitoring 'monitoring.bicep' = {
  name: '${projectName}-monitoring'
  params: {
    location: location
    projectName: projectName
  }
}

// ========================================
// Module: Container App (Environment + App)
// ========================================
module containerApp 'container-app.bicep' = {
  name: '${projectName}-container-app'
  params: {
    location: location
    projectName: projectName
    containerImage: containerImage
    targetPort: targetPort
    logAnalyticsCustomerId: monitoring.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: monitoring.outputs.logAnalyticsSharedKey
    databaseUrl: databaseUrl
    githubToken: githubToken
    appInsightsConnectionString: appInsightsConnectionString
  }
}

// ========================================
// Outputs
// ========================================
output containerAppUrl string = containerApp.outputs.fqdn
output appInsightsName string = monitoring.outputs.appInsightsName
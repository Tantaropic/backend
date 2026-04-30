@description('Location for resources')
param location string

@description('Project name prefix')
param projectName string

// ========================================
// Log Analytics Workspace
// ========================================
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${projectName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ========================================
// Application Insights
// ========================================
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${projectName}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ========================================
// Outputs
// ========================================
output logAnalyticsCustomerId string = logAnalytics.properties.customerId

@description('Log Analytics shared key for Container Apps Environment')
output logAnalyticsSharedKey string = logAnalytics.listKeys().primarySharedKey

output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsName string = appInsights.name
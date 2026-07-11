using '../main.bicep'

param projectName = 'tantaropic'
param location = 'eastus'
param containerImage = 'mcr.microsoft.com/k8se/quickstart:latest'
param containerRegistryName = 'tantaropicprodacr'
param targetPort = 3000
param databaseUrl = '' // Set via CLI: --parameters databaseUrl='postgresql://...'
param githubToken = ''  // Set via CLI: --parameters githubToken='ghp_...'
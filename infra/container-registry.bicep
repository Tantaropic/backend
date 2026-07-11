@description('Location for resources')
param location string

@description('Project name prefix')
param projectName string

@description('Globally unique Azure Container Registry name')
param containerRegistryName string

// A dedicated pull identity avoids registry passwords and makes first-time
// deployments deterministic: the AcrPull grant exists before the app starts.
module containerPullIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.5.0' = {
  name: '${projectName}-acr-pull-identity'
  params: {
    name: '${projectName}-acr-pull'
    location: location
    tags: {
      workload: projectName
      purpose: 'container-image-pull'
    }
  }
}

module containerRegistry 'br/public:avm/res/container-registry/registry:0.12.0' = {
  name: '${projectName}-container-registry'
  params: {
    name: containerRegistryName
    location: location
    acrAdminUserEnabled: false
    acrSku: 'Basic'
    networkRuleSetDefaultAction: 'Allow'
    publicNetworkAccess: 'Enabled'
    retentionPolicyStatus: 'disabled'
    softDeletePolicyStatus: 'disabled'
    zoneRedundancy: 'Disabled'
    lock: {
      kind: 'CanNotDelete'
      notes: 'Protects the production image registry from accidental deletion.'
    }
    roleAssignments: [
      {
        principalId: containerPullIdentity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: 'AcrPull'
        description: 'Allow the Container App pull identity to retrieve application images.'
      }
    ]
    tags: {
      workload: projectName
      environment: 'production'
    }
  }
}

output loginServer string = containerRegistry.outputs.loginServer
output name string = containerRegistry.outputs.name
output resourceId string = containerRegistry.outputs.resourceId
output pullIdentityResourceId string = containerPullIdentity.outputs.resourceId
output pullIdentityPrincipalId string = containerPullIdentity.outputs.principalId

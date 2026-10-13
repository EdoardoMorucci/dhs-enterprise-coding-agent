// Neutral bind/identity policy lives below delegation so internal verification stays provider-free.
export { checkBindPermissions, currentHostIdentity, selectWorkerIdentity, assertPosixPermission, assertDockerIdentity, type HostIdentity, type WorkerIdentity } from '@company/company-verification';

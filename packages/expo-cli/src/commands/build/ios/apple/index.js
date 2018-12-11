import authenticate from './authenticate';
import createDistributionCertManager from './distributionCert';
import createPushKeyManager from './pushKey';
import createProvisioningProfileManager from './provisioningProfile';

const createManagers = ctx => ({
  distributionCert: createDistributionCertManager(ctx),
  pushKey: createPushKeyManager(ctx),
  provisioningProfile: createProvisioningProfileManager(ctx),
});

export { authenticate, createManagers };

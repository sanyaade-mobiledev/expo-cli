import { Credentials } from 'xdl';

import prompt from './prompt';
import revoke from './revoke';
import { generate, determineMissingCredentials } from './generate';
import { PLATFORMS } from '../../constants';
import log from '../../../../log';

async function fetch(projectMetadata) {
  return await Credentials.getEncryptedCredentialsForPlatformAsync({
    ...projectMetadata,
    platform: PLATFORMS.IOS,
  });
}

async function update(projectMetadata, credentials, userCredentialsIds) {
  return await Credentials.updateCredentialsForPlatform(
    PLATFORMS.IOS,
    credentials,
    userCredentialsIds,
    projectMetadata
  );
}

async function clear({ username, experienceName, bundleIdentifier }, only) {
  await Credentials.removeCredentialsForPlatform(PLATFORMS.IOS, {
    username,
    experienceName,
    bundleIdentifier,
    only,
  });
  log.warn('Removed existing credentials from expo servers');
}

export { fetch, update, generate, clear, revoke, determineMissingCredentials, prompt };

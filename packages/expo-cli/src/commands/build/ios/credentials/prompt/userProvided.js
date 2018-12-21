import untildify from 'untildify';
import path from 'path';

import { readFileIfExists } from './utils';
import * as consts from '../constants';
import log from '../../../../../log';
import _prompt from '../../../../../prompt';
import * as validators from '../../../../utils/validators';

const EXPERT_PROMPT = `
WARNING! In this mode, we won't be able to make sure your Distribution Certificate,
Push Notifications service key or Provisioning Profile are valid. Please double check
that you're uploading valid files for your app otherwise you may encounter strange errors!

Make sure you've created your app ID on the developer portal, that your app ID
is in app.json as \`bundleIdentifier\`, and that the provisioning profile you
upload matches that team ID and app ID.
`;

async function promptForCredentials(appleCtx, types, printWarning = true) {
  if (printWarning) {
    log(EXPERT_PROMPT);
  }
  const credentials = {};
  for (const _type of types) {
    const value = {};
    const { name, required, questions } = consts.CREDENTIALS[_type];
    log(`Please provide your ${name}:`);
    for (const i of required) {
      const question = questions[i];
      const answer = await _askQuestionAndProcessAnswer(question);
      value[i] = answer;
    }
    const valueKeys = Object.keys(value);
    credentials[_type] = valueKeys.length === 1 ? value[valueKeys[0]] : value;
  }
  return credentials;
}

async function _askQuestionAndProcessAnswer(definition) {
  const questionObject = _buildQuestionObject(definition);
  const { input } = await _prompt(questionObject);
  return await _processAnswer(definition, input);
}

function _buildQuestionObject({ type: _type, question }) {
  const inputType = _type === 'password' ? 'password' : 'input';
  const questionObject = {
    type: inputType,
    name: 'input',
    message: question,
  };

  if (_type === 'file') {
    questionObject.filter = _produceAbsolutePath;
    questionObject.validate = validators.existingFile;
  } else {
    questionObject.validate = validators.nonEmptyInput;
  }

  return questionObject;
}

async function _processAnswer({ type: _type, base64Encode }, input) {
  if (_type === 'file') {
    return readFileIfExists(input, base64Encode);
  } else {
    return input;
  }
}

const _produceAbsolutePath = filePath => {
  const untildified = untildify(filePath.trim());
  return !path.isAbsolute(untildified) ? path.resolve(untildified) : untildified;
};

export default promptForCredentials;

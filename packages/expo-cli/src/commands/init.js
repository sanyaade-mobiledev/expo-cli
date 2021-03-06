import chalk from 'chalk';
import fs from 'fs';
import { Exp } from 'xdl';
import { Snippet } from 'enquirer';
import semver from 'semver';
import set from 'lodash/set';
import spawnAsync from '@expo/spawn-async';
import npmPackageArg from 'npm-package-arg';
import wordwrap from 'wordwrap';

import prompt from '../prompt';
import log from '../log';
import CommandError from '../CommandError';

import path from 'path';

const FEATURED_TEMPLATES = [
  {
    shortName: 'blank',
    name: 'expo-template-blank',
    description: 'minimum dependencies to run and an empty root component',
  },
  {
    shortName: 'tabs',
    name: 'expo-template-tabs',
    description: 'several example screens and tabs using react-navigation',
  },
];

let _downloadIsSlowPrompt = false;

async function action(projectDir, options) {
  let parentDir;
  let dirName;

  if (projectDir) {
    let root = path.resolve(projectDir);
    parentDir = path.dirname(root);
    dirName = path.basename(root);
    let validationResult = validateName(parentDir, dirName);
    if (validationResult !== true) {
      throw new CommandError('INVALID_PROJECT_DIR', validationResult);
    }
  } else {
    parentDir = process.cwd();
  }

  let templateSpec;
  if (options.template) {
    templateSpec = npmPackageArg(options.template);

    // For backwards compatibility, 'blank' and 'tabs' are aliases for
    // 'expo-template-blank' and 'expo-template-tabs', respectively.
    if ((templateSpec.name === 'blank' || templateSpec.name === 'tabs') && templateSpec.registry) {
      templateSpec.name = templateSpec.escapedName = `expo-template-${templateSpec.name}`;
    }
  } else {
    ({ templateSpec } = await prompt({
      type: 'list',
      name: 'templateSpec',
      message: 'Choose a template:',
      choices: FEATURED_TEMPLATES.map(template => ({
        value: template.name,
        name:
          chalk.bold(template.shortName) +
          '\n' +
          wordwrap(2, process.stdout.columns || 80)(template.description),
        short: template.name,
      })),
    }));
  }

  let workflow;
  if (options.workflow) {
    if (options.workflow === 'managed' || options.workflow === 'advanced') {
      workflow = options.workflow;
    } else {
      throw new CommandError(
        'BAD_ARGS',
        `Invalid --workflow: '${options.workflow}'. Valid choices are: managed, advanced`
      );
    }
  } else {
    workflow = await promptForWorkflowAsync();
  }

  let initialConfig = await promptForInitialConfig(parentDir, dirName, workflow);

  let packageManager;
  if (options.yarn) {
    packageManager = 'yarn';
  } else if (options.npm) {
    packageManager = 'npm';
  } else {
    packageManager = (await shouldUseYarnAsync()) ? 'yarn' : 'npm';
  }

  let projectPath = await downloadAndExtractTemplate(
    templateSpec,
    parentDir,
    dirName,
    packageManager,
    workflow,
    initialConfig
  );
  let cdPath = path.relative(process.cwd(), projectPath);
  if (cdPath.length > projectPath.length) {
    cdPath = projectPath;
  }
  log.nested(`\nYour project is ready at ${projectPath}`);
  log.nested(`To get started, you can type:\n`);
  if (cdPath) {
    // empty string if project was created in current directory
    log.nested(`  cd ${cdPath}`);
  }
  log.nested(`  ${packageManager} start\n`);
}

async function downloadAndExtractTemplate(
  templateSpec,
  parentDir,
  dirName,
  packageManager,
  workflow,
  initialConfig
) {
  return Exp.extractTemplateApp(
    templateSpec,
    path.join(parentDir, dirName || initialConfig.slug),
    packageManager,
    workflow,
    initialConfig
  );
}

function validateName(parentDir, name) {
  if (!/^[a-z0-9@.\-_]+$/i.test(name)) {
    return 'The project name can only contain URL-friendly characters.';
  }
  if (typeof name !== 'string' || name === '') {
    return 'The project name can not be empty.';
  }
  let dir = path.join(parentDir, name);
  if (!isNonExistentOrEmptyDir(dir)) {
    return `The path "${dir}" already exists. Please choose a different parent directory or project name.`;
  }
  return true;
}

function isNonExistentOrEmptyDir(dir) {
  try {
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return true;
    }
    throw error;
  }
}

async function shouldUseYarnAsync() {
  try {
    let version = (await spawnAsync('yarnpkg', ['--version'])).stdout.trim();
    if (!semver.valid(version)) {
      return false;
    }
    let answer = await prompt({
      type: 'confirm',
      name: 'useYarn',
      message: `Yarn v${version} found. Use Yarn to install dependencies?`,
    });
    return answer.useYarn;
  } catch (e) {
    return false;
  }
}

async function promptForWorkflowAsync() {
  let answer = await prompt({
    type: 'list',
    name: 'workflow',
    message: 'Choose which workflow to use:',
    choices: [
      {
        value: 'managed',
        name:
          chalk.bold('managed') +
          ' (default)' +
          '\n' +
          wordwrap(2, process.stdout.columns || 80)(
            'Build your app with JavaScript with Expo APIs.'
          ),
        short: 'managed',
      },

      {
        value: 'advanced',
        name:
          chalk.bold('advanced') +
          ' (experimental 🚧)' +
          '\n' +
          wordwrap(2, process.stdout.columns || 80)(
            'Build your app with JavaScript with Expo APIs and custom native modules.'
          ),
        short: 'advanced',
      },
    ],
  });
  return answer.workflow;
}

async function promptForInitialConfig(parentDir, dirName, workflow) {
  let template = {
    expo: {
      name: '{{name}}',
      slug: '{{slug}}',
    },
  };

  if (workflow === 'advanced') {
    template.android = {
      package: '{{android.package}}',
    };
    template.ios = {
      bundleIdentifier: '{{ios.bundleIdentifier}}',
    };
  }

  let { values } = await new Snippet({
    name: 'expo',
    message:
      'Please enter a few initial configuration values.\n  Read more: https://docs.expo.io/versions/latest/workflow/configuration',
    required: true,
    fields: [
      {
        name: 'name',
        message: 'The name of your app visible on the home screen',
        filter: name => name.trim(),
        required: true,
      },
      {
        name: 'slug',
        message: 'A URL friendly name for your app',
        initial: dirName,
        filter: name => name.trim(),
        validate: name => validateName(parentDir, name),
        required: true,
      },
      {
        name: 'android.package',
        message: 'The package name for your Android app',
        validate: value =>
          /^[a-zA-Z][a-zA-Z0-9\_]*(\.[a-zA-Z][a-zA-Z0-9\_]*)+$/.test(value)
            ? true
            : "Only alphanumeric characters, '.' and '_' are allowed, and each '.' must be followed by a letter.",
        required: true,
      },
      {
        name: 'ios.bundleIdentifier',
        message: 'The bundle identifier for your iOS app',
        validate: value =>
          /^[a-zA-Z][a-zA-Z0-9\-\.]+$/.test(value)
            ? true
            : "Must start with a letter and only alphanumeric characters, '.' and '-' are allowed.",
        required: true,
      },
    ],
    initial: 'slug',
    template: JSON.stringify(template, null, 2),
  }).run();
  let config = {};
  for (let key of Object.keys(values)) {
    set(config, key, values[key]);
  }
  return config;
}

export default program => {
  program
    .command('init [project-dir]')
    .alias('i')
    .description(
      'Initializes a directory with an example project. Run it without any options and you will be prompted for the name and type.'
    )
    .option(
      '-t, --template [name]',
      'Specify which template to use. Valid options are "blank", "tabs" or any npm package that includes an Expo project template.'
    )
    .option('--npm', 'Use npm to install dependencies. (default when Yarn is not installed)')
    .option('--yarn', 'Use Yarn to install dependencies. (default when Yarn is installed)')
    .option('--workflow [name]', 'The workflow to use.')
    .asyncAction(action);
};

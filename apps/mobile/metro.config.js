const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

// pnpm workspace (hoisted): Metro must watch the shared packages and resolve from the repo root.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];
config.resolver.unstable_enablePackageExports = true;
module.exports = config;

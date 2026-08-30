const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// This project lives at a path containing a space ("CalAI app"). Three upstream
// iOS build scripts interpolate paths into a shell command without quoting them,
// so bash word-splits the path and the build dies (or, worse, silently no-ops).
// Everything below re-quotes those call sites. It runs on every prebuild, which
// is the point: `ios/` is gitignored and generated, so hand-patching it does not
// survive. Delete this plugin if the project is ever moved to a space-free path.

// 1. React Native's bundle phase resolves react-native-xcode.sh via a bare
//    backtick substitution and then executes the result unquoted.
function withQuotedBundlePhase(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};

    for (const key of Object.keys(phases)) {
      const phase = phases[key];
      if (!phase || typeof phase.shellScript !== 'string') continue;
      if (!phase.shellScript.includes('react-native-xcode.sh')) continue;

      // The script is stored as a quoted, escaped pbxproj string literal.
      const unescaped = JSON.parse(phase.shellScript);
      const patched = unescaped.replace(
        /`("\$NODE_BINARY".*?react-native-xcode\.sh'"\s*)`/s,
        (_match, inner) => `RN_XCODE_SCRIPT=$(${inner})\n/bin/sh "$RN_XCODE_SCRIPT"`
      );

      if (patched !== unescaped) {
        phase.shellScript = JSON.stringify(patched);
      }
    }

    return cfg;
  });
}

// 2. expo-constants' podspec builds its script phase as
//    `bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"`, and
// 3. get-app-config-ios.sh itself runs `basename $PROJECT_DIR` unquoted, which
//    word-splits to "CalAI" instead of "Pods" and makes the script exit 0
//    early — so app.config never lands in EXConstants.bundle and
//    Constants.expoConfig is null at runtime. Rather than duplicate the
//    script's logic, run a quoted copy of the pristine upstream file.
const POST_INSTALL_HOOK = `
    # Injected by plugins/with-space-safe-ios-build.js — quote paths in generated
    # script phases so a project path containing spaces is not word-split.
    installer.pods_project.targets.each do |target|
      target.build_phases.each do |phase|
        next unless phase.respond_to?(:shell_script) && phase.shell_script
        next unless phase.shell_script.include?('get-app-config-ios.sh')
        phase.shell_script = <<~'SPACESAFE'
          set -eo pipefail
          SRC="$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"
          PATCHED="$DERIVED_FILE_DIR/get-app-config-ios.spacesafe.sh"
          mkdir -p "$DERIVED_FILE_DIR"
          sed 's/basename \\$PROJECT_DIR/basename "$PROJECT_DIR"/' "$SRC" > "$PATCHED"
          bash -l "$PATCHED"
        SPACESAFE
      end
    end
`;

function withQuotedAppConfigPhase(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');

      if (contents.includes('with-space-safe-ios-build.js')) return cfg;

      // Splice in *before* the `end` that closes `post_install do |installer|`,
      // so the hook can still see `installer`.
      const marker = 'react_native_post_install(';
      const markerAt = contents.indexOf(marker);
      const blockEnd = markerAt === -1 ? -1 : contents.indexOf('\n  end', markerAt);

      if (blockEnd === -1) {
        throw new Error(
          'with-space-safe-ios-build: could not find the post_install block in the generated Podfile.'
        );
      }

      fs.writeFileSync(
        podfile,
        contents.slice(0, blockEnd) + '\n' + POST_INSTALL_HOOK + contents.slice(blockEnd)
      );

      return cfg;
    },
  ]);
}

module.exports = function withSpaceSafeIosBuild(config) {
  return withQuotedAppConfigPhase(withQuotedBundlePhase(config));
};

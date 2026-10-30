import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import webExt from 'web-ext';
import Client, { signAddon } from 'web-ext/util/submit-addon';
import { sha256, verifyArtifact } from './verify-release-artifact.mjs';

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve('web-ext'));
const version = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
if (version !== '10.8.0') throw new Error('ARTIFACT_GUARD_REJECTED: review web-ext hooks before changing version');
const rejectSavedUpload = file => {
  if (existsSync(file)) throw new Error('ARTIFACT_GUARD_REJECTED: saved AMO upload UUID has no verified SHA-256 binding; manual reconciliation required');
};

// 公開 main API に CLI 引数・環境変数・設定読込を任せ、sign の submit hook だけを差し替える。
await webExt.main(packageDir, {
  commands: {
    ...webExt.cmd,
    sign: (params, options) => webExt.cmd.sign(params, {
      ...options,
      submitAddon: async args => {
        rejectSavedUpload(args.savedUploadUuidPath);
        if (args.submissionSource) throw new Error('ARTIFACT_GUARD_REJECTED: separate source archive requires its own verification');
        let verified;
        try {
          verified = await verifyArtifact(args.xpiPath, 'firefox');
        } catch (error) {
          throw new Error(`ARTIFACT_GUARD_REJECTED: ${error.message}`, { cause: error });
        }
        class VerifiedClient extends Client {
          async getPreviousUuidOrUploadXpi(...uploadArgs) {
            rejectSavedUpload(uploadArgs[2]);
            return super.getPreviousUuidOrUploadXpi(...uploadArgs);
          }
          fileFromSync(file) {
            if (path.resolve(file) !== verified.path) throw new Error('ARTIFACT_GUARD_REJECTED: upload path changed');
            const bytes = readFileSync(file);
            if (sha256(bytes) !== verified.sha256) throw new Error('ARTIFACT_GUARD_REJECTED: upload bytes changed');
            // 検証した同じ Buffer から multipart File を作り、再読込の隙間を作らない。
            return new File([bytes], path.basename(file));
          }
        }
        return signAddon({ ...args, SubmitClient: VerifiedClient });
      },
    }),
  },
});

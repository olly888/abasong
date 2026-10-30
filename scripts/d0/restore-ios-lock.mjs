import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const source = new URL('apps/mobile/native-locks/Podfile.lock', root);
const target = new URL('apps/mobile/ios/Podfile.lock', root);
if (!existsSync(new URL('apps/mobile/ios/Podfile', root))) throw new Error('Run Expo prebuild first');
copyFileSync(fileURLToPath(source), fileURLToPath(target));
console.log('Restored reviewed iOS native dependency lock');

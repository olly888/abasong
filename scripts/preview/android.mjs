import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
const exec = promisify(execFile);
const helper = './scripts/android';
const serial = 'emulator-5556';
const avd = 'Abasong_D0_API37';
const sdk = process.env.ABASONG_ANDROID_HOME ?? `${process.cwd()}/.tooling/android-sdk`;
function run(file,args,options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(file,args,{stdio:'inherit',...options});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error('Preview command failed')));
  });
}
async function main() {
  const status = await fetch('http://127.0.0.1:8081/status',{signal:AbortSignal.timeout(3000)}).then(r=>r.text()).catch(()=>null);
  if (status?.trim() !== 'packager-status:running') throw new Error('请先在另一个终端运行 ./scripts/dev preview:native');
  const mirror = '/opt/homebrew/bin/scrcpy';
  if (!existsSync(mirror)) throw new Error('scrcpy required: brew install scrcpy');
  const devices = (await exec(helper,['adb','devices'])).stdout;
  if (!devices.includes(serial)) {
    mkdirSync('.tooling/preview',{recursive:true});
    const log=openSync('.tooling/preview/android-emulator.log','a');
    const child=spawn(helper,['emulator','-avd',avd,'-port','5556','-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','swiftshader'],{stdio:['ignore',log,log],detached:true});
    child.on('error',()=>console.error('Android emulator failed to start'));
    child.unref();closeSync(log);
    console.log('正在启动 Android 模拟器…');
  }
  let booted=false;
  for(let n=0;n<120;n++) {
    const result=await exec(helper,['adb','-s',serial,'shell','getprop','sys.boot_completed']).catch(()=>null);
    if(result?.stdout.trim()==='1') { booted=true; break; }
    await pause(1000);
  }
  if(!booted) throw new Error('Android 启动超时，查看 .tooling/preview/android-emulator.log');
  const name=(await exec(helper,['adb','-s',serial,'emu','avd','name'])).stdout;
  if(!name.split(/\r?\n/).includes(avd)) throw new Error('5556端口属于其他模拟器；未安装或修改该设备');
  const apk='apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk';
  if(!existsSync(apk)||process.argv.includes('--rebuild')) await run(helper,['gradle',':app:assembleDebug','-PreactNativeArchitectures=arm64-v8a','--console=plain']);
  await run(helper,['adb','-s',serial,'install','-r',apk]);
  await run(helper,['adb','-s',serial,'reverse','tcp:8081','tcp:8081']);
  await run(helper,['adb','-s',serial,'shell','am','start','-a','android.intent.action.VIEW','-d','exp+abasong://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081','com.abasong.mobile']);
  console.log('Android 实时预览已连接；关闭画面窗口不关闭 Metro。');
  await run(mirror,['-s',serial,'--window-title','Abasong · Android','--max-size','1100','--no-audio'],{env:{...process.env,ADB:`${sdk}/platform-tools/adb`}});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

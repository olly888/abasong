import assert from 'node:assert/strict';
import { createServer, request as rawHttpRequest, type Server } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Client } from 'pg';
import { localTarget } from '../d0/database-target';

async function listen(server:Server) {
  server.listen(0,'127.0.0.1'); await once(server,'listening'); return (server.address() as {port:number}).port;
}
async function main() {
  const env=parseEnv(readFileSync('.env','utf8'));
  const adminUrl=localTarget(env.DATABASE_ADMIN_URL); assert.equal(adminUrl.username,'postgres');
  const runtimeUrl=localTarget(env.DATABASE_URL); assert.equal(runtimeUrl.username,'abasong_api_local');
  const databaseName=`abasong_d1_auth_test_${randomBytes(8).toString('hex')}`;
  const bootstrap=new Client({connectionString:adminUrl.href}); await bootstrap.connect();
  let created=false, database:Client|undefined, api:ChildProcess|undefined;
  let providerAvailable=true, providerInvalid=false;
  const keypair=await generateKeyPair('ES256',{extractable:true});
  const key={...await exportJWK(keypair.publicKey),kid:'d1-current-key',alg:'ES256',use:'sig'};
  const provider=createServer((req,res)=>{
    if(req.url!=='/auth/v1/.well-known/jwks.json') {res.writeHead(404).end();return;}
    if(!providerAvailable) {res.writeHead(503).end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(providerInvalid?{}:{keys:[key]}));
  });
  const providerPort=await listen(provider), issuer=`http://127.0.0.1:${providerPort}/auth/v1`;
  let apiPort=0, checks=0;
  const issuedAt=Math.floor(Date.now()/1000)-60, actor=randomUUID(), other=randomUUID();
  async function token(overrides:Record<string,unknown>={},user=actor,privateKey=keypair.privateKey) {
    return new SignJWT({role:'authenticated',capabilities:['ops.user_manage','access.read'],sub:user,iat:issuedAt,exp:Math.floor(Date.now()/1000)+3600,iss:issuer,aud:'authenticated',...overrides})
      .setProtectedHeader({alg:'ES256',kid:key.kid}).sign(privateKey);
  }
  async function stop() {
    if(!api||api.exitCode!==null||api.signalCode!==null) return;
    const exit=once(api,'exit'); api.kill('SIGTERM');
    await Promise.race([exit,pause(5000).then(()=>{if(api&&api.exitCode===null&&api.signalCode===null) api.kill('SIGKILL');})]);
  }
  async function start(overrides:Record<string,string>={}) {
    await stop();
    const portServer=createServer();apiPort=await listen(portServer);await new Promise<void>(resolve=>portServer.close(()=>resolve()));
    api=spawn(process.execPath,['apps/api/dist/main.js'],{stdio:'ignore',env:{...process.env,...env,NODE_ENV:'test',DATABASE_URL:runtimeUrl.href,API_HOST:'127.0.0.1',API_PORT:String(apiPort),AUTH_ISSUER:issuer,AUTH_AUDIENCE:'authenticated',AUTH_JWT_ALGORITHM:'ES256',IDEMPOTENCY_HMAC_KEY:randomBytes(32).toString('hex'),IDEMPOTENCY_RETENTION_SECONDS:'3600',...overrides}});
    for(let n=0;n<80;n++) {
      try {if((await fetch(`http://127.0.0.1:${apiPort}/health/live`,{signal:AbortSignal.timeout(1000)})).ok) return;} catch { /* process starting */ }
      if(api.exitCode!==null) throw new Error('Test API did not start');
      await pause(100);
    }
    throw new Error('Test API startup timeout');
  }
  async function request(path:string,auth:string|undefined,status:number,options:{body?:unknown;key?:string;raw?:string;code?:string;headers?:Record<string,string>}={}) {
    const response=await fetch(`http://127.0.0.1:${apiPort}${path}`,{method:options.body!==undefined||options.raw!==undefined?'POST':'GET',headers:{...(auth?{Authorization:`Bearer ${auth}`}:{ }),...(options.key?{'Idempotency-Key':options.key}:{}),...(options.body!==undefined||options.raw!==undefined?{'Content-Type':'application/json'}:{}),...options.headers},body:options.raw??(options.body===undefined?undefined:JSON.stringify(options.body)),signal:AbortSignal.timeout(10000)});
    const result=await response.json(); assert.equal(response.status,status);
    assert.match(response.headers.get('x-request-id')??'',/^[a-f0-9-]{36}$/);
    assert.equal(response.headers.get('cache-control'),'no-store');
    if(status>=400) {assert.deepEqual(Object.keys(result).sort(),['code','message','request_id']);assert.equal(result.request_id,response.headers.get('x-request-id'));if(options.code) assert.equal(result.code,options.code);assert(!JSON.stringify(result).includes(auth??'impossible-credential'));}
    checks++; return result;
  }
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);created=true;
    adminUrl.pathname=`/${databaseName}`;runtimeUrl.pathname=`/${databaseName}`;
    database=new Client({connectionString:adminUrl.href});await database.connect();
    await database.query(readFileSync('database/migrations/0001_v12_initial.sql','utf8'));
    await start();
    const valid=await token();
    await request('/v1/me',undefined,401,{code:'AUTH_REQUIRED'});
    await request('/v1/me','not-a-token',401);
    await new Promise<void>((resolve,reject)=>{
      const duplicate=rawHttpRequest({hostname:'127.0.0.1',port:apiPort,path:'/v1/me',headers:{Authorization:[`Bearer ${valid}`,`Bearer ${valid}`]}},response=>{
        response.resume();response.on('end',()=>{try{assert.equal(response.statusCode,401);checks++;resolve();}catch(error){reject(error);}});
      });
      duplicate.on('error',reject);duplicate.end();
    });
    await request('/v1/me',await token({exp:issuedAt-1}),401,{code:'TOKEN_EXPIRED'});
    await request('/v1/me',await token({iss:'https://other-project.invalid/auth/v1'}),401);
    await request('/v1/me',await token({aud:'other-audience'}),401);
    await request('/v1/me',await token({nbf:Math.floor(Date.now()/1000)+3600}),401);
    await request('/v1/me',await token({iat:Math.floor(Date.now()/1000)+3600}),401);
    await request('/v1/me',await token({sub:'not-a-user-id'}),401);
    await request('/v1/me',await token({role:'service_role'}),401);
    await request('/v1/me',await token({role:'anon'}),401);
    await request('/v1/me',await token({is_anonymous:true}),401);
    const noExpiry=new SignJWT({sub:actor,role:'authenticated',iat:issuedAt,iss:issuer,aud:'authenticated'}).setProtectedHeader({alg:'ES256',kid:key.kid});
    await request('/v1/me',await noExpiry.sign(keypair.privateKey),401);
    const wrongKey=await generateKeyPair('ES256');await request('/v1/me',await token({},actor,wrongKey.privateKey),401);
    const hmac=await new SignJWT({sub:actor,role:'authenticated',iat:issuedAt,exp:issuedAt+3600,iss:issuer,aud:'authenticated'}).setProtectedHeader({alg:'HS256',kid:key.kid}).sign(randomBytes(32));
    await request('/v1/me',hmac,401);
    await request('/v1/me',valid,404);
    await request('/v1/me/bootstrap',valid,400,{body:{display_name:'Synthetic Driver',actor_id:other},key:randomUUID()});
    assert.equal((await database.query('SELECT count(*)::int AS n FROM abasong.users')).rows[0].n,0);
    await request('/v1/me/bootstrap',valid,400,{body:{display_name:'  '},key:randomUUID()});
    await request('/v1/me/bootstrap',valid,400,{body:{display_name:'Invalid\nName'},key:randomUUID()});
    await request('/v1/me/bootstrap',valid,400,{raw:'display_name=Synthetic',key:randomUUID(),headers:{'Content-Type':'application/x-www-form-urlencoded'}});
    await request('/v1/me/bootstrap',valid,400,{body:{display_name:'Synthetic Driver'}});
    await request('/v1/me/bootstrap',valid,400,{raw:'{"display_name":',key:randomUUID()});
    await request('/v1/me/bootstrap',valid,413,{body:{display_name:'x'.repeat(20000)},key:randomUUID()});
    const keyA=randomUUID(), body={display_name:'Synthetic Driver'};
    const me=await request('/v1/me/bootstrap',valid,200,{body,key:keyA});
    assert.equal(me.user_id,actor);assert.equal(me.profile.display_name,body.display_name);assert.deepEqual(me.capabilities,[]);
    assert.deepEqual(Object.keys(me).sort(),['capabilities','profile','status','user_id']);
    await request('/v1/me/bootstrap',valid,200,{body,key:keyA});
    assert.equal((await database.query('SELECT count(*)::int AS n FROM abasong.audit_events WHERE actor_id=$1',[actor])).rows[0].n,1);
    await request('/v1/me/bootstrap',valid,409,{body:{display_name:'Different intent'},key:keyA,code:'IDEMPOTENCY_CONFLICT'});
    const unchanged=await request('/v1/me/bootstrap',valid,200,{body:{display_name:'Does not overwrite existing profile'},key:randomUUID()});assert.equal(unchanged.profile.display_name,body.display_name);
    await request('/v1/me',valid,200,{headers:{'X-Request-ID':'untrusted-input'}});
    await request(`/v1/me?user_id=${other}`,valid,400);
    const otherToken=await token({},other);
    const otherMe=await request('/v1/me/bootstrap',otherToken,200,{body:{display_name:'Synthetic Other'},key:keyA});assert.equal(otherMe.user_id,other);assert.equal(otherMe.profile.user_id,other);
    await database.query("INSERT INTO abasong.capabilities(user_id,capability,reason,valid_from,valid_until,revoked_at) VALUES($1,'access.read','test',now()-interval '1 minute',now()+interval '1 hour',null),($1,'request.publish','expired',now()-interval '2 hours',now()-interval '1 hour',null),($1,'access.contribute','future',now()+interval '1 hour',now()+interval '2 hours',null),($1,'ops.user_manage','revoked',now()-interval '1 minute',null,now())",[actor]);
    assert.deepEqual((await request('/v1/me',valid,200)).capabilities,['access.read']);
    await database.query("UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1 AND capability='access.read'",[actor]);
    assert.deepEqual((await request('/v1/me',valid,200)).capabilities,[]);
    await database.query("UPDATE abasong.users SET status='suspended' WHERE id=$1",[actor]);
    await request('/v1/me',valid,403,{code:'ACCOUNT_SUSPENDED'});
    await request('/v1/me/bootstrap',valid,403,{body,key:randomUUID(),code:'ACCOUNT_SUSPENDED'});
    await database.query("UPDATE abasong.users SET status='active',session_invalid_before=$2 WHERE id=$1",[actor,new Date((issuedAt+1)*1000)]);
    await request('/v1/me',valid,401,{code:'SESSION_REVOKED'});
    await request('/v1/me/bootstrap',valid,401,{body,key:randomUUID(),code:'SESSION_REVOKED'});
    const refreshed=await token({iat:Math.floor(Date.now()/1000)});
    await request('/v1/me',refreshed,200);
    for(const status of ['deleting','deleted']) {
      await database.query('UPDATE abasong.users SET status=$2 WHERE id=$1',[actor,status]);
      await request('/v1/me',refreshed,403,{code:'ACCOUNT_UNAVAILABLE'});
      await request('/v1/me/bootstrap',refreshed,403,{body,key:randomUUID(),code:'ACCOUNT_UNAVAILABLE'});
    }
    await database.query("UPDATE abasong.users SET status='active',session_invalid_before=null WHERE id=$1",[actor]);
    await database.query('UPDATE abasong.profiles SET experience=$2 WHERE user_id=$1',[actor,JSON.stringify([{carrier:'Synthetic',region_label:'Test',description:'Test',source:'verified'}])]);
    await database.query("INSERT INTO abasong.experience_verifications(user_id,carrier,region_label,description,verified_by,valid_until) VALUES($1,'Synthetic Verified','Test','Test',$2,now()+interval '1 hour'),($1,'Expired Verification','Test','Test',$2,now()-interval '1 hour')",[actor,other]);
    const experience=(await request('/v1/me',valid,200)).profile.experience;assert.deepEqual(experience.map((x:{source:string})=>x.source),['self_reported','verified']);
    const concurrentActor=randomUUID(), concurrentToken=await token({},concurrentActor), concurrentKey=randomUUID();
    await Promise.all([request('/v1/me/bootstrap',concurrentToken,200,{body,key:concurrentKey}),request('/v1/me/bootstrap',concurrentToken,200,{body,key:concurrentKey})]);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM abasong.audit_events WHERE actor_id=$1',[concurrentActor])).rows[0].n,1);
    const idem=(await database.query('SELECT request_hmac FROM abasong.idempotency_keys WHERE actor_id=$1 AND key=$2',[actor,keyA])).rows[0];assert.equal(idem.request_hmac.length,32);
    await database.query("UPDATE abasong.idempotency_keys SET status='processing' WHERE actor_id=$1 AND key=$2",[actor,keyA]);
    await request('/v1/me/bootstrap',valid,409,{body,key:keyA,code:'REQUEST_IN_PROGRESS'});
    await database.query("UPDATE abasong.idempotency_keys SET expires_at=now()-interval '1 second' WHERE actor_id=$1 AND key=$2",[actor,keyA]);
    await request('/v1/me/bootstrap',valid,200,{body,key:keyA});
    providerAvailable=false;
    await request('/v1/me',valid,200); // Cached verification survives provider outage.
    await start();
    await request('/v1/me',valid,503,{code:'AUTH_PROVIDER_UNAVAILABLE'});
    providerAvailable=true;
    await request('/v1/me',valid,200);
    providerInvalid=true;await start();
    await request('/v1/me',valid,503,{code:'AUTH_PROVIDER_UNAVAILABLE'});
    providerInvalid=false;await start({IDEMPOTENCY_HMAC_KEY:''});
    await request('/v1/me/bootstrap',valid,503,{body,key:randomUUID(),code:'IDEMPOTENCY_NOT_CONFIGURED'});
    await request('/v1/me',valid,200);
    await start({AUTH_ISSUER:''});
    await request('/v1/me',undefined,401);
    await request('/v1/me',valid,503,{code:'AUTH_NOT_CONFIGURED'});
    console.log(`PASS: ${checks} real HTTP Auth/account scenarios with ephemeral ES256 JWKS and isolated PostgreSQL; no cloud users or SMS created`);
  } finally {
    await stop();await database?.end();
    await new Promise<void>(resolve=>provider.close(()=>resolve()));
    // Only the randomly named disposable database created by this run is eligible for deletion.
    if(created) {assert(/^abasong_d1_auth_test_[a-f0-9]{16}$/.test(databaseName));await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);}
    await bootstrap.end();
  }
}
main().catch(error=>{console.error(`Auth API integration verification failed (${error instanceof assert.AssertionError?'assertion':'setup/runtime'})`);process.exitCode=1;});

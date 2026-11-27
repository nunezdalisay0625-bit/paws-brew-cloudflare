import { buildPushPayload } from '@block65/webcrypto-web-push';
const MENU = new Map([
['Americano',69],['Spanish Latte',89],['Caramel Macchiato',89],['French Vanilla',89],['White Chocolate Mocha',89],['Mocha',89],['Drip Coffee',89],['Egg Coffee',120],
['Sparkling Blueberry',69],['Sparkling Lychee',69],['Sparkling Mango',69],
['Strawberry Milkshake',95],['Blueberry Milkshake',95],['Lychee Milkshake',95],['Mango Milkshake',95],['Mixed Berries Milkshake',125],
['Chocolate Heaven Waffles',149],['Classic Waffles',79],['Blueberry Waffles',149],['Strawberry Waffles',149],['Ham & Cheese',89],['Quesadilla',105],['Chicken Wrap',149],
['Italian Spaghetti',180],['Creamy Carbonara',180],['Pesto Pasta',180],['Bihon-Canton with Bagnet',150],
['Liempo Silog',180],['Porkchop Silog',149],['Boneless Chicken Silog',149],['Skinless Longganisa Silog',99],['Hotsilog',99],['Tocilog',99],['Bangsilog',149],['Steamed Rice',20],
['Chicken Strips',180],['Chicken Poppers',195],['Loaded Nachos',180],['Loaded Fries',90],['Empanada',105],['Cheese Sticks',100],['Potato Rolls',100],['Tofu Rolls',100],
['Pup Cup',45],['Chicken Pasta',65],['Liver Pasta',65],['Mixed Veggies',65],
['Paw Sunrise',75],['Paw Splash',75],['Blueberry Mojito',95],['Strawberry Mojito',95],['Watermelon Mojito',95],['Paws Rainbow',95],['Paws Tropical Colada',120],['Bottomless Tequila Mojito',450]
]);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const fail=(error,status=400)=>json({ok:false,error},status);
const normPhone=v=>String(v||'').replace(/[\s()-]/g,'');
const validPhone=v=>/^09\d{9}$/.test(v)||/^639\d{9}$/.test(v)||/^\+639\d{9}$/.test(v);
const uuid=()=>crypto.randomUUID();
const stamp=()=>new Date().toISOString();
const mapOrder=r=>({...r,orderReference:r.order_reference,items:JSON.parse(r.items_json||'[]'),deliveryFee:r.delivery_fee,paymentMethod:r.payment_method,paymentStatus:r.payment_status,gcashReferenceNumber:r.gcash_reference_number,paymentReferenceSubmittedAt:r.payment_reference_submitted_at,paymentVerifiedAt:r.payment_verified_at,createdAt:r.created_at});
const mapReservation=r=>({...r,pets:!!r.pets,createdAt:r.created_at});
const encoder=new TextEncoder();
const sessionCookieName='pb_staff_session';
const sessionLifetimeSeconds=43200;
function staffAllowlist(env){
 const emails=(env.ORDER_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 emails.push('nikka.lizardo@gmail.com','nunezdalisay0625@gmail.com');
 return new Set(emails);
}
async function passwordDigest(value){
 const key=await crypto.subtle.importKey('raw',encoder.encode(value),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode('paws-brew-staff-login-v1'),iterations:150000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function sha256Hex(value){
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function constantTimeEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
function sessionToken(request){
 const cookie=request.headers.get('Cookie')||'';
 const pair=cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(sessionCookieName+'='));
 return pair?decodeURIComponent(pair.slice(sessionCookieName.length+1)):'';
}
async function ensureSessionTable(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS paws_brew_staff_sessions (session_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)").run();
}
async function staffUser(request,env){
 if(!env.DB)return null;
 const token=sessionToken(request);if(!token)return null;
 try{
  const hash=await sha256Hex(token);
  const row=await env.DB.prepare('SELECT email, expires_at FROM paws_brew_staff_sessions WHERE session_hash=?').bind(hash).first();
  if(!row)return null;
  if(Date.parse(row.expires_at)<=Date.now()){
   await env.DB.prepare('DELETE FROM paws_brew_staff_sessions WHERE session_hash=?').bind(hash).run();
   return null;
  }
  const email=String(row.email||'').trim().toLowerCase();
  if(!staffAllowlist(env).has(email))return null;
  return {email,name:email.split('@')[0]};
 }catch{return null;}
}
async function ensurePushTable(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS paws_brew_push_subscriptions (endpoint TEXT PRIMARY KEY, email TEXT NOT NULL, subscription_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
}
async function notifyStaff(env,notification){
 if(!env.DB||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return;
 try{
  await ensurePushTable(env.DB);
  const {results=[]}=await env.DB.prepare('SELECT endpoint, subscription_json FROM paws_brew_push_subscriptions').all();
  const vapid={subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY};
  await Promise.allSettled(results.map(async row=>{
   try{
    const subscription=JSON.parse(row.subscription_json);
    const payload=await buildPushPayload({data:notification,options:{ttl:300,urgency:'high'}},subscription,vapid);
    const response=await fetch(subscription.endpoint,{...payload,signal:AbortSignal.timeout(8000)});
    if(response.status===404||response.status===410)await env.DB.prepare('DELETE FROM paws_brew_push_subscriptions WHERE endpoint=?').bind(row.endpoint).run();
    else if(!response.ok)console.error('Push delivery failed with status',response.status);
   }catch(error){console.error('Push delivery failed',error);}
  }));
 }catch(error){console.error('Could not send staff push notifications',error);}
}
function scheduleStaffNotification(ctx,env,notification){\n const task=notifyStaff(env,notification);\n if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(task);\n else task.catch(error=>console.error('Background push notification failed',error));\n}\nasync function body(request){try{return await request.json()}catch{return null}}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':url.origin,'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
  if(path==='/api/_healthcheck')return json({ok:true,service:'paws-brew-menu',database:!!env.DB,timezone:'Asia/Manila'});
  if(path==='/api/auth/config'&&method==='GET')return json({clientId:env.GOOGLE_CLIENT_ID||''});
  if(path==='/api/auth/google'&&method==='POST'){
   if(!env.DB)return fail('Staff login is unavailable because the Pages D1 database binding DB is not configured.',503);
   if(!env.GOOGLE_CLIENT_ID)return fail('Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID to Cloudflare Pages secrets.',503);
   const input=await body(request)||{},credential=String(input.credential||'');
   if(!credential||credential.length>10000)return fail('Google did not return a valid sign-in credential.',400);
   let identity;
   try{
    const verification=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential));
    if(!verification.ok)return fail('Google could not verify this sign-in. Please try again.',401);
    identity=await verification.json();
   }catch{return fail('Google sign-in could not reach Google for verification. Please try again.',502);}
   const email=String(identity.email||'').trim().toLowerCase();
   const expiresAtSeconds=Number(identity.exp||0);
   if(identity.aud!==env.GOOGLE_CLIENT_ID||identity.email_verified!=='true'||expiresAtSeconds<=Math.floor(Date.now()/1000)){
    return fail('Google sign-in verification failed. Please select your authorized Google account.',401);
   }
   if(!staffAllowlist(env).has(email))return fail('This Google account is not on the authorized staff list.',403);
   await ensureSessionTable(env.DB);
   const bytes=crypto.getRandomValues(new Uint8Array(32));
   const token=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
   const tokenHash=await sha256Hex(token),createdAt=stamp(),sessionExpiresAt=new Date(Date.now()+sessionLifetimeSeconds*1000).toISOString();
   await env.DB.prepare('INSERT INTO paws_brew_staff_sessions (session_hash,email,expires_at,created_at) VALUES (?,?,?,?)').bind(tokenHash,email,sessionExpiresAt,createdAt).run();
   return new Response(JSON.stringify({ok:true,user:{email,name:String(identity.name||email.split('@')[0])}}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':sessionCookieName+'='+encodeURIComponent(token)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+sessionLifetimeSeconds}});
  }
  if(path==='/api/auth/logout'&&method==='POST'){
   if(env.DB){
    const token=sessionToken(request);
    if(token){try{const hash=await sha256Hex(token);await env.DB.prepare('DELETE FROM paws_brew_staff_sessions WHERE session_hash=?').bind(hash).run()}catch{}}
   }
   return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':sessionCookieName+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}});
  }
  if(path==='/api/staff/me'&&method==='GET'){
   const user=await staffUser(request,env);
   return user?json({user}):fail('Staff access required. Please sign in.',401);
  }
  if(path==='/api/orders'&&method==='POST'){
   if(!env.DB)return fail('Online ordering is temporarily unavailable because the Pages D1 database binding DB is not configured.',503);
   const input=await body(request);if(!input)return fail('Invalid order request.');
   const name=String(input.name||'').trim(),phone=normPhone(input.phone),methodChoice=String(input.method||'');
   if(name.length<2||name.length>100||!validPhone(phone)||!['Pickup','Delivery'].includes(methodChoice))return fail('Enter your name, a valid Philippine mobile number, and pickup or delivery.');
   const address=String(input.address||'').trim(),notes=String(input.notes||'').trim(),raw=Array.isArray(input.items)?input.items:[];
   if(!raw.length||raw.length>40)return fail('Your cart is empty or contains too many items.');
   const items=[];for(const item of raw){const itemName=String(item.name||'').trim(),price=MENU.get(itemName),quantity=Number(item.quantity);if(price===undefined||!Number.isInteger(quantity)||quantity<1||quantity>50)return fail('One or more order items are invalid. Refresh the menu and try again.');items.push({name:itemName,price,quantity});}
   if(methodChoice==='Delivery'&&!address)return fail('Please enter your complete delivery address.');
   const subtotal=items.reduce((sum,x)=>sum+x.price*x.quantity,0),deliveryFee=methodChoice==='Delivery'?75:0,total=subtotal+deliveryFee;
   const id=uuid(),orderReference='PB-'+Date.now().toString(36).toUpperCase(),createdAt=stamp();
   await env.DB.prepare('INSERT INTO paws_brew_orders (id,order_reference,name,phone,method,address,notes,items_json,subtotal,delivery_fee,total,status,payment_method,payment_status,gcash_reference_number,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,\'pending_confirmation\',\'GCash\',\'awaiting_reference\',\'\',?)').bind(id,orderReference,name,phone,methodChoice,address,notes,JSON.stringify(items),subtotal,deliveryFee,total,createdAt).run();
   scheduleStaffNotification(ctx,env,{title:'New Paws & Brew order',body:name+' · '+methodChoice+' · '+orderReference,data:{url:'/staff',type:'order'}});
   return json({ok:true,orderId:id,orderReference,total,status:'pending_confirmation',paymentStatus:'awaiting_reference'},201);
  }
  const payMatch=path.match(/^\/api\/orders\/([^/]+)\/payment-reference$/);
  if(payMatch&&method==='POST'){
   if(!env.DB)return fail('Payment reference submission is temporarily unavailable because the Pages D1 database binding DB is not configured.',503);
   const input=await body(request)||{},phone=normPhone(input.phone),ref=String(input.referenceNumber||'').replace(/\s+/g,'');
   if(!validPhone(phone)||!/^[A-Za-z0-9-]{6,30}$/.test(ref))return fail('Enter a valid GCash payment reference number.');
   const row=await env.DB.prepare('SELECT * FROM paws_brew_orders WHERE id=?').bind(payMatch[1]).first();
   if(!row)return fail('Order not found.',404);if(normPhone(row.phone)!==phone)return fail('Order details could not be verified.',403);if(row.payment_status==='verified')return fail('Payment already verified.',409);
   await env.DB.prepare('UPDATE paws_brew_orders SET gcash_reference_number=?,payment_status=\'pending_verification\',payment_reference_submitted_at=? WHERE id=?').bind(ref,stamp(),payMatch[1]).run();
   return json({ok:true,orderReference:row.order_reference,paymentStatus:'pending_verification'});
  }
  if(path.startsWith('/api/staff/')){
   if(!env.DB)return fail('Staff dashboard is unavailable because the Pages D1 database binding DB is not configured.',503);
   const user=await staffUser(request,env);
   if(!user)return fail('Staff access required. Please sign in.',401);
   if(path==='/api/staff/push/config'&&method==='GET'){
    return json({publicKey:env.VAPID_PUBLIC_KEY||''});
   }
   if(path==='/api/staff/push/subscribe'&&method==='POST'){
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return fail('Push notifications are not configured on the server yet.',503);
    const input=await body(request)||{},subscription=input.subscription;
    if(!subscription||typeof subscription.endpoint!=='string'||!subscription.endpoint.startsWith('https://')||typeof subscription.keys?.p256dh!=='string'||typeof subscription.keys?.auth!=='string')return fail('The browser returned an invalid push subscription.');
    await ensurePushTable(env.DB);
    const now=stamp();
    await env.DB.prepare('INSERT INTO paws_brew_push_subscriptions (endpoint,email,subscription_json,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET email=excluded.email,subscription_json=excluded.subscription_json,updated_at=excluded.updated_at').bind(subscription.endpoint,user.email,JSON.stringify(subscription),now,now).run();
    return json({ok:true,enabled:true});
   }
   if(path==='/api/staff/orders'&&method==='GET'){
    const {results=[]}=await env.DB.prepare('SELECT * FROM paws_brew_orders ORDER BY created_at DESC LIMIT 500').all();return json({orders:results.map(mapOrder),nextToken:null});
   }
   if(path==='/api/staff/reservations'&&method==='GET'){
    const {results=[]}=await env.DB.prepare('SELECT * FROM paws_brew_reservations ORDER BY created_at DESC LIMIT 500').all();return json({reservations:results.map(mapReservation),nextToken:null});
   }
   const verify=path.match(/^\/api\/staff\/orders\/([^/]+)\/payment$/);
   if(verify&&method==='PUT'){
    const row=await env.DB.prepare('SELECT * FROM paws_brew_orders WHERE id=?').bind(verify[1]).first();if(!row)return fail('Order not found.',404);if(!row.gcash_reference_number)return fail('Customer has not submitted a GCash reference.',409);
    await env.DB.prepare('UPDATE paws_brew_orders SET payment_status=\'verified\',payment_verified_at=? WHERE id=?').bind(stamp(),verify[1]).run();return json({ok:true,id:verify[1],paymentStatus:'verified'});
   }
   const order=path.match(/^\/api\/staff\/orders\/([^/]+)$/);
   if(order&&method==='PUT'){
    const input=await body(request)||{},status=String(input.status||''),valid=['pending_confirmation','confirmed','preparing','out_for_delivery','ready','completed','cancelled'];if(!valid.includes(status))return fail('Invalid order status.');
    const row=await env.DB.prepare('SELECT * FROM paws_brew_orders WHERE id=?').bind(order[1]).first();if(!row)return fail('Order not found.',404);
    if(row.payment_status!=='verified'&&!['pending_confirmation','cancelled'].includes(status))return fail('Verify GCash payment before moving this order forward.',409);
    await env.DB.prepare('UPDATE paws_brew_orders SET status=? WHERE id=?').bind(status,order[1]).run();return json({ok:true,id:order[1],status});
   }
   const reservation=path.match(/^\/api\/staff\/reservations\/([^/]+)$/);
   if(reservation&&method==='PUT'){
    const input=await body(request)||{},status=String(input.status||''),valid=['pending','confirmed','seated','completed','declined','cancelled'];if(!valid.includes(status))return fail('Invalid reservation status.');
    const result=await env.DB.prepare('UPDATE paws_brew_reservations SET status=? WHERE id=?').bind(status,reservation[1]).run();if(!result.meta.changes)return fail('Reservation not found.',404);return json({ok:true,id:reservation[1],status});
   }
   return fail('Staff endpoint not found.',404);
  }
  if(path==='/api/reservations'&&method==='POST'){
   if(!env.DB)return fail('Table reservations are temporarily unavailable because the Pages D1 database binding DB is not configured.',503);
   const input=await body(request)||{},name=String(input.name||'').trim(),phone=normPhone(input.phone),date=String(input.date||''),time=String(input.time||''),guests=Number(input.guests),pets=['Yes','yes',true,1].includes(input.pets),notes=String(input.notes||'').trim();
   if(name.length<2||!validPhone(phone)||!/^(\d{4})-(\d{2})-(\d{2})$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isInteger(guests)||guests<1||guests>20)return fail('Please check your reservation details.');
   const id=uuid();await env.DB.prepare('INSERT INTO paws_brew_reservations (id,name,phone,date,time,guests,pets,notes,status,created_at) VALUES (?,?,?,?,?,?,?, ?,\'pending\',?)').bind(id,name,phone,date,time,guests,pets?1:0,notes,stamp()).run();scheduleStaffNotification(ctx,env,{title:'New Paws & Brew table reservation',body:name+' · '+date+' '+time+' · '+guests+' guest(s)',data:{url:'/staff',type:'reservation'}});return json({ok:true,id,status:'pending'},201);
  }
  return fail('Not found.',404);
 }
};

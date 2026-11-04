const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./mediabunny-aac-encoder-BPs-IYx1.js","./rolldown-runtime-Dd_uD5pT.js","./custom-coder-CC1Eo4Y7.js","./packet-p-EjLemH.js","./preload-helper-uBIymjUX.js"])))=>i.map(i=>d[i]);
import{n as e}from"./rolldown-runtime-Dd_uD5pT.js";import{$n as t,Dr as n,Gn as r,Gr as i,Ir as a,Jr as o,L as s,Lr as c,O as l,Or as u,Qn as d,Rr as f,Tn as p,Xn as m,Zn as h,ar as g,at as _,er as v,n as y,nr as b,on as x,or as S,pi as C,tr as w,ur as T}from"./motore-DRC-k_8J.js";import{n as E,r as D}from"./timecode-4RrzYGa0.js";import{_ as O,g as k,u as A}from"./custom-coder-CC1Eo4Y7.js";import{t as j}from"./preload-helper-uBIymjUX.js";import{_ as M,m as N,o as ee,p as te,u as P}from"./platform-CpuyJnu4.js";import{P as ne,w as re}from"./progetti-Bk6SFumB.js";import{A as ie,B as ae,C as oe,D as F,E as I,F as se,I as L,L as ce,M as R,N as z,O as B,P as V,R as le,S as H,T as U,V as W,_ as G,b as K,g as ue,h as q,j as J,k as de,m as Y,v as fe,w as pe,x as X,y as Z,z as me}from"./titoliHtml-vCBP0wVp.js";import{a as he,i as ge,n as _e,o as ve,s as ye}from"./grafica-DijnPze6.js";import{a as be,l as xe}from"./animazioni-LE08hYNH.js";import{c as Se,o as Ce,r as we}from"./titoliHtml-B9yyOLXg.js";function Te(e,t,n={}){return{id:t,forma:e,x:.5,y:.5,w:e===`bezier`?0:.5,h:e===`bezier`?0:.5,rot:0,sfuma:0,espandi:0,inverti:!1,opacita:1,op:`somma`,...e===`bezier`?{punti:[],morbida:!0}:{},...n}}var Ee=e=>e.nome||(e.forma===`rettangolo`?`Rettangolo`:e.forma===`ellisse`?`Ellisse`:`Bézier`);function De(e,t=768){let n=Number.isFinite(e)&&e>.05?e:16/9;return n>=1?{w:t,h:Math.max(2,Math.round(t/n))}:{w:Math.max(2,Math.round(t*n)),h:t}}function Oe(e,t){let n=e.punti,r=n[t];if(r.hx!==void 0&&r.hy!==void 0)return[r.hx,r.hy];if(!e.morbida)return[0,0];let i=n[(t-1+n.length)%n.length],a=n[(t+1)%n.length];return[(a.x-i.x)/6,(a.y-i.y)/6]}function ke(e,t=14){let n=e.punti??[],r=n.length;if(r<3)return[];let i=[];for(let a=0;a<r;a++){let o=n[a],s=n[(a+1)%r],[c,l]=Oe(e,a),[u,d]=Oe(e,(a+1)%r);if(i.push([o.x,o.y]),!c&&!l&&!u&&!d)continue;let f=o.x+c,p=o.y+l,m=s.x-u,h=s.y-d;for(let e=1;e<t;e++){let n=e/t,r=1-n;i.push([r*r*r*o.x+3*r*r*n*f+3*r*n*n*m+n*n*n*s.x,r*r*r*o.y+3*r*r*n*p+3*r*n*n*h+n*n*n*s.y])}}return i}function Ae(e,t,n,r){let i=Math.cos(e.rot*Math.PI/180),a=Math.sin(e.rot*Math.PI/180),o=n*t,s=r;return[e.x+(i*o-a*s)/t,e.y+(a*o+i*s)]}function je(e,t,n,r){let i=Math.cos(e.rot*Math.PI/180),a=Math.sin(e.rot*Math.PI/180),o=(n-e.x)*t,s=r-e.y;return[(i*o+a*s)/t,-a*o+i*s]}function Me(e,t,n=48){if(e.forma===`bezier`)return ke(e);let r=(n,r)=>Ae(e,t,n,r),i=e.w/2,a=e.h/2;if(e.forma===`rettangolo`)return[r(-i,-a),r(i,-a),r(i,a),r(-i,a)];let o=[];for(let e=0;e<n;e++){let t=e/n*Math.PI*2;o.push(r(Math.cos(t)*i,Math.sin(t)*a))}return o}function Ne(e,t,n,r){let i=e.x*t,a=e.y*n,o=Math.max(.001,e.w*t/2),s=Math.max(.001,e.h*n/2),c=e.rot*Math.PI/180,l=Math.cos(c),u=Math.sin(c),d=e.forma===`ellisse`;for(let e=0;e<n;e++){let n=e+.5-a;for(let a=0;a<t;a++){let c=a+.5-i,f=l*c+u*n,p=-u*c+l*n;if(d){let n=Math.hypot(f/o,p/s),i=Math.hypot(f/(o*o),p/(s*s));r[e*t+a]=i>1e-12?n*(n-1)/i:-Math.min(o,s)}else{let n=Math.abs(f)-o,i=Math.abs(p)-s;r[e*t+a]=Math.hypot(Math.max(n,0),Math.max(i,0))+Math.min(Math.max(n,i),0)}}}}function Pe(e,t,n,r,i){let a=e.length,o=e.map(e=>e[0]*t),s=e.map(e=>e[1]*n),c=new Float32Array(t*n).fill(r+1),l=new Uint8Array(t*n);for(let e=0;e<n;e++){let n=e+.5,r=[];for(let e=0;e<a;e++){let t=o[e],i=s[e],c=o[(e+1)%a],l=s[(e+1)%a];(i<=n&&l>n||l<=n&&i>n)&&r.push(t+(n-i)/(l-i)*(c-t))}r.sort((e,t)=>e-t);for(let n=0;n+1<r.length;n+=2){let i=Math.max(0,Math.ceil(r[n]-.5)),a=Math.min(t-1,Math.ceil(r[n+1]-.5)-1);for(let n=i;n<=a;n++)l[e*t+n]=1}}for(let e=0;e<a;e++){let i=o[e],l=s[e],u=o[(e+1)%a],d=s[(e+1)%a],f=u-i,p=d-l,m=f*f+p*p,h=Math.max(0,Math.floor(Math.min(i,u)-r)),g=Math.min(t-1,Math.ceil(Math.max(i,u)+r)),_=Math.max(0,Math.floor(Math.min(l,d)-r)),v=Math.min(n-1,Math.ceil(Math.max(l,d)+r));for(let e=_;e<=v;e++)for(let n=h;n<=g;n++){let r=n+.5-i,a=e+.5-l,o=m>0?Math.max(0,Math.min(1,(r*f+a*p)/m)):0,s=Math.hypot(r-o*f,a-o*p);s<c[e*t+n]&&(c[e*t+n]=s)}}for(let e=0;e<t*n;e++)i[e]=l[e]?-c[e]:c[e]}var Fe=e=>{let t=Math.max(0,Math.min(1,e));return t*t*(3-2*t)};function Ie(e,t,n,r){let i=Math.min(t,n),a=Math.max(-.5,Math.min(.5,e.espandi))*i,o=Math.max(0,Math.min(.5,e.sfuma))*i,s=new Float32Array(t*n);if(e.forma===`bezier`){let r=ke(e);r.length<3?s.fill(1e6):Pe(r,t,n,Math.max(2,o+Math.abs(a)+2),s)}else Ne(e,t,n,s);let c=Math.max(0,Math.min(1,e.opacita));for(let t=0;t<s.length;t++){let n=s[t]-a,i=o<1?Math.max(0,Math.min(1,.5-n)):Fe((o-n)/(2*o));e.inverti&&(i=1-i),r[t]=i*c}}function Le(e,t,n){let r=(e??[]).filter(e=>!e.spenta).slice(0,8);if(!r.length)return null;let i=new Float32Array(t*n).fill(+(r[0].op===`sottrai`)),a=new Float32Array(t*n);for(let e of r)if(Ie(e,t,n,a),e.op===`sottrai`)for(let e=0;e<i.length;e++)i[e]*=1-a[e];else for(let e=0;e<i.length;e++)i[e]=i[e]+a[e]-i[e]*a[e];return i}function Re(e,t,n=768){let{w:r,h:i}=De(t,n),a=Le(e,r,i);if(!a)return null;let o=new Uint8Array(r*i);for(let e=0;e<o.length;e++)o[e]=Math.round(Math.max(0,Math.min(1,a[e]))*255);return{w:r,h:i,dati:o}}function ze(e,t){let n=(e??[]).filter(e=>!e.spenta);if(!n.length)return``;let r=e=>Math.round(e*1e4)/1e4;return Math.round(t*1e3)+`|`+n.map(e=>[e.forma,r(e.x),r(e.y),r(e.w),r(e.h),r(e.rot),r(e.sfuma),r(e.espandi),+!!e.inverti,r(e.opacita),e.op,+!!e.morbida,(e.punti??[]).map(e=>[r(e.x),r(e.y),e.hx===void 0?``:r(e.hx),e.hy===void 0?``:r(e.hy)].join(`,`)).join(`;`)].join(`:`)).join(`/`)}function Be(e,t,n,r){let i=Me(e,r,64);if(i.length<3)return!1;let a=!1;for(let e=0,r=i.length-1;e<i.length;r=e++){let[o,s]=i[e],[c,l]=i[r];s>n!=l>n&&t<(c-o)*(n-s)/(l-s)+o&&(a=!a)}return a}function Ve(e,t,n,r){let i=[],a=[],o=0;for(let t of n){for(;o<e.length&&e[o].tMs<t.da;)o++;for(;o<e.length&&e[o].tMs<t.fine;){let n=e[o++],s=t.videoMs+n.tMs-t.da;if(!Number.isFinite(s)||s<0||s>=Math.min(r,t.videoMs+t.durataMs))continue;let c=n.visible&&Number.isFinite(n.cx)&&Number.isFinite(n.cy)&&n.cx>=0&&n.cx<1&&n.cy>=0&&n.cy<1,l={...n,tMs:s,cx:Number.isFinite(n.cx)?n.cx:0,cy:Number.isFinite(n.cy)?n.cy:0,visible:c,clicks:c?n.clicks&7:0};i.push(l);for(let e=0;e<3;e++)l.clicks&1<<e&&a.push({tMs:s,cx:n.cx,cy:n.cy,button:e})}}return{v:1,schermo:t,durataMs:r,segmenti:n.map(e=>({daMs:e.videoMs,durataMs:e.durataMs})),campioni:i,clic:a}}var He=(e,t,n)=>Math.max(t,Math.min(n,e));function Ue(e,t,n,r,i,a){let o=He(-r*(t-.5)*i,-(r-1)*i/2,(r-1)*i/2),s=He(-r*(n-.5)*a,-(r-1)*a/2,(r-1)*a/2),c=e.rot*Math.PI/180,l=o*e.scale*(e.sx??1),u=s*e.scale;return{...e,scale:e.scale*r,x:e.x+Math.cos(c)*l-Math.sin(c)*u,y:e.y+Math.sin(c)*l+Math.cos(c)*u}}function We(e,t){let n=[];for(let r of e){if(!Number.isFinite(r.tMs)||r.tMs<0||r.tMs>=t)continue;let e=Math.max(0,r.tMs-500),i=Math.min(t,r.tMs+1700),a=n.at(-1);a&&e<=a.fine?(a.fine=i,a.clic.push(r)):n.push({da:e,fine:i,clic:[r]})}return n}function Ge(e,t){let n=0,r=e.length;for(;n<r;){let i=n+r>>>1;e[i].tMs<=t?n=i+1:r=i}let i=e[n-1],a=e[n];if(!i?.visible||t-i.tMs>150)return null;if(!a?.visible||a.tMs-i.tMs>150)return[i.cx,i.cy];let o=He((t-i.tMs)/Math.max(.001,a.tMs-i.tMs),0,1);return[i.cx+(a.cx-i.cx)*o,i.cy+(a.cy-i.cy)*o]}var Ke=100,qe=.025,Je=700,Ye=1.9,Xe=1.6,Ze=1.35,Qe=2.6,$e=700;function et(e,t){let n=0,r=e.length;for(;n<r;){let i=n+r>>>1;e[i].tMs<=t?n=i+1:r=i}for(let r=n-1;r>=0&&t-e[r].tMs<400;r--)if(e[r].win)return e[r].win;return null}function tt(e,t){let n=[],r=new nt,i=0;for(let a=0;a<=t;a+=Ke){for(;i<e.clic.length&&e.clic[i].tMs<a-1900;)i++;let t=e.clic.slice(i).find(e=>e.tMs<=a+350);n.push(r.passo(a,Ge(e.campioni,a),t,()=>et(e.campioni,a)))}return n}var nt=class{cx1=.5;cy1=.5;z1=1;cx=.5;cy=.5;z=1;tx=.5;ty=.5;ancora=null;fermoDa=0;agitatoA=-1/0;storia=[];passo(e,t,n,r){let i=1;if(t){let a=this.storia;for(a.push([e,t[0],t[1]]);a.length&&e-a[0][0]>1500;)a.shift();let o=0;for(let e=1;e<a.length;e++)o+=Math.hypot(a[e][1]-a[e-1][1],a[e][2]-a[e-1][2]);let s=a.filter(t=>e-t[0]<=300);((s.length>1?Math.hypot(t[0]-s[0][1],t[1]-s[0][2])/Math.max(.1,(e-s[0][0])/1e3):0)>.45||o>.6)&&(this.agitatoA=e);let c=e-this.agitatoA>=$e;(!this.ancora||Math.hypot(t[0]-this.ancora[0],t[1]-this.ancora[1])>qe)&&(this.ancora=t,this.fermoDa=e);let l=e-this.fermoDa>=Je,u=l?r():null,d=u?u[2]-u[0]:1,f=u?u[3]-u[1]:1;if(!c)this.tx=.5,this.ty=.5,i=1;else if(n)this.tx=n.cx,this.ty=n.cy,i=Ye;else if(u&&d*f<.8&&d*f>.01)this.tx=(u[0]+u[2])/2,this.ty=(u[1]+u[3])/2,i=He(.94/Math.max(d,f),1,Qe);else if(l)this.tx=t[0],this.ty=t[1],i=Xe;else{i=Ze;let e=.2/Math.max(1,this.z);this.tx=t[0]<this.cx-e?t[0]+e:t[0]>this.cx+e?t[0]-e:this.cx,this.ty=t[1]<this.cy-e?t[1]+e:t[1]>this.cy+e?t[1]-e:this.cy}}else this.ancora=null,this.storia.length=0,this.tx=.5,this.ty=.5;let a=1-Math.exp(-100/(i>this.z1?550:260)),o=1-Math.exp(-100/160);this.z1+=(i-this.z1)*a,this.z+=(this.z1-this.z)*a,this.cx1+=(this.tx-this.cx1)*o,this.cy1+=(this.ty-this.cy1)*o;let s=.15/Math.max(1,this.z),c=this.cx1-this.cx,l=this.cy1-this.cy,u=Math.hypot(c,l),d=u>s?s/u:1;if(this.cx+=c*d,this.cy+=l*d,t&&this.z>1.01){let e=.5/this.z-.06/this.z;t[0]<this.cx-e?this.cx=t[0]+e:t[0]>this.cx+e&&(this.cx=t[0]-e),t[1]<this.cy-e?this.cy=t[1]+e:t[1]>this.cy+e&&(this.cy=t[1]-e),this.cx1=this.cx,this.cy1=this.cy}return{tMs:e,cx:this.cx,cy:this.cy,z:this.z}}};function rt(e){let t=Math.max(1,e.z),n=.5/t,r=He(e.cx,n,1-n),i=He(e.cy,n,1-n);return`scale(${t.toFixed(3)}) translate(${((.5-r)*100).toFixed(2)}%, ${((.5-i)*100).toFixed(2)}%)`}function it(e,t,n,r=()=>!0){let i=n.cursoreLive;if(!i||i.v!==1||t.via?.length||t.len<3||n.width<=0||n.height<=0||t.speed<=0)return!1;let a=e.rate.num/e.rate.den,o=(t.srcIn-(n.t0||0))*1e3,s=o+t.len*1e3/a*t.speed,c=tt(i,Math.max(0,Math.min(i.durataMs,s)));if(!c.length)return!1;let l=Math.min(e.w/n.width,e.h/n.height),u=n.width*l,d=n.height*l;t.anim??={};let f=t.zoomLive??{scale:t.anim[`tf.scale`],x:t.anim[`tf.x`],y:t.anim[`tf.y`]},p={scale:[],x:[],y:[]},m=Math.max(1,Math.round(a*Ke/1e3)),h=!1;for(let e=0;e<=t.len;e+=m){let n=o+e*1e3/a*t.speed,i=c[He(Math.round(n/Ke),0,c.length-1)],s={...t.tf,scale:C(f.scale,e,t.tf.scale),x:C(f.x,e,t.tf.x),y:C(f.y,e,t.tf.y)},l=r(e)&&i.z>1.001?Ue(s,i.cx,i.cy,i.z,u,d):s;l!==s&&(h=!0);for(let n of[`scale`,`x`,`y`]){let r=p[n],i=l[n],a=r.at(-1);a&&Math.abs(a.v-i)<(n===`scale`?5e-4:.25)&&e+m<=t.len||r.push({f:e,v:i})}}if(!h)return!1;t.zoomLive=JSON.parse(JSON.stringify(f));for(let e of[`scale`,`x`,`y`]){let n=p[e];n.at(-1).f<t.len&&n.push({f:t.len,v:n.at(-1).v}),t.anim[`tf.`+e]=n}return!0}function at(e){let t=e.zoomLive;if(!t)return!1;e.anim??={};for(let n of[`scale`,`x`,`y`]){let r=t[n];r?.length?e.anim[`tf.`+n]=r:delete e.anim[`tf.`+n]}return delete e.zoomLive,!0}function ot(e){return f(`fx`,e.track,e.start,e.len,{name:`Clic animati`,fxb:{tipo:`effetto`,id:`clicLive`,forza:1,colore:`#ffd54a`,audio:!1,cursoreMedia:e.media}})}function st(e,t){let n=0,r=e.clic.length;for(;n<r;){let i=n+r>>>1;e.clic[i].tMs<=t-550?n=i+1:r=i}let i=[];for(let r=n;r<e.clic.length&&e.clic[r].tMs<=t;r++)i.push(e.clic[r]);return i.slice(-8)}var ct=[`400 40px "Montserrat"`,`500 40px "Montserrat"`,`700 40px "Montserrat"`,`900 40px "Montserrat"`,`400 40px "Oswald"`,`500 40px "Oswald"`,`700 40px "Oswald"`,`400 40px "Archivo Black"`,`400 40px "Bebas Neue"`,`400 40px "Space Mono"`,`700 40px "Space Mono"`,`400 40px "Playfair Display"`,`700 40px "Playfair Display"`,`italic 400 40px "Playfair Display"`,`400 40px "Cormorant Garamond"`,`500 40px "Cormorant Garamond"`,`italic 500 40px "Cormorant Garamond"`,`400 40px "Great Vibes"`,`700 40px "Caveat"`,`500 40px "Rajdhani"`,`700 40px "Rajdhani"`,`700 40px "Orbitron"`],lt=null;function ut(){return typeof document>`u`||!document.fonts?.load?Promise.resolve():(lt??=Promise.all(ct.map(e=>document.fonts.load(e,`AaÈèÀà&0123`).catch(()=>[]))).then(()=>void 0),lt)}var dt=e({Interpolatore:()=>vt}),ft=2,pt=320,mt=24,ht=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_a, u_b, u_prima;
uniform vec2 u_cell;     // una cella di questa scala, in coordinate della texture
uniform float u_lod;
uniform float u_ha;      // 0 alla scala più grossolana (niente stima di prima)
uniform float u_liscio;  // quanto costa allontanarsi dalla stima di prima (per cella)
out vec4 o;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float L(sampler2D t, vec2 uv) { return lum(textureLod(t, uv, u_lod).rgb); }
float pa[25];
float costo(vec2 d) {
  float s = 0.0;
  for (int k = 0; k < 25; k++) {
    vec2 off = vec2(float(k % 5 - 2), float(k / 5 - 2)) * u_cell * 0.7;
    s += abs(pa[k] - L(u_b, v_uv + off + d));
  }
  return s / 25.0;
}
void main() {
  for (int k = 0; k < 25; k++) pa[k] = L(u_a, v_uv + vec2(float(k % 5 - 2), float(k / 5 - 2)) * u_cell * 0.7);
  vec2 pred = u_ha > 0.5 ? texture(u_prima, v_uv).rg : vec2(0.0);
  vec2 best = pred;
  float bc = costo(pred);
  for (int dy = -${ft}; dy <= ${ft}; dy++) for (int dx = -${ft}; dx <= ${ft}; dx++) {
    if (dx == 0 && dy == 0) continue;
    vec2 d = pred + vec2(float(dx), float(dy)) * u_cell;
    float c = costo(d) + u_liscio * length(vec2(float(dx), float(dy)));
    if (c < bc) { bc = c; best = d; }
  }
  // fermo: la stima di prima potrebbe aver preso una scia (vale sempre la pena provare "niente movimento")
  if (u_ha > 0.5) {
    float c0 = costo(vec2(0.0)) + u_liscio * length(pred / u_cell) * 0.5;
    if (c0 < bc) { bc = c0; best = vec2(0.0); }
  }
  // mezzo pixel: parabola sui costi dei vicini
  float cc = costo(best);
  float cxm = costo(best - vec2(u_cell.x, 0.0)), cxp = costo(best + vec2(u_cell.x, 0.0));
  float cym = costo(best - vec2(0.0, u_cell.y)), cyp = costo(best + vec2(0.0, u_cell.y));
  float dxx = cxm - 2.0 * cc + cxp, dyy = cym - 2.0 * cc + cyp;
  vec2 fine = vec2(0.0);
  if (dxx > 1e-5) fine.x = clamp(0.5 * (cxm - cxp) / dxx, -0.5, 0.5);
  if (dyy > 1e-5) fine.y = clamp(0.5 * (cym - cyp) / dyy, -0.5, 0.5);
  best += fine * u_cell;
  o = vec4(best, cc, 1.0);
}`,gt=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_f;
uniform vec2 u_cell;
out vec4 o;
void main() {
  vec3 s = vec3(0.0);
  float ws = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec4 f = texture(u_f, v_uv + vec2(float(i), float(j)) * u_cell);
    float w = (i == 0 && j == 0 ? 2.0 : 1.0) / (0.02 + f.b);
    s += vec3(f.rg, f.b) * w;
    ws += w;
  }
  vec3 m = s / ws;
  o = vec4(m, 1.0);
}`,_t=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_a, u_b, u_ab, u_ba;
uniform float u_w;
uniform bool u_mosso;
out vec4 o;
void main() {
  vec4 a0 = texture(u_a, v_uv), b0 = texture(u_b, v_uv);
  vec4 plain = mix(a0, b0, u_w);
  if (!u_mosso) { o = plain; return; }
  // da A verso B: dov'era questo punto in A (e dove sarà in B)
  vec2 d1 = texture(u_ab, v_uv).rg;
  d1 = texture(u_ab, v_uv - u_w * d1).rg;
  vec4 a1 = texture(u_a, v_uv - u_w * d1), b1 = texture(u_b, v_uv + (1.0 - u_w) * d1);
  // da B verso A
  vec2 d2 = texture(u_ba, v_uv).rg;
  d2 = texture(u_ba, v_uv - (1.0 - u_w) * d2).rg;
  vec4 a2 = texture(u_a, v_uv + u_w * d2), b2 = texture(u_b, v_uv - (1.0 - u_w) * d2);
  float e1 = dot(abs(a1.rgb - b1.rgb), vec3(0.3333));
  float e2 = dot(abs(a2.rgb - b2.rgb), vec3(0.3333));
  float k1 = exp(-e1 * e1 * 400.0), k2 = exp(-e2 * e2 * 400.0);
  vec4 m = (mix(a1, b1, u_w) * k1 + mix(a2, b2, u_w) * k2) / (k1 + k2 + 1e-5);
  // fiducia: dove i due punti spostati non combaciano, meglio lo sfumato
  float fid = 1.0 - smoothstep(0.05, 0.16, min(e1, e2));
  o = mix(plain, m, fid);
}`,vt=class{gl;pMoto;pLiscia;pMezzo;uMoto={};uLiscia={};uMezzo={};stati=new Map;usati=new Set;capace;constructor(e){this.gl=e,this.pMoto=Hr(e,Ir,ht),this.pLiscia=Hr(e,Ir,gt),this.pMezzo=Hr(e,Ir,_t);for(let t of[`u_a`,`u_b`,`u_prima`,`u_cell`,`u_lod`,`u_ha`,`u_liscio`])this.uMoto[t]=e.getUniformLocation(this.pMoto,t);for(let t of[`u_f`,`u_cell`])this.uLiscia[t]=e.getUniformLocation(this.pLiscia,t);for(let t of[`u_a`,`u_b`,`u_ab`,`u_ba`,`u_w`,`u_mosso`])this.uMezzo[t]=e.getUniformLocation(this.pMezzo,t);this.capace=!!(e.getExtension(`EXT_color_buffer_float`)||e.getExtension(`EXT_color_buffer_half_float`))}bersaglio(e,t,n){let r=this.gl,i=r.createTexture();r.bindTexture(r.TEXTURE_2D,i),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),n?r.texImage2D(r.TEXTURE_2D,0,r.RGBA16F,e,t,0,r.RGBA,r.HALF_FLOAT,null):r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,t,0,r.RGBA,r.UNSIGNED_BYTE,null);let a=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,a),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,i,0),{fb:a,tex:i,w:e,h:t}}libera(e){e&&(this.gl.deleteFramebuffer(e.fb),this.gl.deleteTexture(e.tex))}liberaFlusso(e){if(e){for(let t of e.livelli)this.libera(t);this.libera(e.fine)}}liberaStato(e){this.libera(e.out),this.liberaFlusso(e.ab),this.liberaFlusso(e.ba)}inizia(){this.usati.clear()}finisce(){for(let[e,t]of this.stati)this.usati.has(e)||(this.liberaStato(t),this.stati.delete(e))}scale(e,t){let n=Math.max(mt,Math.min(pt,Math.round(e/4))),r=[];for(let i=0;i<5&&(r.unshift([n,Math.max(8,Math.round(n*t/e))]),!(n<=28));i++)n=Math.ceil(n/2);return r}nuovoFlusso(e){let t=e[e.length-1];return{livelli:e.map(([e,t])=>this.bersaglio(e,t,!0)),fine:this.bersaglio(t[0],t[1],!0)}}stima(e,t,n,r){let i=this.gl;i.useProgram(this.pMoto),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,t.tex),i.uniform1i(this.uMoto.u_a,0),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,n.tex),i.uniform1i(this.uMoto.u_b,1),i.uniform1i(this.uMoto.u_prima,2),e.livelli.forEach((n,a)=>{i.bindFramebuffer(i.FRAMEBUFFER,n.fb),i.viewport(0,0,n.w,n.h),i.activeTexture(i.TEXTURE2),i.bindTexture(i.TEXTURE_2D,a?e.livelli[a-1].tex:t.tex),i.uniform2f(this.uMoto.u_cell,1/n.w,1/n.h),i.uniform1f(this.uMoto.u_lod,Math.max(0,Math.log2(.7*r/n.w))),i.uniform1f(this.uMoto.u_ha,+!!a),i.uniform1f(this.uMoto.u_liscio,.004),i.drawArrays(i.TRIANGLE_STRIP,0,4)});let a=e.livelli[e.livelli.length-1];i.useProgram(this.pLiscia),i.bindFramebuffer(i.FRAMEBUFFER,e.fine.fb),i.viewport(0,0,e.fine.w,e.fine.h),i.activeTexture(i.TEXTURE2),i.bindTexture(i.TEXTURE_2D,a.tex),i.uniform1i(this.uLiscia.u_f,2),i.uniform2f(this.uLiscia.u_cell,1/a.w,1/a.h),i.drawArrays(i.TRIANGLE_STRIP,0,4)}mezzo(e,t,n,r,i,a,o,s){let c=this.gl;this.usati.add(e);let l=this.stati.get(e);(!l||l.out.w!==a||l.out.h!==o)&&(l&&this.liberaStato(l),l={out:this.bersaglio(a,o,!1)},this.stati.set(e,l)),c.disable(c.BLEND);let u=s&&this.capace;if(u){let e=this.scale(a,o),i=e.map(e=>e.join(`x`)).join(`,`);if((!l.ab||!l.ba||l.dim!==i)&&(this.liberaFlusso(l.ab),this.liberaFlusso(l.ba),l.ab=this.nuovoFlusso(e),l.ba=this.nuovoFlusso(e),l.dim=i,l.coppia=void 0),l.coppia!==r){for(let e of[t,n])c.bindTexture(c.TEXTURE_2D,e.tex),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MIN_FILTER,c.LINEAR_MIPMAP_LINEAR),c.generateMipmap(c.TEXTURE_2D);c.disable(c.BLEND),this.stima(l.ab,t,n,a),this.stima(l.ba,n,t,a);for(let e of[t,n])c.bindTexture(c.TEXTURE_2D,e.tex),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MIN_FILTER,c.LINEAR);l.coppia=r}}return c.bindFramebuffer(c.FRAMEBUFFER,l.out.fb),c.viewport(0,0,a,o),c.useProgram(this.pMezzo),c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,t.tex),c.uniform1i(this.uMezzo.u_a,0),c.activeTexture(c.TEXTURE1),c.bindTexture(c.TEXTURE_2D,n.tex),c.uniform1i(this.uMezzo.u_b,1),c.activeTexture(c.TEXTURE2),c.bindTexture(c.TEXTURE_2D,u&&l.ab?l.ab.fine.tex:t.tex),c.uniform1i(this.uMezzo.u_ab,2),c.activeTexture(c.TEXTURE3),c.bindTexture(c.TEXTURE_2D,u&&l.ba?l.ba.fine.tex:t.tex),c.uniform1i(this.uMezzo.u_ba,3),c.uniform1f(this.uMezzo.u_w,i),c.uniform1i(this.uMezzo.u_mosso,+!!u),c.drawArrays(c.TRIANGLE_STRIP,0,4),c.activeTexture(c.TEXTURE0),l.out.tex}distruggi(){for(let e of this.stati.values())this.liberaStato(e);this.stati.clear()}},yt=[`master`,`red`,`green`,`blue`,`luma`],bt=1024,xt=e=>Math.max(0,Math.min(1,e)),St=()=>[{id:`inizio`,x:0,y:0},{id:`fine`,x:1,y:1}];function Ct(e=[]){let t=new Map;for(let n of e)Number.isFinite(n.x)&&Number.isFinite(n.y)&&t.set(xt(n.x),{...n,x:xt(n.x),y:xt(n.y)});return t.has(0)||t.set(0,{id:`inizio`,x:0,y:0}),t.has(1)||t.set(1,{id:`fine`,x:1,y:1}),[...t.values()].sort((e,t)=>e.x-t.x)}function wt(e,t){let n=e;t=xt(t);let r=0;for(;r<n.length-2&&n[r+1].x<t;)r++;let i=n[r],a=n[r+1],o=a.x-i.x,s=e=>(n[e+1].y-n[e].y)/(n[e+1].x-n[e].x),c=e=>{if(e===0)return s(0);if(e===n.length-1)return s(e-1);let t=s(e-1),r=s(e);return t*r<=0?0:2*t*r/(t+r)},l=(t-i.x)/o,u=l*l,d=u*l;return xt((2*d-3*u+1)*i.y+(d-2*u+l)*o*c(r)+(-2*d+3*u)*a.y+(d-u)*o*c(r+1))}function Tt(e){return yt.every(t=>Ct(e?.[t]).every(e=>Math.abs(e.x-e.y)<1e-7))}function Et(e){let t=new Float32Array(bt*5*4);return yt.forEach((n,r)=>{let i=Ct(e?.[n]);for(let e=0;e<bt;e++)t.fill(wt(i,e/1023),(r*bt+e)*4,(r*bt+e+1)*4)}),t}var Q={lift:[0,0,0],gamma:[1,1,1],gain:[1,1,1],sat:1,contrast:1,shadow:[0,0,0],high:[0,0,0],vignette:0,grain:0},Dt=[{id:`nessuno`,nome:`Naturale`,info:`come è stato girato`,g:{},colori:[`#6b7a8f`,`#c9b18a`,`#e9e4da`]},{id:`cinema`,nome:`Cinema`,info:`ombre ottanio, pelle calda`,g:{contrast:1.12,sat:.92,shadow:[-.03,.02,.06],high:[.06,.02,-.04],vignette:.25},colori:[`#12343f`,`#d98b4e`,`#f3d2a8`]},{id:`caldo`,nome:`Caldo`,info:`luce del tramonto`,g:{gain:[1.08,1,.88],sat:1.05},colori:[`#5a2d12`,`#e0913a`,`#ffe0a8`]},{id:`freddo`,nome:`Freddo`,info:`mattina d'inverno`,g:{gain:[.9,.99,1.1],sat:.94},colori:[`#132c4a`,`#6fa0c9`,`#dff0ff`]},{id:`vivace`,nome:`Vivace`,info:`colori pieni, da spot`,g:{sat:1.35,contrast:1.08,gamma:[1.04,1.04,1.04]},colori:[`#c2185b`,`#00b0ff`,`#ffd600`]},{id:`vintage`,nome:`Vintage`,info:`foto di famiglia anni '70`,g:{lift:[.06,.05,.03],gain:[.97,.94,.84],sat:.75,contrast:.9,vignette:.35,grain:.04},colori:[`#6b5a40`,`#c8a97a`,`#efe0c0`]},{id:`bn`,nome:`Bianco e nero`,info:`contrastato, da reportage`,g:{sat:0,contrast:1.15,vignette:.2},colori:[`#111111`,`#777777`,`#eeeeee`]},{id:`pellicola`,nome:`Pellicola`,info:`curva morbida e grana`,g:{contrast:1.06,sat:.9,shadow:[0,.02,.03],high:[.04,.02,0],grain:.05,vignette:.2},colori:[`#2b2e2a`,`#a38a64`,`#f2e6cc`]},{id:`notte`,nome:`Notte`,info:`blu da notte americana`,g:{gain:[.78,.9,1.15],gamma:[.9,.9,.9],sat:.8,lift:[0,.01,.03]},colori:[`#050b1f`,`#1f3f7a`,`#8fb3ff`]}],Ot=(e,t,n)=>e+(t-e)*n,kt=(e,t,n)=>[Ot(e[0],t[0],n),Ot(e[1],t[1],n),Ot(e[2],t[2],n)];function At(e){let t=Dt.find(t=>t.id===e.look)??Dt[0],n=e.look===`nessuno`?0:Math.max(0,Math.min(1,e.intensita)),r={...Q,...t.g},i={lift:kt(Q.lift,r.lift,n),gamma:kt(Q.gamma,r.gamma,n),gain:kt(Q.gain,r.gain,n),sat:Ot(1,r.sat,n),contrast:Ot(1,r.contrast,n),shadow:kt(Q.shadow,r.shadow,n),high:kt(Q.high,r.high,n),vignette:Ot(0,r.vignette,n),grain:Ot(0,r.grain,n)},a=e.bright*.25;i.lift=i.lift.map(e=>e+a*.5),i.gain=i.gain.map(e=>e*(1+a)),i.contrast*=e.contrast,i.sat*=e.sat;let o=e.temp,s=e.tint;return i.gain=[i.gain[0]*(1+o*.12),i.gain[1]*(1-s*.08),i.gain[2]*(1-o*.14)],i.vignette=Math.max(i.vignette,e.vignette),i.grain=Math.max(i.grain,e.grain*.12),jt(i,e.colore)}function jt(e,t){return{...e,lift:e.lift.map((e,n)=>e+(t?.lift?.[n]??0)),gamma:e.gamma.map((e,n)=>Math.max(.1,e*(t?.gamma?.[n]??1))),gain:e.gain.map((e,n)=>e*(t?.gain?.[n]??1)),curve:t?.curve,lut:t?.lut}}var Mt=e=>jt(Q,e);function Nt(e){let t=(e,t)=>Math.abs(e[0]-t[0])+Math.abs(e[1]-t[1])+Math.abs(e[2]-t[2])<1e-4;return t(e.lift,Q.lift)&&t(e.gamma,Q.gamma)&&t(e.gain,Q.gain)&&Math.abs(e.sat-1)<1e-4&&Math.abs(e.contrast-1)<1e-4&&t(e.shadow,Q.shadow)&&t(e.high,Q.high)&&e.vignette<1e-4&&e.grain<1e-4&&Tt(e.curve)&&!(e.lut&&e.lut.intensita>0)}var Pt=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;function Ft(e){return Number.isInteger(e.n)&&e.n>=2&&e.n<=65&&Array.isArray(e.dati)&&e.dati.length===e.n**3*3&&e.dati.every(e=>Number.isFinite(e)&&Math.abs(e)<=65504)&&Array.isArray(e.domainMin)&&Array.isArray(e.domainMax)&&e.domainMin.length===3&&e.domainMax.length===3&&e.domainMin.every((t,n)=>Number.isFinite(t)&&Math.abs(t)<=65504&&Number.isFinite(e.domainMax[n])&&Math.abs(e.domainMax[n])<=65504&&e.domainMax[n]>t)}function It(e,t=`LUT`){if(e.length>33554432||new TextEncoder().encode(e).length>33554432)throw Error(`La LUT supera 32 MB`);let n=0,r=!1,i=[0,0,0],a=[1,1,1],o=[],s=new Set;for(let[c,l]of e.replace(/^\uFEFF/,``).split(/\r?\n/).entries()){let e=l.replace(/"[^"]*"|#.*$/g,e=>e.startsWith(`#`)?``:e).trim();if(!e)continue;let u=e.split(/\s+/),d=u[0],f=()=>Error(`LUT: riga ${c+1} non valida (${d})`);if(Pt.test(d)){if(!n||u.length!==3||!u.every(e=>Pt.test(e)&&Number.isFinite(Number(e))&&Math.abs(Number(e))<=65504))throw f();if(r=!0,o.length>=n**3*3)throw Error(`La LUT ha troppi campioni`);o.push(...u.map(Number));continue}if(r||s.has(d))throw f();if(s.add(d),d===`TITLE`){if(!/^TITLE\s+".*"$/.test(e))throw f();t=e.slice(e.indexOf(`"`)+1,-1)}else if(d===`LUT_3D_SIZE`){if(n=Number(u[1]),u.length!==2||!Number.isInteger(n)||n<2||n>65)throw Error(`La LUT deve avere da 2 a 65 punti per lato`)}else if(d===`DOMAIN_MIN`||d===`DOMAIN_MAX`){if(u.length!==4||!u.slice(1).every(e=>Pt.test(e)&&Number.isFinite(Number(e))))throw f();let e=u.slice(1).map(Number);d===`DOMAIN_MIN`?i=e:a=e}else throw Error(`LUT: intestazione ${d} non supportata (servono LUT 3D .cube)`)}let c={nome:t,n,domainMin:i,domainMax:a,dati:o};if(!Ft({...c,id:``,hash:``}))throw Error(`LUT incompleta o dominio non valido`);return c}async function Lt(e,t){let n=It(e,t),r=new TextEncoder().encode(JSON.stringify([n.n,n.domainMin,n.domainMax,n.dati])),i=Array.from(new Uint8Array(await crypto.subtle.digest(`SHA-256`,r)),e=>e.toString(16).padStart(2,`0`)).join(``);return{...n,id:`lut-`+i,hash:i}}async function Rt(e){if(!/\.cube$/i.test(e.name))throw Error(`Scegli un file .cube`);if(e.size>33554432)throw Error(`La LUT supera 32 MB`);return Lt(await e.text(),e.name)}function zt(e,t,n=1){if(n<=0)return[...t];let r=t.map((t,n)=>Math.max(0,Math.min(1,(t-e.domainMin[n])/(e.domainMax[n]-e.domainMin[n])))*(e.n-1)),i=r.map(Math.floor),a=i.map(t=>Math.min(e.n-1,t+1)),o=r.map((e,t)=>e-i[t]),s=[0,0,0];for(let t=0;t<2;t++)for(let n=0;n<2;n++)for(let r=0;r<2;r++){let c=(r?o[0]:1-o[0])*(n?o[1]:1-o[1])*(t?o[2]:1-o[2]),l=((t?a[2]:i[2])*e.n**2+(n?a[1]:i[1])*e.n+(r?a[0]:i[0]))*3;for(let t=0;t<3;t++)s[t]+=e.dati[l+t]*c}return s.map((e,r)=>t[r]+(e-t[r])*Math.min(1,n))}var Bt=[`u_caLift`,`u_caGamma`,`u_caGain`,`u_caManuale`,`u_caCurve`,`u_caLut`,`u_caCurveOn`,`u_caIntensity`,`u_caSize`,`u_caMin`,`u_caMax`],Vt=`
uniform vec3 u_caLift, u_caGamma, u_caGain;
uniform bool u_caManuale, u_caCurveOn;
uniform sampler2D u_caCurve;
uniform highp sampler3D u_caLut;
uniform float u_caIntensity, u_caSize;
uniform vec3 u_caMin, u_caMax;
float curva(float x, float r) {
  return texture(u_caCurve, vec2((clamp(x, 0.0, 1.0) * ${bt-1}.0 + 0.5) / ${bt}.0, (r + 0.5) / 5.0)).r;
}
vec3 coloreAvanzato(vec3 rgb) {
  if (u_caManuale) {
    rgb = rgb * u_caGain + u_caLift * (1.0 - rgb);
    rgb = pow(max(rgb, 0.0), 1.0 / max(u_caGamma, vec3(0.1)));
  }
  if (u_caCurveOn) {
    rgb = vec3(curva(rgb.r, 0.0), curva(rgb.g, 0.0), curva(rgb.b, 0.0));
    rgb = vec3(curva(rgb.r, 1.0), curva(rgb.g, 2.0), curva(rgb.b, 3.0));
    float y = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float nuovo = curva(y, 4.0);
    rgb = y > 0.00001 ? rgb * (nuovo / y) : vec3(nuovo);
  }
  if (u_caIntensity > 0.0) {
    vec3 p = clamp((rgb - u_caMin) / (u_caMax - u_caMin), 0.0, 1.0);
    vec3 uvw = (p * (u_caSize - 1.0) + 0.5) / u_caSize;
    rgb = mix(rgb, texture(u_caLut, uvw).rgb, u_caIntensity);
  }
  return rgb;
}`,Ht=class{gl;cache=new Map;usate=new Set;avvisi=new Set;constructor(e){this.gl=e}inizia(){this.usate.clear()}finisce(){for(let[e,t]of this.cache)this.usate.has(e)||(this.gl.deleteTexture(t.tex),this.cache.delete(e))}distruggi(){for(let e of this.cache.values())this.gl.deleteTexture(e.tex);this.cache.clear()}texture(e,t,n,r,i,a){this.usate.add(e);let o=this.cache.get(e);if(o)return o.tex;let s=this.gl,c=s.createTexture();if(!c)throw Error(`Memoria video esaurita per il colore`);let l=s.getParameter(t===s.TEXTURE_3D?s.TEXTURE_BINDING_3D:s.TEXTURE_BINDING_2D),u=s.getParameter(s.UNPACK_FLIP_Y_WEBGL),d=s.getParameter(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL);try{s.bindTexture(t,c),s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,!1),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1);for(let e of[s.TEXTURE_MIN_FILTER,s.TEXTURE_MAG_FILTER])s.texParameteri(t,e,s.LINEAR);for(let e of[s.TEXTURE_WRAP_S,s.TEXTURE_WRAP_T,...i?[s.TEXTURE_WRAP_R]:[]])s.texParameteri(t,e,s.CLAMP_TO_EDGE);if(i?s.texImage3D(t,0,s.RGBA16F,n,r,i,0,s.RGBA,s.FLOAT,a):s.texImage2D(t,0,s.RGBA16F,n,r,0,s.RGBA,s.FLOAT,a),s.getError()!==s.NO_ERROR){let e=`Colore: questa scheda usa LUT/curve a 8 bit; valori fuori 0–1 e precisione ridotti`;this.avvisi.has(e)||(this.avvisi.add(e),console.warn(e));let o=Uint8Array.from(a,e=>Math.round(Math.max(0,Math.min(1,e))*255));if(i?s.texImage3D(t,0,s.RGBA8,n,r,i,0,s.RGBA,s.UNSIGNED_BYTE,o):s.texImage2D(t,0,s.RGBA8,n,r,0,s.RGBA,s.UNSIGNED_BYTE,o),s.getError()!==s.NO_ERROR)throw Error(`La scheda video non riesce a caricare il colore`)}return this.cache.set(e,{tex:c,target:t}),c}catch(e){throw s.deleteTexture(c),e}finally{s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,u),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,d),s.bindTexture(t,l)}}imposta(e,t,n,r){let i=this.gl,a=i.getParameter(i.ACTIVE_TEXTURE),o=t.lut?.intensita?e.luts?.find(e=>e.id===t.lut.id):void 0;if(t.lut&&t.lut.intensita>0&&!o){let e=`LUT mancante: ricarica il file .cube dal pannello Colore avanzato`;this.avvisi.has(e)||(this.avvisi.add(e),console.warn(e))}i.uniform1i(n.u_caManuale,+!!r),i.uniform3f(n.u_caLift,...t.lift),i.uniform3f(n.u_caGamma,...t.gamma),i.uniform3f(n.u_caGain,...t.gain),i.uniform1i(n.u_caCurve,4),i.uniform1i(n.u_caLut,5);let s=!Tt(t.curve);i.uniform1i(n.u_caCurveOn,+!!s);try{i.activeTexture(i.TEXTURE4);let e=`curve:`+(s?JSON.stringify(t.curve):`identita`);i.bindTexture(i.TEXTURE_2D,this.texture(e,i.TEXTURE_2D,bt,5,0,Wt(s?t.curve:void 0,e))),i.activeTexture(i.TEXTURE5);let r=o??Gt,a=`lut:`+r.hash,c=this.cache.get(a)?.tex;if(c)this.usate.add(a);else{if(!Ft(r)||r.n>i.getParameter(i.MAX_3D_TEXTURE_SIZE))throw Error(`LUT non valida o troppo grande per questa scheda video`);let e=new Float32Array(r.n**3*4);for(let t=0;t<r.n**3;t++)e[t*4]=r.dati[t*3],e[t*4+1]=r.dati[t*3+1],e[t*4+2]=r.dati[t*3+2],e[t*4+3]=1;c=this.texture(a,i.TEXTURE_3D,r.n,r.n,r.n,e)}i.bindTexture(i.TEXTURE_3D,c),i.uniform1f(n.u_caIntensity,o?Math.max(0,Math.min(1,t.lut.intensita)):0),i.uniform1f(n.u_caSize,r.n),i.uniform3f(n.u_caMin,...r.domainMin),i.uniform3f(n.u_caMax,...r.domainMax)}finally{i.activeTexture(a)}}},Ut=new Map;function Wt(e,t){let n=Ut.get(t);return n||(n=Et(e),Ut.size>=16&&Ut.delete(Ut.keys().next().value),Ut.set(t,n)),n}var Gt={id:``,hash:`identita`,nome:`Identità`,n:2,domainMin:[0,0,0],domainMax:[1,1,1],dati:[0,0,0,1,0,0,0,1,0,1,1,0,0,0,1,1,0,1,0,1,1,1,1,1]},Kt=e({BIT_LOOK:()=>Jt,RITOCCHI:()=>qt,fxEffettivo:()=>Yt}),qt={vivace:{sat:1.35,contrast:.06},luminoso:{bright:.1,contrast:.05},caldo:{temp:.4},freddo:{temp:-.4},vignetta:{vignette:.55},zoom:{zoom:.15},specchia:{mirror:!0},bn:{look:`bn`},seppia:{look:`seppia`},pellicola:{look:`film`},vhs:{look:`vhs`},crt:{look:`crt`},pop:{sat:1.5,contrast:.14},contrasto:{contrast:.24,bright:-.02},notte:{bright:-.09,temp:-.55,sat:.8,vignette:.25},sbiadito:{contrast:-.18,bright:.06,sat:.7},tramonto:{temp:.8,sat:1.12,hue:-5},cinema:{contrast:.12,sat:.88,temp:.12,vignette:.3},sogno:{bright:.07,contrast:-.12,sat:1.15,vignette:.2},gelo:{temp:-.8,sat:.75,bright:.04}},Jt={none:0,vhs:1,film:2,bn:4,seppia:8,crt:16};function Yt(e){let t={bright:e.bright,contrast:e.contrast,sat:e.sat,hue:e.hue,temp:e.temp??0,vignette:e.vignette??0,zoom:e.zoom??0,mirror:!!e.mirror,looks:Jt[e.look]??0};for(let n of e.effetti??[]){let e=qt[n];e&&(t.bright+=e.bright??0,t.contrast+=e.contrast??0,t.sat*=e.sat??1,t.hue+=e.hue??0,t.temp+=e.temp??0,t.vignette+=e.vignette??0,t.zoom+=e.zoom??0,e.mirror&&(t.mirror=!t.mirror),e.look&&(t.looks|=Jt[e.look]??0))}return t.temp=Math.max(-1.5,Math.min(1.5,t.temp)),t.vignette=Math.min(1,t.vignette),t.contrast=Math.max(.2,t.contrast),t}function Xt(e,t){let n=e.sottotitoli;if(n?.nelVideo)return n.righe.find(e=>e.da<=t&&t<e.a&&e.testo.trim())}function Zt(e,t,n,r){let i=a(e),o=i.logo&&_(i.logo.media)?.image?i.logo:null,s=Xt(e,t);if(!o&&!s)return null;let c=e.sottotitoli;return JSON.stringify([n,r,o,s?.testo??null,c?[c.dimensione,c.fascia,c.alto]:null])}function Qt(e,t,n){let r=[];for(let i of t.split(`
`)){let t=``;for(let a of i.split(/\s+/)){let i=t?t+` `+a:a;e.measureText(i).width>n&&t?(r.push(t),t=a):t=i}t&&r.push(t)}return r.slice(0,4)}function $t(e,t,n,r,i){e.clearRect(0,0,r,i);let o=a(t),s=o.logo?_(o.logo.media)?.image:void 0;if(o.logo&&s){let t=r*Math.max(.03,Math.min(.5,o.logo.scala)),n=t*(s.height/Math.max(1,s.width)),a=Math.round(Math.min(r,i)*.04),c=o.logo.pos.endsWith(`dx`)?r-a-t:a,l=o.logo.pos.startsWith(`alto`)?a:i-a-n;e.globalAlpha=Math.max(0,Math.min(1,o.logo.opacita)),e.drawImage(s,c,l,t,n),e.globalAlpha=1}let c=Xt(t,n),l=t.sottotitoli;if(c&&l){let t=Math.max(10,(l.dimensione||46)*(i/1080));e.font=`700 ${t}px "Rajdhani", "Segoe UI", system-ui, sans-serif`,e.textAlign=`center`,e.textBaseline=`middle`,e.lineJoin=`round`;let n=Qt(e,c.testo,r*.84),a=t*1.22,o=n.length*a,s=l.alto?i*.07+a/2:i*.93-o+a/2;if(l.fascia){let i=Math.max(...n.map(t=>e.measureText(t).width)),c=t*.35;e.fillStyle=`rgba(0,0,0,.58)`,e.beginPath(),e.roundRect(r/2-i/2-c,s-a/2-c*.5,i+c*2,o+c,t*.2),e.fill()}n.forEach((n,i)=>{let o=s+i*a;e.lineWidth=t*.14,e.strokeStyle=`rgba(0,0,0,.85)`,e.strokeText(n,r/2,o),e.fillStyle=`#ffffff`,e.fillText(n,r/2,o)})}}var en=112;function tn(e){return{k:J(e,`dim`,100)/100,nome:W(e,`nome`,`Nome Cognome`),ruolo:W(e,`ruolo`,``),colore:H(e,`colore`,`#ff5a36`)}}var $=(e,t=.45,n=Y.p3in)=>R(e.t,e.d-t,t,n);function nn(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`700 ${52*n}px ${q.montserrat}`,s=`400 ${27*n}px ${q.montserrat}`,c=F(t,r,o),l=i?F(t,i,s):0,u=12*n,d=30*n,f=40*n,p=22*n,m=52*n*1.06,h=i?27*n*1.2:0,g=i?7*n:0,_=u+d+Math.max(c,l)+f,v=p+m+g+h+24*n,y=fe(e,_),b=e.h-en-v;t.save();let x=R(e.t,.1,.55,Y.p4out),S=$(e);t.beginPath(),t.rect(y-40+(_+80)*S,b-40,(_+80)*(x-S)+.01,v+80),t.clip(),t.shadowColor=`rgba(15,17,21,.22)`,t.shadowBlur=44*n,t.shadowOffsetY=14*n,V(t,y,b,_,v,16*n),t.fillStyle=`#ffffff`,t.fill(),t.shadowColor=`transparent`,t.save(),V(t,y,b,_,v,16*n),t.clip(),t.fillStyle=a,t.fillRect(y,b,u,v),t.restore();let C=R(e.t,.3,.4,Y.p2out)*(1-S);L(t,r,y+u+d,b+p,{font:o,colore:`#0f1115`,base:`top`,alfa:C}),i&&L(t,i,y+u+d,b+p+m+g,{font:s,colore:`#5a6170`,base:`top`,alfa:C}),t.restore()}function rn(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`700 ${76*n}px ${q.oswald}`,s=`400 ${28*n}px ${q.mono}`,c=r.toUpperCase(),l=F(t,c,o,.4*n),u=i?F(t,i,s,1.1*n):0,d=Math.max(l,u),f=fe(e,d,130),p=76*n*.96,m=28*n*1.2,h=e.h-120-(p+14*n+6*n+(i?14*n+m:0)),g=R(e.t,.1,.55,Y.p3out),_=R(e.t,.46,.5,Y.p3out),v=R(e.t,.3,.5,Y.p4out),y=$(e,.32,Y.p2in),b=$(e,.3,Y.p2in),x=$(e,.3,Y.p2in);L(e.c,c,f,h-16*n*y+28*n*(1-g),{font:o,colore:`#fff`,base:`top`,spazio:.4*n,alfa:g*(1-y),ombra:{blur:22,colore:`rgba(0,0,0,.45)`}});let S=h+p+14*n;t.fillStyle=a,V(t,f,S,Math.max(0,d*v*(1-x)),6*n,3*n),t.fill(),i&&L(t,i,f,S+6*n+14*n+16*n*(1-_),{font:s,colore:`#e7eaf0`,base:`top`,spazio:1.1*n,alfa:_*(1-b),ombra:{blur:16,colore:`rgba(0,0,0,.45)`}})}function an(e){let{c:t}=e,{k:n,nome:r,colore:i}=tn(e),a=W(e,`etichetta`,`Ospite`),o=`400 ${58*n}px ${q.archivo}`,s=`700 ${24*n}px ${q.mono}`,c=r.toUpperCase(),l=a.toUpperCase(),u=F(t,c,o),d=F(t,l,s,1.4*n)+32*n,f=30*n,p=34*n,m=18*n,h=22*n,g=58*n*.98,_=24*n*1.2+14*n,v=12*n,y=f+Math.max(u,d)+p,b=m+g+v+_+h,x=fe(e,y,120),S=e.h-116-b,C=R(e.t,.1,.5,Y.p4out),w=$(e,.4);t.save(),t.beginPath(),t.rect(x-4+(y+8)*w,S-4,(y+8)*(C-w)+.01,b+8),t.clip(),t.fillStyle=`#141518`,t.fillRect(x,S,y,b);let T=R(e.t,.26,.42,Y.back(1.6));L(t,c,x+f,S+m+30*n*(1-T),{font:o,colore:`#fff`,base:`top`,alfa:R(e.t,.26,.3,Y.p2out)});let E=S+m+g+v;t.save(),t.beginPath(),t.rect(x+f,E,d,_),t.clip();let D=R(e.t,.5,.45,Y.back(2));t.fillStyle=i,t.fillRect(x+f,E+40*n*(1-D),d,_),L(t,l,x+f+16*n,E+7*n+40*n*(1-D),{font:s,colore:me(i),base:`top`,spazio:1.4*n}),t.restore(),t.restore()}function on(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`400 ${84*n}px ${q.bebas}`,s=`400 ${24*n}px ${q.mono}`,c=r.toUpperCase(),l=F(t,c,o,.8*n),u=i?F(t,i,s,1.2*n):0,d=32*n,f=36*n,p=20*n,m=24*n,h=84*n*.86,g=i?24*n*1.2:0,_=i?8*n:0,v=d+Math.max(l,u)+f,y=p+h+_+g+m,b=fe(e,v),x=e.h-116-y,S=R(e.t,.1,.5,Y.back(1.4)),C=$(e,.35,Y.p2in),w=R(e.t,.1,.25,Y.lineare)*(1-C),T=-80*(1-S)-60*C;t.save(),t.translate(T,0),t.globalAlpha=w,t.shadowColor=I(a,.34),t.shadowBlur=44*n,t.shadowOffsetY=16*n,t.fillStyle=a,t.fillRect(b,x,v,y),t.shadowColor=`transparent`;let E=me(a);L(t,c,b+d,x+p+24*n*(1-R(e.t,.3,.42,Y.p3out)),{font:o,colore:E,base:`top`,spazio:.8*n,alfa:R(e.t,.3,.3,Y.p2out)}),i&&L(t,i,b+d,x+p+h+_+18*n*(1-R(e.t,.4,.42,Y.p3out)),{font:s,colore:E===`#ffffff`?`rgba(255,255,255,.86)`:`rgba(20,21,24,.8)`,base:`top`,spazio:1.2*n,alfa:R(e.t,.4,.3,Y.p2out)}),t.restore()}function sn(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`700 ${48*n}px ${q.montserrat}`,s=`400 ${25*n}px ${q.montserrat}`,c=F(t,r,o),l=i?F(t,i,s,.5*n):0,u=32*n,d=38*n,f=24*n,p=26*n,m=48*n*1.02,h=i?25*n*1.2:0,g=12*n,_=u+Math.max(c,l)+d,v=f+m+g+4*n+(i?g+h:0)+p,y=fe(e,_,120),b=e.h-110-v,x=R(e.t,.1,.5,Y.p3out),S=$(e,.35,Y.p2in);t.save(),t.translate(0,60*(1-x)+24*S),t.globalAlpha=x*(1-S),t.shadowColor=`rgba(0,0,0,.4)`,t.shadowBlur=50*n,t.shadowOffsetY=18*n,V(t,y,b,_,v,14*n),t.fillStyle=`#16181d`,t.fill(),t.shadowColor=`transparent`,L(t,r,y+u,b+f+14*(1-R(e.t,.26,.45,Y.p3out)),{font:o,colore:`#fff`,base:`top`,alfa:R(e.t,.26,.3,Y.p2out)});let C=b+f+m+g;t.fillStyle=a,V(t,y+u,C,(_-u-d)*R(e.t,.42,.5,Y.p4out),4*n,2*n),t.fill(),i&&L(t,i,y+u,C+4*n+g,{font:s,colore:`#aeb6c2`,base:`top`,spazio:.5*n,alfa:R(e.t,.56,.45,Y.p2out)}),t.restore()}function cn(e){let{c:t}=e,{k:n,nome:r,colore:i}=tn(e),a=W(e,`etichetta`,`In studio`).toUpperCase(),o=`700 ${22*n}px ${q.mono}`,s=`400 ${70*n}px ${q.archivo}`,c=r.toUpperCase(),l=F(t,a,o,2.2*n)+28*n,u=22*n*1.2+12*n,d=F(t,c,s,-1*n),f=Math.max(l,d),p=70*n*.98,m=fe(e,f,130),h=e.h-122-5*n,g=h-14*n-p,_=g-14*n-u,v=R(e.t,.1,.42,Y.back(2)),y=R(e.t,.32,.45,Y.back(1.5)),b=R(e.t,.5,.5,Y.p4out),x=$(e,.3,Y.p2in),S=$(e,.32,Y.p2in),C=$(e,.3,Y.p2in);t.save(),t.beginPath(),t.rect(m-4,_-4,l+8,u+8),t.clip(),t.fillStyle=i,t.fillRect(m,_-40*n*(1-v)-40*n*x,l,u),L(t,a,m+14*n,_+6*n-40*n*(1-v)-40*n*x,{font:o,colore:me(i),base:`top`,spazio:2.2*n}),t.restore(),L(t,c,m,g+34*n*(1-y)-16*n*S,{font:s,colore:`#fff`,base:`top`,spazio:-1*n,alfa:Math.min(1,y*1.4)*(1-S),ombra:{blur:22,colore:`rgba(0,0,0,.5)`}}),t.fillStyle=i,V(t,m,h,f*b*(1-C),5*n,3*n),t.fill()}function ln(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`900 ${72*n}px ${q.montserrat}`,s=`500 ${28*n}px ${q.montserrat}`,c=F(t,r,o,-1.4*n),l=i?F(t,i,s,.5*n):0,u=fe(e,Math.max(c,l),130),d=72*n*1.06,f=28*n*1.2,p=e.h-122-(d+(i?14*n+f:0)),m=R(e.t,.16,.5,Y.p2io),h=R(e.t,.12,.55,Y.p2io),g=$(e,.4,Y.p2in);t.save(),t.beginPath(),t.rect(u-6+(c+12)*g,p-4,(c+12)*(m-g)+.01,d+8),t.clip(),L(t,r,u,p,{font:o,colore:`#fff`,base:`top`,spazio:-1.4*n,ombra:{blur:22,colore:`rgba(0,0,0,.45)`}}),t.restore();let _=u+c*h,v=(1-R(e.t,.6,.15,Y.lineare))*R(e.t,.1,.12,Y.lineare);v>.01&&g===0&&(t.fillStyle=I(a,v),t.fillRect(_,p-2,8*n,d+4)),i&&L(t,i,u,p+d+14*n+14*n*(1-R(e.t,.55,.5,Y.p3out)),{font:s,colore:`#e7eaf0`,base:`top`,spazio:.5*n,alfa:R(e.t,.55,.4,Y.p2out)*(1-$(e,.3,Y.p2in)),ombra:{blur:16,colore:`rgba(0,0,0,.45)`}})}function un(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`700 ${46*n}px ${q.montserrat}`,s=`500 ${25*n}px ${q.montserrat}`,c=F(t,r,o),l=i?F(t,i,s,.8*n):0,u=38*n,d=26*n,f=46*n*1.05,p=i?25*n*1.2:0,m=i?8*n:0,h=u*2+Math.max(c,l),g=d*2+f+m+p,_=fe(e,h,120),v=e.h-120-g,y=$(e,.36,Y.p2in),b=R(e.t,.08,.55,Y.p3out),x=R(e.t,.08,.8,Y.p3io);t.save(),t.globalAlpha=b*(1-y),t.translate(_,v+g),t.scale(.965+.035*b,.965+.035*b),t.translate(-_,-(v+g)),V(t,_,v,h,g,18*n),t.fillStyle=`rgba(8,10,20,.72)`,t.fill();let S=2*(h+g);t.setLineDash([S*x,S]),t.lineDashOffset=0,t.lineWidth=3*n,t.strokeStyle=a,t.shadowColor=a,t.shadowBlur=26*n,V(t,_,v,h,g,18*n),t.stroke(),t.stroke(),t.setLineDash([]),t.shadowColor=`transparent`,L(t,r,_+u,v+d+18*(1-R(e.t,.3,.5,Y.p3out)),{font:o,colore:`#fff`,base:`top`,alfa:R(e.t,.3,.35,Y.p2out)}),i&&L(t,i,_+u,v+d+f+m+12*(1-R(e.t,.44,.5,Y.p3out)),{font:s,colore:K(a,.2),base:`top`,spazio:.8*n,alfa:R(e.t,.44,.35,Y.p2out),ombra:{blur:14*n,colore:I(a,.8),y:0}}),t.restore()}function dn(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`400 ${92*n}px ${q.bebas}`,s=`400 ${26*n}px ${q.mono}`,c=r.toUpperCase(),l=F(t,c,o,.9*n),u=i?F(t,i,s,1*n):0,d=92*n*.86,f=i?26*n*1.2:0,p=i?12*n:0,m=d+p+f,h=8*n+26*n+Math.max(l,u),g=fe(e,h,130),_=e.h-120-m,v=R(e.t,.1,.5,Y.p3out),y=$(e,.32,Y.p2in);t.fillStyle=a,V(t,g,_,8*n,m*v*(1-y),4*n),t.fill();let b=R(e.t,.26,.5,Y.p3out),x=R(e.t,.38,.5,Y.p3out);L(t,c,g+34*n-24*(1-b),_-4*n-14*$(e,.32,Y.p2in),{font:o,colore:`#fff`,base:`top`,spazio:.9*n,alfa:b*(1-$(e,.32,Y.p2in)),ombra:{blur:22,colore:`rgba(0,0,0,.5)`}}),i&&L(t,i,g+34*n-24*(1-x),_+d+p,{font:s,colore:`#e7eaf0`,base:`top`,spazio:1*n,alfa:x*(1-$(e,.3,Y.p2in)),ombra:{blur:16,colore:`rgba(0,0,0,.5)`}})}function fn(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`700 ${46*n}px ${q.montserrat}`,s=`400 ${25*n}px ${q.montserrat}`,c=F(t,r,o),l=i?F(t,i,s):0,u=46*n*1.04,d=i?25*n*1.2:0,f=i?4*n:0,p=26*n,m=40*n,h=20*n,g=18*n,_=22*n,v=p+g+_+Math.max(c,l)+m,y=h*2+u+f+d,b=fe(e,v),x=e.h-120-y,S=R(e.t,.1,.55,Y.back(1.7)),C=$(e,.35,Y.p2in);t.save();let w=(.88+.12*S)*(1-.06*C);t.translate(b,x+y),t.scale(w,w),t.translate(-b,-(x+y)),t.globalAlpha=Math.min(1,S*1.5)*(1-C),t.translate(0,18*(1-S)+14*C),t.shadowColor=`rgba(15,17,21,.24)`,t.shadowBlur=46*n,t.shadowOffsetY=16*n,V(t,b,x,v,y,y/2),t.fillStyle=`#fff`,t.fill(),t.shadowColor=`transparent`;let T=R(e.t,.4,.4,Y.back(3));t.fillStyle=a,t.beginPath(),t.arc(b+p+g/2,x+y/2,g/2*T,0,Math.PI*2),t.fill();let E=b+p+g+_;L(t,r,E-10*(1-R(e.t,.42,.45,Y.p3out)),x+h,{font:o,colore:`#0f1115`,base:`top`,alfa:R(e.t,.42,.3,Y.p2out)}),i&&L(t,i,E-10*(1-R(e.t,.5,.45,Y.p3out)),x+h+u+f,{font:s,colore:`#5a6170`,base:`top`,alfa:R(e.t,.5,.3,Y.p2out)}),t.restore()}function pn(e){let{c:t}=e,{k:n,nome:r,ruolo:i,colore:a}=tn(e),o=`400 ${52*n}px ${q.archivo}`,s=`700 ${23*n}px ${q.mono}`,c=r.toUpperCase(),l=i.toUpperCase(),u=F(t,c,o,-.8*n)+60*n,d=i?F(t,l,s,1.4*n)+44*n:0,f=52*n+28*n,p=23*n+18*n,m=8*n,h=14*n,g=Math.max(u,d+h),_=fe(e,g,120),v=e.h-116-(f+(i?m+p:0)),y=R(e.t,.1,.5,Y.p4out),b=R(e.t,.34,.5,Y.p4out),x=$(e,.36,Y.p3in),S=$(e,.32,Y.p3in);if(t.save(),t.beginPath(),t.rect(_+u*x,v-2,u*(y-x)+.01,f+4),t.clip(),t.fillStyle=`#141518`,t.fillRect(_,v,u,f),L(t,c,_+30*n,v+14*n,{font:o,colore:`#fff`,base:`top`,spazio:-.8*n}),t.restore(),i){let e=_+h;t.save(),t.beginPath(),t.rect(e+d*(1-b),v+f+m-2,d*(b-S)+.01,p+4),t.clip(),t.fillStyle=a,t.fillRect(e,v+f+m,d,p),L(t,l,e+22*n,v+f+m+9*n,{font:s,colore:me(a),base:`top`,spazio:1.4*n}),t.restore()}}var mn=Object.fromEntries(Object.entries({"lt-barra":nn,"lt-sottolinea":rn,"lt-blocco":an,"lt-colore":on,"lt-scheda":sn,"lt-kicker":cn,"lt-maschera":ln,"lt-neon":un,"lt-linea":dn,"lt-pillola":fn,"lt-barre":pn}).map(([e,t])=>[e,oe(t)])),hn=(e,t)=>t*(J(e,`dim`,100)/100),gn=e=>e.split(/\s+/).reduce((e,t)=>t.length>e.length?t:e,``);function _n(e){let{c:t}=e,n=W(e,`testo`,`Un giorno speciale`),r=U(e.v,`font`),i=e.w*.82,a=G(t,gn(n),e=>`700 ${e}px ${r}`,hn(e,100),i),o=`700 ${a}px ${r}`,s=e.v.unita===`lettera`,c=se(t,n,o,i),l=a*1.18,u=(e.h-c.length*l)/2,d=[];c.forEach((n,r)=>{let i=s?[...n]:n.split(` `),a=F(t,` `,o),c=s?F(t,n,o):i.reduce((e,n)=>e+F(t,n,o),0)+a*(i.length-1),f=(e.w-c)/2;for(let e of i)d.push({s:e,x:f,y:u+r*l}),f+=F(t,e,o)+(s?0:a)});let f=d.length,p=Math.min(.16,1.9/Math.max(1,f)),m=z(e,.45);d.forEach((n,r)=>{let i=R(e.t,.2+r*p,.7,Y.p3out);if(i<=0)return;let a=n.y+46*(1-i)-20*(1-m);ce(t,n.s,n.x,a,{font:o,colore:H(e,`colore`,`#ffffff`),base:`top`,alfa:Math.min(1,i*1.6)*m,ombra:{blur:24,colore:`rgba(0,0,0,.45)`}},16*(1-i))})}var vn=`ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$<>/\\=+*`;function yn(e){let{c:t}=e,n=W(e,`testo`,`DA PROD VIDEO`),r=H(e,`colore`,`#46e5b7`),i=e.v.stile!==`pulito`,a=e=>`700 ${e}px "Space Mono", "Courier New", monospace`,o=G(e.c,(i?`> `:``)+n,a,hn(e,120),e.w*.8),s=a(o),c=i?`> `:``,l=c+n,u=F(t,l,s),d=(e.w-u)/2,f=e.h/2+o*.34,p=z(e,.4);t.save(),t.globalAlpha=p,i&&(V(t,d-60,f-o*.86-46,u+120,o+92,18),t.fillStyle=`rgba(6,10,14,.82)`,t.fill(),t.lineWidth=3,t.strokeStyle=I(r,.85),t.stroke());let m=.35+n.length*.09+.6,h=X((e.t-.35)/Math.max(.1,m-.35-.6))*n.length,g=F(t,c,s);L(t,c,d,f,{font:s,colore:I(r,.7)});let _=d+g;[...n].forEach((n,i)=>{let a=F(t,n,s),o=n,c=i<Math.floor(h)||n===` `;c||(o=vn[Math.floor(Z(i,Math.floor(e.t*24))*48)]);let l=i===Math.floor(h);L(t,o,_,f,{font:s,colore:c?K(r,.55):r,alfa:c?1:e.t<.35?0:.55+(l?.45:0),ombra:{blur:c?0:18,colore:r,y:0}}),_+=a}),(Math.floor(e.t*2.4)%2==0||h<n.length)&&(t.fillStyle=r,t.fillRect(_+6,f-o*.78,o*.5,o*.9)),t.restore()}function bn(e){let{c:t}=e,n=W(e,`prima`,``),r=W(e,`dopo`,``),i=String(e.v.opzioni??``).split(`,`).map(e=>e.trim()).filter(Boolean);i.length||i.push(`…`);let a=U(e.v,`font`),o=[n,...i,r].filter(Boolean).join(` `),s=G(t,o,e=>`700 ${e}px ${a}`,hn(e,100),e.w*.84),c=`700 ${s}px ${a}`,l=H(e,`colore`,`#ffd23f`),u=F(t,` `,c),d=Math.max(...i.map(e=>F(t,e,c))),f=n?F(t,n,c)+u:0,p=r?u+F(t,r,c):0,m=f+d+p,h=(e.w-m)/2,g=e.h/2+s*.34,_=s*1.25,v=z(e,.4),y=Math.max(.55,Math.min(.9,3.2/i.length));t.save(),t.globalAlpha=v;let b=R(e.t,.1,.6,Y.p3out);t.globalAlpha*=b,n&&L(t,n,h,g,{font:c,colore:`#fff`,ombra:{blur:22,colore:`rgba(0,0,0,.45)`}}),r&&L(t,r,h+f+d+u,g,{font:c,colore:`#fff`,ombra:{blur:22,colore:`rgba(0,0,0,.45)`}}),t.save(),t.beginPath(),t.rect(h+f-20,g-s*1,d+40,_),t.clip();let x=(e.t-.7)/y,S=Math.max(0,Math.min(i.length-1,Math.floor(x))),C=x<0?0:S>=i.length-1?1:R(x-S,0,.5,Y.p3io)*1,w=x<0?0:S,T=Math.min(i.length-1,w+1),E=x<0||w>=i.length-1?0:C,D=h+f;L(t,i[w],D,g-_*E,{font:c,colore:l,alfa:1-E*.6,ombra:{blur:22,colore:`rgba(0,0,0,.4)`}}),w!==T&&L(t,i[T],D,g+_*(1-E),{font:c,colore:l,alfa:.4+E*.6,ombra:{blur:22,colore:`rgba(0,0,0,.4)`}}),t.restore(),t.restore()}function xn(e){let{c:t}=e,n=W(e,`testo`,`È ARRIVATO IL MOMENTO`),r=U(e.v,`font`,`archivo`),i=G(t,gn(n),e=>`900 ${e}px ${r}`,hn(e,150),e.w*.86),a=`900 ${i}px ${r}`,o=n.split(/\s+/).filter(Boolean),s=i*1.1,c=F(t,` `,a),l=e.w*.86,u=[[]],d=0;o.forEach((e,n)=>{let r=F(t,e,a);d&&d+c+r>l&&(u.push([]),d=0),u[u.length-1].push({s:e,w:r,i:n}),d+=(d?c:0)+r});let f=(e.h-u.length*s)/2,p=z(e,.4);u.forEach((n,r)=>{let i=n.reduce((e,t)=>e+t.w,0)+c*(n.length-1),l=(e.w-i)/2;n.forEach(n=>{let i=.15+n.i*.32,u=R(e.t,i,.2,Y.p4out);if(u>0){let c=n.i===o.length-1,d=e.t-i,m=B(2.6,1,u),h=d>.08?Math.sin(d*60)*Math.exp(-d*12)*10:0;t.save(),t.translate(l+n.w/2+h,f+r*s+s*.5),t.rotate((Z(n.i,3)-.5)*.06*(1-u)),t.scale(m,m),L(t,n.s,-n.w/2,0,{font:a,colore:c?H(e,`evidenzia`,`#ffd23f`):H(e,`colore`,`#fff`),base:`middle`,alfa:Math.min(1,u*3)*p,ombra:{blur:26,colore:`rgba(0,0,0,.6)`,y:6},contorno:{colore:`rgba(0,0,0,.55)`,px:8}}),t.restore()}l+=n.w+c})})}function Sn(e){let{c:t}=e,n=W(e,`testo`,`La cosa più importante è esserci`),r=W(e,`parola`,``),i=U(e.v,`font`),a=G(t,gn(n),e=>`700 ${e}px ${i}`,hn(e,92),e.w*.82),o=`700 ${a}px ${i}`,s=se(t,n,o,e.w*.82),c=a*1.3,l=(e.h-s.length*c)/2,u=z(e,.4),d=R(e.t,.1,.6,Y.p3out),f=H(e,`pennarello`,`#ffd23f`),p=H(e,`colore`,`#ffffff`),m=me(f);s.forEach((n,i)=>{let a=F(t,n,o),s=(e.w-a)/2,h=l+i*c+14*(1-d),g=r?n.toLowerCase().indexOf(r.toLowerCase()):-1;t.save(),t.globalAlpha=u;let _={font:o,base:`top`,alfa:d,ombra:{blur:20,colore:`rgba(0,0,0,.4)`}};if(g<0){L(t,n,s,h,{..._,colore:p}),t.restore();return}let v=s+F(t,n.slice(0,g),o),y=F(t,n.slice(g,g+r.length),o),b=R(e.t,.9,.6,Y.p3io);t.save(),t.beginPath(),t.rect(v-24,h-10,(y+48)*b,c),t.clip(),t.fillStyle=I(f,.92),t.beginPath(),t.moveTo(v-14,h+c*.1),t.lineTo(v+y+10,h+c*.05),t.lineTo(v+y+16,h+c*.82),t.lineTo(v-8,h+c*.86),t.closePath(),t.fill(),t.restore(),L(t,n,s,h,{..._,colore:p}),t.save(),t.beginPath(),t.rect(v-24,h-10,(y+24)*b,c),t.clip(),L(t,n.slice(g,g+r.length),v,h,{font:o,base:`top`,colore:m,alfa:d}),t.restore(),t.restore()})}function Cn(e){let{c:t}=e,n=W(e,`titolo`,`Una storia lunga un giorno`),r=W(e,`sottotitolo`,``),i=U(e.v,`font`,`playfair`),a=G(t,gn(n),e=>`700 ${e}px ${i}`,hn(e,120),e.w*.8),o=`700 ${a}px ${i}`,s=se(t,n,o,e.w*.8),c=a*1.12,l=s.length*c,u=e.h/2-l/2-(r?a*.3:0),d=z(e,.45);s.forEach((n,r)=>{let i=R(e.t,.15+r*.12,.8,Y.p4out),a=F(t,n,o),s=(e.w-a)/2,l=u+r*c;t.save(),t.beginPath(),t.rect(s-20,l,a+40,c),t.clip(),L(t,n,s,l+c*.9*(1-i)+(1-d)*-20,{font:o,colore:H(e,`colore`,`#fff`),base:`top`,alfa:d,ombra:{blur:24,colore:`rgba(0,0,0,.5)`}}),t.restore()});let f=u+l+a*.16,p=Math.min(e.w*.5,620)*R(e.t,.7,.8,Y.p4out);t.fillStyle=I(H(e,`accento`,`#ffd23f`),d),t.fillRect(e.w/2-p/2,f,p,5);let m=r?G(t,r.toUpperCase(),e=>`500 ${e}px "Montserrat", sans-serif`,a*.34,e.w*.84,a*.06):0;r&&L(t,r.toUpperCase(),e.w/2,f+34+18*(1-R(e.t,1.1,.7,Y.p3out)),{font:`500 ${m}px "Montserrat", sans-serif`,colore:`#fff`,align:`center`,base:`top`,spazio:a*.06,alfa:R(e.t,1.1,.6,Y.p2out)*d,ombra:{blur:18,colore:`rgba(0,0,0,.5)`}})}function wn(e){let{c:t}=e,n=W(e,`testo`,`Grazie di cuore`),r=U(e.v,`font`,`caveat`),i=G(t,n,e=>`700 ${e}px ${r}`,hn(e,190),e.w*.8),a=`700 ${i}px ${r}`,o=F(t,n,a),s=(e.w-o)/2,c=e.h/2+i*.2,l=z(e,.45),u=R(e.t,.25,Math.min(2.4,.5+n.length*.11),Y.p2io);t.save(),t.globalAlpha=l,t.beginPath(),t.rect(s-30,c-i*1.2,(o+60)*u,i*1.9),t.clip(),L(t,n,s,c,{font:a,colore:H(e,`colore`,`#fff`),ombra:{blur:22,colore:`rgba(0,0,0,.5)`}}),t.restore();let d=R(e.t,.25+Math.min(2.4,.5+n.length*.11),.7,Y.p3out);if(d>0){t.save(),t.globalAlpha=l,t.strokeStyle=H(e,`accento`,`#ff4d6d`),t.lineWidth=Math.max(5,i*.04),t.lineCap=`round`;let n=c+i*.2,r=o*1.1;t.setLineDash([r*d,r]),t.beginPath(),t.moveTo(s,n+6),t.bezierCurveTo(s+o*.25,n-14,s+o*.55,n+20,s+o,n-4),t.stroke(),t.restore()}}var Tn={"tx-parole":_n,"tx-decodifica":yn,"tx-cambia":bn,"tx-colpo":xn,"tx-penna":Sn,"tx-titolo":Cn,"tx-scrivi":wn},En=(e,t)=>t*(J(e,`dim`,100)/100);function Dn(e){let{c:t}=e,n=J(e,`valore`,1250),r=String(e.v.prefisso??``),i=String(e.v.suffisso??``),a=H(e,`colore`,`#ffd23f`),o=U(e.v,`font`),s=G(t,r+de(n)+i,e=>`700 ${e}px ${o}`,En(e,240),e.w*.8),c=`700 ${s}px ${o}`,l=`700 ${s*.5}px ${o}`,u=n*R(e.t,.3,2.2,Y.p3out),d=de(u),f=r?F(t,r,l)+8:0,p=i?F(t,i,l)+8:0,m=F(t,d,c),h=e.t-2.5,g=h>0?1+.07*Math.exp(-h*7)*Math.cos(h*14):1,_=z(e,.45),v=R(e.t,.05,.4,Y.p3out),y=f+m+p;t.save(),t.globalAlpha=_*v,t.translate(e.w/2,e.h/2-s*.08),t.scale(g,g);let b=-y/2,x=s*.34;r&&L(t,r,b,x-s*.02,{font:l,colore:K(a,.2),ombra:{blur:24,colore:`rgba(0,0,0,.45)`}}),L(t,d,b+f,x,{font:c,colore:a,ombra:{blur:30,colore:`rgba(0,0,0,.5)`,y:4}}),i&&L(t,i,b+f+m+8,x-s*.02,{font:l,colore:K(a,.2),ombra:{blur:24,colore:`rgba(0,0,0,.45)`}}),t.restore();let S=W(e,`etichetta`,``);if(S){let n=e=>`500 ${e}px "Montserrat", sans-serif`,r=G(t,S.toUpperCase(),n,s*.16,e.w*.84,s*.025);L(t,S.toUpperCase(),e.w/2,e.h/2+s*.38+10*(1-R(e.t,.6,.5,Y.p3out)),{font:n(r),colore:`#fff`,align:`center`,base:`top`,spazio:s*.025,alfa:R(e.t,.6,.5,Y.p2out)*_*.9,ombra:{blur:16,colore:`rgba(0,0,0,.5)`}})}}function On(e){let{c:t}=e,n=Math.max(0,Math.min(100,J(e,`percento`,75))),r=H(e,`colore`,`#46e5b7`),i=En(e,210),a=i*.16,o=U(e.v,`font`),s=R(e.t,.3,2,Y.p3out),c=z(e,.45),l=R(e.t,.05,.5,Y.p3out),u=e.w/2,d=e.h/2-i*.05;t.save(),t.globalAlpha=c*l,t.lineWidth=a,t.lineCap=`round`,t.strokeStyle=`rgba(255,255,255,.16)`,t.beginPath(),t.arc(u,d,i,0,Math.PI*2),t.stroke(),t.strokeStyle=r,t.shadowColor=r,t.shadowBlur=30,t.beginPath(),t.arc(u,d,i,-Math.PI/2,-Math.PI/2+Math.PI*2*(n/100)*s),t.stroke(),t.shadowColor=`transparent`,L(t,Math.round(n*s)+`%`,u,d+i*.03,{font:`700 ${i*.62}px ${o}`,colore:`#fff`,align:`center`,base:`middle`,ombra:{blur:24,colore:`rgba(0,0,0,.5)`}});let f=W(e,`etichetta`,``);if(f){let e=e=>`500 ${e}px "Montserrat", sans-serif`,n=G(t,f.toUpperCase(),e,i*.14,i*1.5,i*.02);L(t,f.toUpperCase(),u,d+i*.5,{font:e(n),colore:`rgba(255,255,255,.85)`,align:`center`,base:`middle`,spazio:i*.02})}t.restore()}function kn(e){let{c:t}=e,n=H(e,`colore`,`#35e8ff`),r=String(e.v.voci??``).split(`
`).map(e=>{let[t,n]=e.split(`:`);return{n:(t??``).trim(),v:Math.max(0,Number((n??`0`).replace(`,`,`.`))||0)}}).filter(e=>e.n).slice(0,8);if(!r.length)return;let i=Math.max(...r.map(e=>e.v),1),a=En(e,100),o=U(e.v,`font`),s=Math.min(e.w*.7,1300)*(a/100),c=(e.w-s)/2,l=Math.min(96,560/r.length)*(a/100),u=l*.28,d=W(e,`titolo`,``),f=r.length*l+(r.length-1)*u+(d?a*.9:0),p=(e.h-f)/2,m=z(e,.45);t.save(),t.globalAlpha=m,d&&(L(t,d,c,p,{font:`700 ${G(t,d,e=>`700 ${e}px ${o}`,a*.5,s)}px ${o}`,colore:`#fff`,base:`top`,alfa:R(e.t,.05,.5,Y.p2out),ombra:{blur:20,colore:`rgba(0,0,0,.5)`}}),p+=a*.9);let h=r.reduce((e,t)=>t.n.length>e.length?t.n:e,``),g=`600 ${G(t,h,e=>`600 ${e}px ${o}`,l*.42,s*.34)}px ${o}`,_=Math.max(...r.map(e=>F(t,e.n,g)))+26;r.forEach((r,a)=>{let d=R(e.t,.4+a*.28,.9,Y.p4out),f=p+a*(l+u);L(t,r.n,c,f+l/2,{font:g,colore:`#fff`,base:`middle`,alfa:R(e.t,.3+a*.28,.4,Y.p2out),ombra:{blur:14,colore:`rgba(0,0,0,.5)`}});let m=(s-_-130)*(r.v/i)*d;if(V(t,c+_,f+l*.16,s-_-110,l*.68,l*.34),t.fillStyle=`rgba(255,255,255,.12)`,t.fill(),m>1){V(t,c+_,f+l*.16,Math.max(l*.68,m),l*.68,l*.34);let e=t.createLinearGradient(c+_,0,c+_+m,0);e.addColorStop(0,I(n,.75)),e.addColorStop(1,n),t.fillStyle=e,t.fill()}L(t,de(r.v*d),c+s,f+l/2,{font:`700 ${l*.46}px ${o}`,colore:`#fff`,align:`right`,base:`middle`,alfa:Math.min(1,d*2),ombra:{blur:14,colore:`rgba(0,0,0,.5)`}})}),t.restore()}function An(e){let{c:t}=e,n=H(e,`colore`,`#ff4d6d`),r=String(e.v.punti??``).split(`,`).map(e=>Number(e.trim().replace(`,`,`.`))).filter(e=>Number.isFinite(e)).slice(0,24);if(r.length<2)return;let i=En(e,100),a=U(e.v,`font`),o=Math.min(e.w*.7,1400)*(i/100),s=i/100*480,c=(e.w-o)/2,l=(e.h-s)/2+40,u=Math.min(...r,0),d=Math.max(...r),f=e=>c+e/(r.length-1)*o,p=e=>l+s-(e-u)/Math.max(1e-6,d-u)*s,m=z(e,.45);t.save(),t.globalAlpha=m;let h=W(e,`titolo`,``);h&&L(t,h,c,l-64,{font:`700 ${G(t,h,e=>`700 ${e}px ${a}`,i*.5,o)}px ${a}`,colore:`#fff`,base:`top`,alfa:R(e.t,.05,.5,Y.p2out),ombra:{blur:20,colore:`rgba(0,0,0,.5)`}}),t.strokeStyle=`rgba(255,255,255,.14)`,t.lineWidth=2;for(let e=0;e<=4;e++){let n=l+s*e/4;t.beginPath(),t.moveTo(c,n),t.lineTo(c+o,n),t.stroke()}let g=R(e.t,.4,2.4,Y.p3io),_=(r.length-1)*g,v=r.map((e,t)=>[f(t),p(e)]);t.save(),t.beginPath(),t.moveTo(v[0][0],v[0][1]);for(let e=1;e<r.length;e++)if(e<=Math.floor(_))t.lineTo(v[e][0],v[e][1]);else if(e-1<=_){let n=_-(e-1);t.lineTo(B(v[e-1][0],v[e][0],n),B(v[e-1][1],v[e][1],n))}t.lineWidth=8,t.lineJoin=`round`,t.lineCap=`round`,t.strokeStyle=n,t.shadowColor=n,t.shadowBlur=24,t.stroke(),t.restore(),v.forEach(([e,r],i)=>{let a=X(_-i+.2);a<=0||(t.beginPath(),t.arc(e,r,12*a,0,Math.PI*2),t.fillStyle=`#fff`,t.fill(),t.lineWidth=6,t.strokeStyle=n,t.stroke())}),t.restore()}function jn(e){let{c:t}=e,n=H(e,`colore`,`#ffd23f`),r=Math.max(0,Math.min(100,J(e,`percento`,68))),i=En(e,100),a=U(e.v,`font`),o=Math.min(e.w*.62,1200)*(i/100),s=i/100*36,c=(e.w-o)/2,l=e.h/2,u=R(e.t,.4,2,Y.p3out),d=z(e,.45),f=R(e.t,.05,.5,Y.p3out);t.save(),t.globalAlpha=d*f;let p=`700 ${i*.62}px ${a}`,m=F(t,`100%`,p)+30,h=W(e,`etichetta`,``),g=e=>`600 ${e}px ${a}`;L(t,h,c,l-28,{font:g(h?G(t,h,g,i*.42,o-m):i*.42),colore:`#fff`,base:`bottom`,ombra:{blur:18,colore:`rgba(0,0,0,.5)`}}),L(t,Math.round(r*u)+`%`,c+o,l-28,{font:p,colore:n,align:`right`,base:`bottom`,ombra:{blur:18,colore:`rgba(0,0,0,.5)`}}),V(t,c,l,o,s,s/2),t.fillStyle=`rgba(255,255,255,.16)`,t.fill();let _=r/100*o*u;if(_>1){V(t,c,l,Math.max(s,_),s,s/2);let e=t.createLinearGradient(c,0,c+_,0);e.addColorStop(0,K(n,0)),e.addColorStop(1,K(n,.35)),t.fillStyle=e,t.shadowColor=n,t.shadowBlur=24,t.fill()}t.restore()}var Mn={"dt-contatore":Dn,"dt-anello":On,"dt-barre":kn,"dt-linea":An,"dt-progresso":jn},Nn=e=>J(e,`dim`,100)/100;function Pn(e,t,n,r,i=1){e.save(),e.translate(t,n),e.scale(r,r),e.globalAlpha*=i,e.beginPath(),e.moveTo(0,0),e.lineTo(0,34),e.lineTo(8,27),e.lineTo(14,40),e.lineTo(20,37),e.lineTo(14,25),e.lineTo(25,25),e.closePath(),e.fillStyle=`#fff`,e.lineWidth=3,e.strokeStyle=`#000`,e.lineJoin=`round`,e.shadowColor=`rgba(0,0,0,.4)`,e.shadowBlur=8,e.shadowOffsetY=3,e.stroke(),e.fill(),e.restore()}function Fn(e,t,n,r,i,a,o){let s=R(e.t,r,i-r,Y.p3io),c=t+360*o,l=n+300*o,u=X(1-Math.abs(e.t-a)/.14),d=R(e.t,a+.5,.5,Y.p2in);Pn(e.c,B(c,t,s)+60*o*d,B(l,n,s)+50*o*d,o*(1-.1*u),(1-d)*Math.min(1,s*3))}function In(e){let{c:t}=e,n=Nn(e),r=H(e,`colore`,`#ff2d6f`),i=W(e,`nome`,`@daprod`),a=W(e,`etichetta`,`Segui`),o=`700 ${44*n}px "Montserrat", sans-serif`,s=`500 ${26*n}px "Montserrat", sans-serif`,c=`700 ${32*n}px "Montserrat", sans-serif`,l=`✓ Segui già`,u=62*n,d=40*n,f=28*n,p=36*n,m=Math.max(F(t,i,o),F(t,`Consigliato per te`,s),F(t,`Ora lo segui`,s)),h=Math.max(240*n,Math.max(F(t,a,c),F(t,l,c))+80*n),g=78*n,_=Math.max(720*n,d+u*2+f+m+p+h+d),v=176*n;e.misura?.(_);let y=String(e.v.pos??`sinistra`),b=y===`centro`?(e.w-_)/2:y===`destra`?e.w-120-_:120,x=e.h-130-v-(y===`centro`?380:0),S=R(e.t,.1,.6,Y.back(1.5)),C=z(e,.45),w=2.05,T=e.t>w,E=X(1-Math.abs(e.t-w)/.12);t.save(),t.globalAlpha=Math.min(1,S*1.6)*C,t.translate(b+_/2,x+v/2),t.scale(.9+.1*S,.9+.1*S),t.translate(-(b+_/2),-(x+v/2)),t.shadowColor=`rgba(0,0,0,.5)`,t.shadowBlur=50,t.shadowOffsetY=18,V(t,b,x,_,v,36*n),t.fillStyle=`#14151b`,t.fill(),t.shadowColor=`transparent`;let D=b+d+u,O=x+v/2,k=t.createLinearGradient(D-u,O-u,D+u,O+u);k.addColorStop(0,K(r,.2)),k.addColorStop(1,le(r,.2)),t.beginPath(),t.arc(D,O,u,0,Math.PI*2),t.fillStyle=k,t.fill(),t.lineWidth=5*n,t.strokeStyle=`#14151b`,t.stroke(),L(t,(i.replace(`@`,``)[0]||`D`).toUpperCase(),D,O+2*n,{font:`800 ${68*n}px "Montserrat", sans-serif`,colore:`#fff`,align:`center`,base:`middle`}),L(t,i,D+u+f,O-18*n,{font:o,colore:`#fff`,base:`middle`}),L(t,T?`Ora lo segui`:`Consigliato per te`,D+u+f,O+26*n,{font:s,colore:`#9aa0ad`,base:`middle`});let A=b+_-d-h,j=x+(v-g)/2,M=1-.07*E;t.save(),t.translate(A+h/2,j+g/2),t.scale(M,M),t.translate(-h/2,-g/2),V(t,0,0,h,g,g/2),T?(t.fillStyle=`rgba(255,255,255,.08)`,t.fill(),t.lineWidth=3*n,t.strokeStyle=`rgba(255,255,255,.35)`,t.stroke()):(t.fillStyle=r,t.fill()),L(t,T?l:a,h/2,g/2+2*n,{font:c,colore:T?`#fff`:me(r),align:`center`,base:`middle`}),t.restore();let N=R(e.t,w,.7,Y.p3out);N>0&&N<1&&(t.beginPath(),t.arc(A+h/2,j+g/2,g*.5+N*120*n,0,Math.PI*2),t.lineWidth=5*n,t.strokeStyle=I(r,1-N),t.stroke()),t.restore(),Fn(e,A+h*.55,j+g*.62,1.1,1.95,w,n)}function Ln(e){let{c:t}=e,n=Nn(e),r=H(e,`colore`,`#ff0033`),i=W(e,`etichetta`,`ISCRIVITI`),a=`800 ${46*n}px "Montserrat", sans-serif`,o=112*n,s=Math.max(460*n,Math.max(F(t,i.toUpperCase(),a,2*n),F(t,`ISCRITTO`,a,2*n))+90*n),c=String(e.v.pos??`sinistra`),l=s+24*n+o;e.misura?.(l);let u=c===`centro`?(e.w-l)/2:c===`destra`?e.w-120-l:120,d=e.h-150-o-(c===`centro`?300:0),f=R(e.t,.1,.6,Y.back(1.6)),p=z(e,.45),m=1.9,h=e.t>m,g=X(1-Math.abs(e.t-m)/.12);t.save(),t.globalAlpha=Math.min(1,f*1.6)*p,t.translate(u,d+o),t.scale(.85+.15*f,.85+.15*f),t.translate(-u,-(d+o));let _=1-.06*g;t.save(),t.translate(u+s/2,d+o/2),t.scale(_,_),t.translate(-s/2,-o/2),V(t,0,0,s,o,18*n),t.fillStyle=h?`rgba(60,60,66,.95)`:r,t.shadowColor=`rgba(0,0,0,.45)`,t.shadowBlur=30,t.shadowOffsetY=10,t.fill(),t.shadowColor=`transparent`,L(t,h?`ISCRITTO`:i.toUpperCase(),s/2,o/2+2*n,{font:a,colore:`#fff`,align:`center`,base:`middle`,spazio:2*n}),t.restore();let v=u+s+24*n+o/2,y=d+o/2;t.beginPath(),t.arc(v,y,o/2,0,Math.PI*2),t.fillStyle=`rgba(60,60,66,.95)`,t.shadowColor=`rgba(0,0,0,.45)`,t.shadowBlur=30,t.shadowOffsetY=10,t.fill(),t.shadowColor=`transparent`;let b=e.t>2.25?Math.sin((e.t-m-.35)*26)*Math.exp(-(e.t-m-.35)*2.4)*.5:0;t.save(),t.translate(v,y-10*n),t.rotate(b),t.fillStyle=h?`#fff`:`rgba(255,255,255,.85)`;let x=22*n;t.beginPath(),t.moveTo(-x,x*.9),t.quadraticCurveTo(-x*.9,-x*.2,-x*.55,-x*.7),t.quadraticCurveTo(0,-x*1.5,x*.55,-x*.7),t.quadraticCurveTo(x*.9,-x*.2,x,x*.9),t.closePath(),t.fill(),t.beginPath(),t.arc(0,x*1.28,x*.32,0,Math.PI),t.fill(),t.restore(),t.restore(),Fn(e,u+s*.6,d+o*.68,1,1.85,m,n)}function Rn(e){let{c:t}=e,n=Nn(e),r=H(e,`colore`,`#ffd23f`),i=U(e.v,`font`),a=W(e,`titolo`,`Grazie per la visione`),o=W(e,`sotto`,``),s=W(e,`bottone`,`Iscriviti`),c=`800 ${112*n}px ${i}`,l=`500 ${42*n}px ${i}`,u=`800 ${40*n}px ${i}`,d=se(t,a,c,e.w*.8),f=112*n*1.1,p=d.length*f,m=F(t,s,u,1.2*n)+90*n,h=92*n,g=p+(o?34*n+42*n*1.3:0)+56*n+h,_=(e.h-g)/2,v=z(e,.5);if(d.forEach((n,r)=>{let i=R(e.t,.1+r*.12,.7,Y.p3out);L(t,n,e.w/2,_+r*f+40*(1-i),{font:c,colore:`#fff`,align:`center`,base:`top`,alfa:Math.min(1,i*1.5)*v,ombra:{blur:26,colore:`rgba(0,0,0,.5)`}})}),_+=p,o){let r=R(e.t,.6,.6,Y.p3out);L(t,o,e.w/2,_+34*n+18*(1-r),{font:l,colore:`rgba(255,255,255,.9)`,align:`center`,base:`top`,alfa:r*v,ombra:{blur:18,colore:`rgba(0,0,0,.5)`}}),_+=34*n+42*n*1.3}_+=56*n;let y=R(e.t,1,.6,Y.back(1.8)),b=(e.w-m)/2;t.save(),t.globalAlpha=Math.min(1,y*2)*v,t.translate(e.w/2,_+h/2),t.scale(.7+.3*y,.7+.3*y),t.translate(-e.w/2,-(_+h/2));let x=(e.t-1.4)%1.4/1.4;e.t>1.4&&(V(t,b-20*x*n*2,_-20*x*n*2,m+40*x*n*2,h+40*x*n*2,h/2+20*x*n*2),t.lineWidth=5*n,t.strokeStyle=I(r,(1-x)*.8),t.stroke()),V(t,b,_,m,h,h/2),t.fillStyle=r,t.shadowColor=I(r,.55),t.shadowBlur=36,t.shadowOffsetY=8,t.fill(),t.shadowColor=`transparent`,L(t,s,e.w/2,_+h/2+2*n,{font:u,colore:me(r),align:`center`,base:`middle`,spazio:1.2*n}),t.restore()}function zn(e){let{c:t}=e,n=Nn(e),r=H(e,`colore`,`#1d9bf0`),i=W(e,`nome`,`DaProd Editor Video`),a=W(e,`utente`,`@daprod`),o=W(e,`testo`,``),s=940*n,c=40*n,l=`500 ${40*n}px "Montserrat", sans-serif`,u=se(t,o,l,s-c*2),d=u.length*40*n*1.35,f=c+92*n+26*n+d+30*n+2+62*n+c*.6,p=String(e.v.pos??`centro`),m=p===`sinistra`?120:p===`destra`?e.w-120-s:(e.w-s)/2,h=(e.h-f)/2,g=R(e.t,.1,.65,Y.back(1.4)),_=z(e,.45);t.save(),t.globalAlpha=Math.min(1,g*1.6)*_,t.translate(m+s/2,h+f/2),t.scale(.9+.1*g,.9+.1*g),t.translate(-(m+s/2),-(h+f/2)),t.shadowColor=`rgba(0,0,0,.45)`,t.shadowBlur=56,t.shadowOffsetY=20,V(t,m,h,s,f,34*n),t.fillStyle=`#ffffff`,t.fill(),t.shadowColor=`transparent`;let v=h+c+46*n;t.beginPath(),t.arc(m+c+46*n,v,46*n,0,Math.PI*2);let y=t.createLinearGradient(m,h,m+100*n,h+100*n);y.addColorStop(0,K(r,.2)),y.addColorStop(1,le(r,.2)),t.fillStyle=y,t.fill(),L(t,(i[0]||`D`).toUpperCase(),m+c+46*n,v+2*n,{font:`800 ${50*n}px "Montserrat", sans-serif`,colore:`#fff`,align:`center`,base:`middle`});let b=m+c+110*n,x=`700 ${38*n}px "Montserrat", sans-serif`,S=`500 ${30*n}px "Montserrat", sans-serif`,C=ue(t,i,x,s-(b-m)-c-60*n),w=L(t,C,b,v-16*n,{font:x,colore:`#0f1419`,base:`middle`});t.beginPath(),t.arc(b+w+26*n,v-16*n,15*n,0,Math.PI*2),t.fillStyle=r,t.fill(),L(t,`✓`,b+w+26*n,v-14*n,{font:`800 ${20*n}px "Montserrat", sans-serif`,colore:`#fff`,align:`center`,base:`middle`}),L(t,ue(t,a,S,s-(b-m)-c),b,v+26*n,{font:S,colore:`#667785`,base:`middle`});let T=h+c+92*n+26*n;u.forEach((r,i)=>L(t,r,m+c,T+i*40*n*1.35,{font:l,colore:`#0f1419`,base:`top`,alfa:R(e.t,.45+i*.12,.4,Y.p2out)}));let E=T+d+30*n;t.fillStyle=`#eff3f4`,t.fillRect(m+c,E,s-c*2,2);let D=J(e,`mipiace`,12840),O=X((e.t-1.9)/.5),k=e.t>1.9?1+.5*Math.exp(-(e.t-1.9)*9)*Math.cos((e.t-1.9)*16):1,A=E+31*n+20*n;t.save(),t.translate(m+c+22*n,A),t.scale(k,k),t.beginPath();let j=22*n;t.moveTo(0,j*.6),t.bezierCurveTo(-j*1.3,-j*.1,-j*.8,-j*1.1,0,-j*.45),t.bezierCurveTo(j*.8,-j*1.1,j*1.3,-j*.1,0,j*.6),t.fillStyle=O>0?`#f91880`:`#a0aab3`,t.fill(),t.restore(),L(t,de(D*R(e.t,.6,1.4,Y.p3out)+ +(O>0)),m+c+64*n,A,{font:`600 ${32*n}px "Montserrat", sans-serif`,colore:O>0?`#f91880`:`#536471`,base:`middle`}),L(t,`💬  ↻  ⇪`,m+s-c,A,{font:`500 ${30*n}px "Montserrat", sans-serif`,colore:`#8b98a5`,align:`right`,base:`middle`,spazio:10*n}),t.restore()}function Bn(e){let{c:t}=e,n=Nn(e),r=H(e,`colore`,`#34c759`),i=W(e,`app`,`Messaggi`),a=W(e,`titolo`,`Anna`),o=W(e,`testo`,``),s=1e3*n,c=`500 ${32*n}px "Montserrat", sans-serif`,l=se(t,o,c,s-190*n).slice(0,3),u=Math.max(150*n,60*n+34*n*1.25+24*n+l.length*32*n*1.3+30*n),d=(e.w-s)/2,f=R(e.t,.1,.7,Y.back(1.3)),p=R(e.t,e.d-.45,.45,Y.p2in),m=B(-u-40,70,f)-(u+100)*p;t.save(),t.shadowColor=`rgba(0,0,0,.4)`,t.shadowBlur=44,t.shadowOffsetY=14,V(t,d,m,s,u,44*n),t.fillStyle=`rgba(247,247,250,.94)`,t.fill(),t.shadowColor=`transparent`;let h=96*n,g=d+30*n,_=m+30*n;V(t,g,_,h,h,24*n),t.fillStyle=r,t.fill(),t.fillStyle=`#fff`,V(t,g+h*.2,_+h*.24,h*.6,h*.42,h*.16),t.fill(),t.beginPath(),t.moveTo(g+h*.34,_+h*.62),t.lineTo(g+h*.28,_+h*.78),t.lineTo(g+h*.5,_+h*.64),t.closePath(),t.fill();let v=g+h+28*n,y=`600 ${22*n}px "Montserrat", sans-serif`,b=`700 ${34*n}px "Montserrat", sans-serif`;L(t,ue(t,i.toUpperCase(),y,s-(v-d)-140*n,1.2*n),v,m+34*n,{font:y,colore:`#6d6d72`,base:`top`,spazio:1.2*n}),L(t,`ora`,d+s-32*n,m+34*n,{font:`500 ${22*n}px "Montserrat", sans-serif`,colore:`#8e8e93`,align:`right`,base:`top`}),L(t,ue(t,a,b,s-(v-d)-32*n),v,m+34*n+22*n*1.3+4*n,{font:b,colore:`#111`,base:`top`}),l.forEach((e,r)=>L(t,e,v,m+34*n+22*n*1.3+4*n+34*n*1.25+8*n+r*32*n*1.3,{font:c,colore:`#2b2b2f`,base:`top`})),t.restore()}function Vn(e){let{c:t}=e,n=Nn(e),r=H(e,`colore`,`#0a84ff`),i=String(e.v.righe??``).split(`
`).map(e=>e.trim()).filter(Boolean).slice(0,8).map(e=>({mine:e.startsWith(`>`),t:e.replace(/^>\s*/,``)}));if(!i.length)return;let a=`500 ${40*n}px "Montserrat", sans-serif`,o=820*n,s=30*n,c=40*n*1.3,l=e.w/2,u=1e3*n,d=i.map(e=>{let n=se(t,e.t,a,o-s*2),r=Math.max(...n.map(e=>F(t,e,a)))+s*2;return{...e,rr:n,w:r,h:n.length*c+s*1.5}}),f=Math.min(1.25,5.5/i.length),p=.5,m=z(e,.5),h=18*n,g=(e.h+Math.min(900,d.reduce((e,t)=>e+t.h+h,0)))/2,_=d.map((t,n)=>R(e.t,p+n*f,.5,Y.back(1.6))),v=g,y=Array(d.length);for(let e=d.length-1;e>=0;e--)v-=(d[e].h+h)*X(_[e]),y[e]=v;t.save(),t.globalAlpha=m,d.forEach((e,i)=>{if(_[i]<=0)return;let o=e.mine?l+u/2-e.w:l-u/2;t.save(),t.translate(o+(e.mine?e.w:0),y[i]+e.h);let d=.6+.4*Math.min(1,_[i]);t.scale(d,d),t.globalAlpha*=X(_[i]*2),t.translate(-(e.mine?e.w:0),-e.h),V(t,0,0,e.w,e.h,38*n),t.fillStyle=e.mine?r:`#e9e9eb`,t.fill(),e.rr.forEach((n,r)=>L(t,n,s,s*.75+r*c,{font:a,colore:e.mine?`#fff`:`#111`,base:`top`})),t.restore()}),d.forEach((r,i)=>{if(r.mine)return;let a=p+i*f;if(!(e.t>a-f*.7&&e.t<a+.05))return;let o=v-74*n+0;V(t,l-u/2,Math.min(g,o+74*n)-74*n,130*n,74*n,37*n),t.fillStyle=`#e9e9eb`,t.fill();for(let r=0;r<3;r++)t.beginPath(),t.arc(l-u/2+(36+r*29)*n,Math.min(g,o+74*n)-37*n-Math.sin(e.t*9+r)*5*n,8*n,0,Math.PI*2),t.fillStyle=`#8e8e93`,t.fill()}),t.restore()}var Hn={"sc-segui":oe(In,120),"sc-iscriviti":oe(Ln,120),"sc-chiusura":Rn,"sc-post":zn,"sc-notifica":Bn,"sc-chat":Vn},Un=(e,t)=>(e%t+t)%t;function Wn(e){let{c:t}=e,n=H(e,`base`,`#0b0c12`),r=H(e,`colore`,`#46e5b7`),i=H(e,`colore2`,`#7c5cff`),a=t.createRadialGradient(e.w/2,e.h*.42,0,e.w/2,e.h*.42,e.w*.7);a.addColorStop(0,ie(n,r,.08)),a.addColorStop(1,n),t.fillStyle=a,t.fillRect(0,0,e.w,e.h),t.globalCompositeOperation=`lighter`;for(let n=0;n<5;n++){let a=e.w*(.5+.38*Math.sin(e.t*.22+n*1.9)),o=e.h*(.46+.3*Math.cos(e.t*.18+n*2.3)),s=e.h*(.55+.12*Math.sin(e.t*.3+n)),c=n%2?i:r,l=t.createRadialGradient(a,o,0,a,o,s);l.addColorStop(0,I(c,.5)),l.addColorStop(.45,I(c,.2)),l.addColorStop(1,I(c,0)),t.fillStyle=l,t.fillRect(0,0,e.w,e.h)}t.globalCompositeOperation=`source-over`;let o=t.createRadialGradient(e.w/2,e.h/2,e.h*.4,e.w/2,e.h/2,e.w*.65);o.addColorStop(0,`rgba(0,0,0,0)`),o.addColorStop(1,`rgba(0,0,0,.45)`),t.fillStyle=o,t.fillRect(0,0,e.w,e.h)}function Gn(e){let{c:t}=e,n=H(e,`base`,`#05060f`),r=H(e,`colore`,`#cfe3ff`),i=t.createLinearGradient(0,0,0,e.h);i.addColorStop(0,ie(n,`#1b2a55`,.35)),i.addColorStop(1,n),t.fillStyle=i,t.fillRect(0,0,e.w,e.h);let a=J(e,`quante`,180),o=e.w*1.1;for(let n=0;n<a;n++){let i=.2+Z(n,2)*.8,a=Un(Z(n,0)*o-e.t*i*34,o)-(o-e.w)/2,s=Z(n,1)*e.h,c=.55+.45*Math.sin(e.t*(1.2+Z(n,3)*2.4)+n),l=1.2+i*3.4;t.fillStyle=I(r,(.35+.65*i)*c),t.beginPath(),t.arc(a,s,l,0,Math.PI*2),t.fill(),i>.93&&(t.strokeStyle=I(r,.5*c),t.lineWidth=1.5,t.beginPath(),t.moveTo(a-l*5,s),t.lineTo(a+l*5,s),t.moveTo(a,s-l*5),t.lineTo(a,s+l*5),t.stroke())}}function Kn(e){let{c:t}=e,n=H(e,`colore`,`#ffffff`),r=J(e,`quanti`,120),i=J(e,`vento`,30),a=R(e.t,0,.8,Y.p2out)*z(e,.8);for(let o=0;o<r;o++){let r=Z(o,0),s=2.5+r*9,c=55+r*130,l=Un(Z(o,1)*(e.h+80)+e.t*c,e.h+80)-40,u=Un(Z(o,2)*e.w+Math.sin(e.t*(.6+Z(o,3))+o)*(20+r*50)+e.t*i*(.4+r),e.w+40)-20,d=(.35+.55*r)*a;if(s>7){let e=t.createRadialGradient(u,l,0,u,l,s);e.addColorStop(0,I(n,d)),e.addColorStop(1,I(n,0)),t.fillStyle=e,t.beginPath(),t.arc(u,l,s,0,Math.PI*2),t.fill()}else t.fillStyle=I(n,d),t.beginPath(),t.arc(u,l,s,0,Math.PI*2),t.fill()}}function qn(e){let{c:t}=e,n=H(e,`colore`,`#ffb347`),r=H(e,`colore2`,`#ff7ab8`),i=J(e,`quanti`,22),a=R(e.t,0,1,Y.p2out)*z(e,.8);for(let o=0;o<i;o++){let i=Z(o,0),s=e.w*Z(o,1)+Math.sin(e.t*(.15+Z(o,4)*.2)+o*3)*(40+i*80),c=e.h*Z(o,2)+Math.cos(e.t*(.12+Z(o,5)*.2)+o*2)*(30+i*60),l=36+i*120,u=o%2?r:n,d=(.12+.2*(.5+.5*Math.sin(e.t*.8+o*1.7)))*a,f=t.createRadialGradient(s,c,l*.2,s,c,l);f.addColorStop(0,I(u,d*.7)),f.addColorStop(.82,I(u,d)),f.addColorStop(1,I(u,0)),t.fillStyle=f,t.beginPath(),t.arc(s,c,l,0,Math.PI*2),t.fill(),t.strokeStyle=I(K(u,.3),d*.9),t.lineWidth=2,t.beginPath(),t.arc(s,c,l*.84,0,Math.PI*2),t.stroke()}}function Jn(e){let{c:t}=e,n=H(e,`base`,`#08101f`),r=H(e,`colore`,`#35e8ff`),i=H(e,`colore2`,`#7c5cff`),a=t.createLinearGradient(0,0,0,e.h);a.addColorStop(0,n),a.addColorStop(1,ie(n,i,.3)),t.fillStyle=a,t.fillRect(0,0,e.w,e.h);for(let n=0;n<6;n++){let a=e.h*(.46+n*.09),o=22+n*9,s=.0035-n*25e-5,c=.7+n*.18;t.beginPath(),t.moveTo(0,e.h);for(let r=0;r<=e.w+20;r+=20)t.lineTo(r,a+Math.sin(r*s+e.t*c+n*1.3)*o+Math.sin(r*s*2.3-e.t*c*.8)*o*.4);t.lineTo(e.w,e.h),t.closePath();let l=t.createLinearGradient(0,a-o,0,e.h);l.addColorStop(0,I(n%2?i:r,.5-n*.04)),l.addColorStop(1,I(n%2?i:r,.08)),t.fillStyle=l,t.fill()}}function Yn(e){let{c:t}=e,n=H(e,`base`,`#0a0612`),r=H(e,`colore`,`#ff3df2`),i=60/Math.max(30,J(e,`bpm`,120)),a=e.t%i/i;Math.floor(e.t/i);let o=Math.exp(-a*5);t.fillStyle=n,t.fillRect(0,0,e.w,e.h);let s=e.w/2,c=e.h/2,l=t.createRadialGradient(s,c,0,s,c,e.h*(.55+.1*o));l.addColorStop(0,I(r,.35+.3*o)),l.addColorStop(1,I(r,0)),t.fillStyle=l,t.fillRect(0,0,e.w,e.h);for(let e=0;e<4;e++){let n=120+(e+a)*i*380;t.lineWidth=6-e,t.strokeStyle=I(r,Math.max(0,.7-e*.2)*(e===0?1-a*.3:1)),t.beginPath(),t.arc(s,c,n,0,Math.PI*2),t.stroke()}t.shadowColor=r,t.shadowBlur=50,t.fillStyle=I(K(r,.3),.9),t.beginPath(),t.arc(s,c,90*(1+.2*o),0,Math.PI*2),t.fill(),t.shadowColor=`transparent`}function Xn(e){let{c:t}=e,n=H(e,`colore`,`#ff9a3d`),r=H(e,`colore2`,`#ff4d6d`),i=X(e.t/e.d),a=Math.sin(Math.PI*i);t.globalCompositeOperation=`lighter`;for(let o=0;o<3;o++){let s=e.w*B(-.1,1.1,X(i*1.1+o*.12-.1)),c=e.h*(.2+.25*o+.1*Math.sin(e.t*1.2+o)),l=e.h*(.7+.25*o),u=o===1?r:n,d=t.createRadialGradient(s,c,0,s,c,l);d.addColorStop(0,I(u,.75*a)),d.addColorStop(.5,I(u,.25*a)),d.addColorStop(1,I(u,0)),t.fillStyle=d,t.fillRect(0,0,e.w,e.h)}let o=e.w*B(-.3,1.3,i),s=t.createLinearGradient(o-200,0,o+200,0);s.addColorStop(0,I(n,0)),s.addColorStop(.5,I(K(n,.5),.4*a)),s.addColorStop(1,I(n,0)),t.fillStyle=s,t.fillRect(o-200,0,400,e.h),t.globalCompositeOperation=`source-over`}function Zn(e){let{c:t}=e,n=H(e,`colore`,`#f12c2c`),r=Math.min(e.w,e.h)*.05,i=Math.min(e.w,e.h)*.037,a={font:`700 ${i}px "Space Mono", "Courier New", monospace`,colore:`#fff`,contorno:{colore:`rgba(0,0,0,.92)`,px:i*.12},ombra:{blur:6,colore:`rgba(0,0,0,.9)`}},o=R(e.t,0,.3,Y.lineare)*z(e,.3);t.save(),t.globalAlpha=o,Math.floor(e.t*1.2)%2==0&&(t.fillStyle=n,t.shadowColor=I(n,.6),t.shadowBlur=14,t.beginPath(),t.arc(r+i*.55,r+i*.7,i*.55,0,Math.PI*2),t.fill(),t.shadowColor=`transparent`),L(t,`REC`,r+i*1.6,r+i*.2,{...a,base:`top`});let s=i*2.4,c=i*1.2,l=e.w-r-s-i*.4,u=r+i*.1;t.lineWidth=i*.12,t.strokeStyle=`#fff`,t.strokeRect(l,u,s,c),t.fillStyle=`#fff`,t.fillRect(l+s,u+c*.3,i*.25,c*.4);for(let e=0;e<3;e++)t.fillRect(l+i*.2+e*i*.7,u+i*.2,i*.55,c-i*.4);L(t,W(e,`data`,`12 GIU 2026`),r,e.h-r-i,{...a,base:`top`}),L(t,W(e,`modo`,`SP`),r,e.h-r-i*2.4,{...a,base:`top`,font:`700 ${i*.72}px "Space Mono", monospace`});let d=Math.floor(e.t),f=e=>String(e).padStart(2,`0`);L(t,`0:${f(Math.floor(d/60))}:${f(d%60)}`,e.w-r,e.h-r-i,{...a,base:`top`,align:`right`}),t.restore()}function Qn(e){let{c:t}=e,n=H(e,`colore`,`#d2202a`),r=W(e,`marca`,`NEWS`).toUpperCase(),i=W(e,`testo`,``),a=e.h-60-132,o=R(e.t,0,.6,Y.p4out),s=R(e.t,e.d-.5,.5,Y.p2in),c=(1-o+s)*252;t.save(),t.translate(0,c),t.shadowColor=`rgba(0,0,0,.45)`,t.shadowBlur=30,t.shadowOffsetY=-4,t.fillStyle=`rgba(14,16,22,.94)`,t.fillRect(80,a,e.w-160,132),t.shadowColor=`transparent`,t.fillStyle=n,t.fillRect(80,a-8,e.w-160,8);let l=`700 56px "Oswald", sans-serif`,u=F(t,r,l,3)+90;t.beginPath(),t.moveTo(80,a),t.lineTo(80+u,a),t.lineTo(80+u-34,a+132),t.lineTo(80,a+132),t.closePath(),t.fillStyle=n,t.fill(),L(t,r,116,a+66+2,{font:l,colore:`#fff`,base:`middle`,spazio:3}),t.save(),t.beginPath(),t.rect(80+u,a,e.w-160-u,132),t.clip();let d=`600 46px "Montserrat", sans-serif`,f=`${i}    •    `,p=F(t,f,d),m=80+u+40-e.t*150%p;for(let n=0;n<4;n++){let r=m+n*p;if(r>e.w)break;L(t,f,r,a+66+2,{font:d,colore:`#fff`,base:`middle`})}t.restore(),t.restore()}function $n(e){let{c:t}=e,n=H(e,`colore`,`#35e8ff`),r=R(e.t,.1,.8,Y.p3out),i=z(e,.4);t.save(),t.globalAlpha=i,t.strokeStyle=n,t.lineWidth=6,t.lineCap=`square`,t.shadowColor=n,t.shadowBlur=14;let a=(e,n,i,a)=>{t.beginPath(),t.moveTo(e,n+a*110*r),t.lineTo(e,n),t.lineTo(e+i*110*r,n),t.stroke()};a(90,90,1,1),a(e.w-90,90,-1,1),a(90,e.h-90,1,-1),a(e.w-90,e.h-90,-1,-1);let o=e.w/2,s=e.h/2;t.lineWidth=3,t.globalAlpha=i*r,t.beginPath(),t.arc(o,s,70,0,Math.PI*2),t.stroke(),t.save(),t.translate(o,s),t.rotate(e.t*.5);for(let e=0;e<4;e++)t.rotate(Math.PI/2),t.beginPath(),t.moveTo(70,0),t.lineTo(110,0),t.stroke();t.restore(),t.shadowColor=`transparent`;let c=`700 28px "Space Mono", monospace`;L(t,W(e,`etichetta`,`SOGGETTO 01`),98,173,{font:c,colore:n,base:`top`,alfa:r,spazio:3});let l=t=>(Z(t,Math.floor(e.t*6))*99).toFixed(2).padStart(5,`0`);L(t,`X ${l(1)}`,e.w-90-8,173,{font:c,colore:n,base:`top`,align:`right`,alfa:r}),L(t,`Y ${l(2)}`,e.w-90-8,211,{font:c,colore:n,base:`top`,align:`right`,alfa:r}),L(t,`T ${e.t.toFixed(2)}s`,98,e.h-90-55-34,{font:c,colore:n,base:`top`,alfa:r});let u=90+(e.h-180)*(.5+.5*Math.sin(e.t*1.1)),d=t.createLinearGradient(0,u-40,0,u+4);d.addColorStop(0,I(n,0)),d.addColorStop(1,I(n,.28)),t.fillStyle=d,t.fillRect(90,u-40,e.w-180,44),t.restore()}var er={"bg-aurora":Wn,"bg-stelle":Gn,"bg-neve":Kn,"bg-bokeh":qn,"bg-onde":Jn,"bg-impulso":Yn,"bg-luce":Xn,"hd-rec":Zn,"hd-notizie":Qn,"hd-mirino":$n},tr=(e,t)=>(e%t+t)%t;function nr(e,t,n,r,i){let a=e.createRadialGradient(t,n,0,t,n,r);a.addColorStop(0,`rgba(0,0,0,${.5*i})`),a.addColorStop(1,`rgba(0,0,0,0)`),e.fillStyle=a,e.fillRect(t-r,n-r,r*2,r*2)}function rr(e,t,n,r,i,a){let o=r*a;e.strokeStyle=i,e.lineWidth=2.5,e.lineCap=`round`,e.beginPath(),e.moveTo(t-o/2,n),e.lineTo(t-18,n),e.moveTo(t+18,n),e.lineTo(t+o/2,n),e.stroke(),e.fillStyle=i,e.beginPath(),e.moveTo(t,n-9*a),e.lineTo(t+9*a,n),e.lineTo(t,n+9*a),e.lineTo(t-9*a,n),e.closePath(),e.fill()}function ir(e){let{c:t}=e,n=H(e,`colore`,`#d4af37`),r=H(e,`testo`,`#ffffff`),i=U(e.v,`font`,`playfair`),a=z(e,.6),o=e.w/2,s=e.h/2-90;t.save(),t.globalAlpha=a,nr(t,o,e.h/2,e.h*.62,R(e.t,0,.8,Y.p2out));let c=R(e.t,.1,1.3,Y.p3io);t.lineWidth=5,t.strokeStyle=n,t.lineCap=`round`,t.shadowColor=I(n,.6),t.shadowBlur=16,t.beginPath(),t.arc(o,s,190,-Math.PI/2,-Math.PI/2+Math.PI*2*c),t.stroke(),t.lineWidth=2,t.beginPath(),t.arc(o,s,172,-Math.PI/2,-Math.PI/2-Math.PI*2*c,!0),t.stroke(),t.shadowColor=`transparent`;let l=R(e.t,.9,.8,Y.back(1.4)),u=W(e,`iniziali`,`A & M`),d=G(t,u,e=>`400 ${e}px ${q.vibes}`,170,272);t.save(),t.translate(o,s+8),t.scale(.8+.2*l,.8+.2*l),L(t,u,0,0,{font:`400 ${d}px ${q.vibes}`,colore:n,align:`center`,base:`middle`,alfa:X(l*1.5),ombra:{blur:22,colore:`rgba(0,0,0,.55)`}}),t.restore();let f=R(e.t,1.4,.8,Y.p3out),p=R(e.t,1.8,.8,Y.p3out),m=W(e,`nomi`,`Anna e Marco`),h=G(t,m,e=>`700 ${e}px ${i}`,78,e.w*.8,5);L(t,m,o,s+190+70+16*(1-f),{font:`700 ${h}px ${i}`,colore:r,align:`center`,base:`middle`,alfa:f,spazio:5,ombra:{blur:24,colore:`rgba(0,0,0,.6)`}}),rr(t,o,s+190+134,360,n,p);let g=W(e,`data`,``).toUpperCase(),_=G(t,g,e=>`500 ${e}px ${q.cormorant}`,40,e.w*.86,10);L(t,g,o,s+190+190+12*(1-p),{font:`500 ${_}px ${q.cormorant}`,colore:n,align:`center`,base:`middle`,alfa:p,spazio:10,ombra:{blur:16,colore:`rgba(0,0,0,.6)`}}),t.restore()}function ar(e){let{c:t}=e,n=H(e,`colore`,`#d4af37`),r=H(e,`testo`,`#ffffff`),i=z(e,.6),a=e.w-260,o=e.h-182;t.save(),t.globalAlpha=i,nr(t,e.w/2,e.h/2,e.h*.7,R(e.t,0,.8,Y.p2out));let s=R(e.t,.1,1.8,Y.p3io);t.strokeStyle=n,t.lineCap=`round`,t.lineJoin=`round`,t.shadowColor=I(n,.5),t.shadowBlur=12;let c=2*(a+o);for(let[e,n]of[[0,4],[22,2]])t.lineWidth=n,t.setLineDash([c*s,c]),t.beginPath(),t.rect(130+e,91+e,a-e*2,o-e*2),t.stroke();t.setLineDash([]),t.shadowColor=`transparent`;let l=R(e.t,1.2,.8,Y.p3out);if(l>0){t.lineWidth=3,t.strokeStyle=I(n,l);for(let[e,r,i,s]of[[130,91,1,1],[130+a,91,-1,1],[130,91+o,1,-1],[130+a,91+o,-1,-1]])t.save(),t.translate(e,r),t.scale(i,s),t.beginPath(),t.moveTo(46,46),t.bezierCurveTo(46,88,88,88,88,46),t.bezierCurveTo(88,20,62,12,56,34),t.stroke(),t.beginPath(),t.arc(46,46,7,0,Math.PI*2),t.fillStyle=I(n,l),t.fill(),t.restore()}let u=R(e.t,1,.9,Y.p3out),d=R(e.t,1.5,.9,Y.p3out),f=W(e,`titolo`,`Anna & Marco`),p=`italic 400 ${G(t,f,e=>`italic 400 ${e}px ${q.playfair}`,150,a-280)}px ${q.playfair}`;L(t,f,e.w/2,e.h/2-20+20*(1-u),{font:p,colore:r,align:`center`,base:`middle`,alfa:u,ombra:{blur:26,colore:`rgba(0,0,0,.65)`}}),rr(t,e.w/2,e.h/2+76,420,n,d);let m=W(e,`sotto`,``).toUpperCase(),h=G(t,m,e=>`500 ${e}px ${q.cormorant}`,46,a-280,9);L(t,m,e.w/2,e.h/2+140+12*(1-d),{font:`500 ${h}px ${q.cormorant}`,colore:n,align:`center`,base:`middle`,spazio:9,alfa:d,ombra:{blur:18,colore:`rgba(0,0,0,.65)`}}),t.restore()}function or(e){let{c:t}=e,n=H(e,`colore`,`#ffffff`),r=H(e,`accento`,`#d4af37`),i=U(e.v,`font`,`cormorant`),a=W(e,`testo`,``).split(`
`).map(e=>e.trim()).filter(Boolean);if(!a.length)return;let o=i===q.montserrat?q.cormorant:i,s=Math.min(a.length>3?84:100,...a.map(n=>G(t,n,e=>`italic 500 ${e}px ${o}`,100,e.w*.82))),c=s*1.3,l=`italic 500 ${s}px ${o}`,u=W(e,`firma`,``),d=a.length*c,f=e.h/2-d/2-(u?40:0),p=z(e,.6);t.save(),t.globalAlpha=p,nr(t,e.w/2,e.h/2,e.h*.7,R(e.t,0,.8,Y.p2out));let m=R(e.t,.1,1,Y.p4out);if(rr(t,e.w/2,f-52,520,r,m),a.forEach((r,i)=>{let a=R(e.t,.5+i*.55,.9,Y.p3out);L(t,r,e.w/2,f+i*c+14*(1-a),{font:l,colore:n,align:`center`,base:`top`,alfa:a,ombra:{blur:22,colore:`rgba(0,0,0,.65)`}})}),rr(t,e.w/2,f+d+36,520,r,R(e.t,.5+a.length*.55,.8,Y.p4out)),u){let n=R(e.t,.9+a.length*.55,.9,Y.p3out),i=G(t,u,e=>`400 ${e}px ${q.vibes}`,84,e.w*.8);L(t,u,e.w/2,f+d+90+12*(1-n),{font:`400 ${i}px ${q.vibes}`,colore:r,align:`center`,base:`top`,alfa:n,ombra:{blur:18,colore:`rgba(0,0,0,.6)`}})}t.restore()}function sr(e){let{c:t}=e,n=H(e,`colore`,`#ffffff`),r=H(e,`accento`,`#d4af37`),i=U(e.v,`font`,`playfair`),a=W(e,`giorno`,`12`),o=W(e,`mese`,`GIUGNO`).toUpperCase(),s=W(e,`anno`,`2026`),c=z(e,.6),l=e.w/2,u=e.h/2-40;t.save(),t.globalAlpha=c,nr(t,l,e.h/2,e.h*.7,R(e.t,0,.8,Y.p2out));let d=R(e.t,.2,1,Y.back(1.3)),f=`400 330px ${i}`,p=F(t,a,f),m=e.w/2-(p/2+70)-50-40,h=G(t,o.length>s.length?o:s,e=>`500 ${e}px ${q.cormorant}`,66,m,12),g=G(t,W(e,`nomi`,``),e=>`400 ${e}px ${q.vibes}`,110,e.w*.86);t.save(),t.translate(l,u),t.scale(.85+.15*d,.85+.15*d),L(t,a,0,20,{font:f,colore:n,align:`center`,base:`middle`,alfa:X(d*1.4),ombra:{blur:30,colore:`rgba(0,0,0,.6)`}}),t.restore();let _=R(e.t,.7,.9,Y.p4out),v=p/2+70;t.fillStyle=r,t.fillRect(l-v-3,u-150*_,4,300*_),t.fillRect(l+v-1,u-150*_,4,300*_);let y=R(e.t,1,.8,Y.p3out);L(t,o,l-v-50+30*(1-y),u+12,{font:`500 ${h}px ${q.cormorant}`,colore:r,align:`right`,base:`middle`,spazio:12,alfa:y,ombra:{blur:16,colore:`rgba(0,0,0,.6)`}}),L(t,s,l+v+50-30*(1-y),u+12,{font:`500 ${h}px ${q.cormorant}`,colore:r,align:`left`,base:`middle`,spazio:12,alfa:y,ombra:{blur:16,colore:`rgba(0,0,0,.6)`}});let b=R(e.t,1.5,.9,Y.p3out);L(t,W(e,`nomi`,``),l,u+230+14*(1-b),{font:`400 ${g}px ${q.vibes}`,colore:n,align:`center`,base:`middle`,alfa:b,ombra:{blur:22,colore:`rgba(0,0,0,.6)`}}),t.restore()}function cr(e){let{c:t}=e,n=H(e,`colore`,`#ffd23f`),r=H(e,`colore2`,`#ff4d6d`),i=U(e.v,`font`,`vibes`),a=z(e,.6),o=R(e.t,.05,.9,Y.rimbalzo);t.save(),t.globalAlpha=a;let s=-20+90*o-90,c=t=>s+70+150*(1-((t-e.w/2)/(e.w/2))**2);t.strokeStyle=`rgba(255,255,255,.85)`,t.lineWidth=4,t.beginPath();for(let n=-10;n<=e.w+10;n+=20){let e=c(n);n===-10?t.moveTo(n,e):t.lineTo(n,e)}t.stroke();let l=Math.round(e.w/120),u=[n,r,`#ffffff`,K(n,.3)];for(let n=0;n<=l;n++){let r=(n+.5)*(e.w/(l+1))+20,i=c(r),a=Math.sin(e.t*2+n*.8)*.07;t.save(),t.translate(r,i),t.rotate(a),t.beginPath(),t.moveTo(-34,0),t.lineTo(34,0),t.lineTo(0,88),t.closePath(),t.fillStyle=u[n%u.length],t.shadowColor=`rgba(0,0,0,.35)`,t.shadowBlur=12,t.shadowOffsetY=5,t.fill(),t.restore()}t.shadowColor=`transparent`;let d=R(e.t,.7,1,Y.back(1.5)),f=W(e,`testo`,`Buon Compleanno`);t.save(),t.translate(e.w/2,e.h/2+30),t.scale(.7+.3*d,.7+.3*d),L(t,f,0,0,{font:`400 ${G(t,f,e=>`400 ${e}px ${i}`,230,e.w*.86)}px ${i}`,colore:`#fff`,align:`center`,base:`middle`,alfa:X(d*1.5),ombra:{blur:30,colore:`rgba(0,0,0,.6)`,y:6},contorno:{colore:I(r,.9),px:8}}),t.restore();let p=R(e.t,1.4,.9,Y.p3out),m=W(e,`sotto`,``).toUpperCase(),h=G(t,m,e=>`700 ${e}px ${q.montserrat}`,60,e.w*.86,10);L(t,m,e.w/2,e.h/2+230+14*(1-p),{font:`700 ${h}px ${q.montserrat}`,colore:`#fff`,align:`center`,base:`middle`,spazio:10,alfa:p,ombra:{blur:20,colore:`rgba(0,0,0,.6)`}}),t.restore()}function lr(e){let{c:t}=e,n=H(e,`colore`,`#ff4d6d`),r=H(e,`colore2`,`#ffb3c6`),i=J(e,`quanti`,26),a=R(e.t,0,.8,Y.p2out)*z(e,.8);for(let o=0;o<i;o++){let i=Z(o,0),s=26+i*70,c=80+(1-i)*140+Z(o,5)*40,l=e.h+260,u=e.h+130-tr(e.t*c+Z(o,1)*l,l),d=e.w*(.04+.92*Z(o,2))+Math.sin(e.t*(.8+Z(o,3))+o*2)*(24+i*50),f=X(u/(e.h*.25)),p=(.55+.4*i)*a*Math.min(1,f+.05);if(t.save(),t.translate(d,u),t.rotate(Math.sin(e.t*1.2+o)*.25),t.globalAlpha=p,pe(t,0,0,s),o%4==0)t.lineWidth=4,t.strokeStyle=o%2?n:r,t.shadowColor=t.strokeStyle,t.shadowBlur=14,t.stroke();else{let e=t.createLinearGradient(-s/2,-s/2,s/2,s/2);e.addColorStop(0,K(o%2?n:r,.25)),e.addColorStop(1,o%2?n:r),t.fillStyle=e,t.fill()}t.restore()}}function ur(e,t){e.beginPath(),e.moveTo(0,-t),e.bezierCurveTo(t*.9,-t*.5,t*.8,t*.55,0,t),e.bezierCurveTo(-t*.8,t*.55,-t*.9,-t*.5,0,-t),e.closePath()}function dr(e){let{c:t}=e,n=H(e,`colore`,`#ffc2d1`),r=H(e,`colore2`,`#ffffff`),i=J(e,`quanti`,40),a=R(e.t,0,.8,Y.p2out)*z(e,.8);for(let o=0;o<i;o++){let i=Z(o,0),s=14+i*26,c=70+i*90,l=e.h+200,u=tr(e.t*c+Z(o,1)*l,l)-100,d=e.w*Z(o,2)+Math.sin(e.t*(.5+Z(o,3)*.7)+o*3)*(90+i*120)+Math.sin(e.t*.3+o)*40,f=Math.cos(e.t*(1.2+Z(o,4))+o);t.save(),t.translate(d,u),t.rotate(e.t*(.4+Z(o,5))*(o%2?1:-1)+o),t.scale(.35+.65*Math.abs(f),1),t.globalAlpha=(.65+.3*i)*a,ur(t,s);let p=o%3==0?r:n,m=t.createLinearGradient(0,-s,0,s);m.addColorStop(0,K(p,.25)),m.addColorStop(1,le(p,.1)),t.fillStyle=m,t.fill(),t.restore()}}function fr(e){let{c:t}=e,n=H(e,`colore`,`#ffd54a`),r=J(e,`quante`,90),i=R(e.t,0,.8,Y.p2out)*z(e,.8);for(let a=0;a<r;a++){let r=Z(a,0),o=7+r*24,s=e.h+120,c=tr(e.t*(22+r*60)+Z(a,1)*s,s)-60,l=e.w*Z(a,2)+Math.sin(e.t*.6+a*2.1)*36,u=Math.abs(Math.sin(e.t*(1.4+Z(a,3)*2.5)+a*1.3))**3;t.save(),t.globalAlpha=(.15+.85*u)*i,t.shadowColor=n,t.shadowBlur=12+o,ae(t,l,c,o,4,.16,Math.PI/4+e.t*.4),t.fillStyle=a%5==0?`#fff`:n,t.fill(),t.restore()}}function pr(e){let{c:t}=e,n=[H(e,`colore`,`#ff4d6d`),H(e,`colore2`,`#35e8ff`),H(e,`colore3`,`#ffd23f`)],r=J(e,`quanti`,14),i=z(e,.8),a=e.h+700,o=Array.from({length:r},(e,t)=>t).sort((e,t)=>Z(e,0)-Z(t,0));for(let r of o){let o=Z(r,0),s=40+o*36,c=s*1.26,l=90+(1-o)*110,u=e.h+250-tr(e.t*l+Z(r,1)*a,a)+100,d=e.w*(.06+.88*Z(r,2))+Math.sin(e.t*.9+r*2)*36,f=n[r%3];t.save(),t.translate(d,u),t.rotate(Math.sin(e.t*.9+r*2+.6)*.08),t.globalAlpha=i,t.strokeStyle=`rgba(255,255,255,.7)`,t.lineWidth=2,t.beginPath(),t.moveTo(0,c+10);for(let n=1;n<=8;n++)t.lineTo(Math.sin(e.t*2+n*.7+r)*7*(n/8),c+10+n*22);t.stroke(),t.beginPath(),t.ellipse(0,0,s,c,0,0,Math.PI*2);let p=t.createRadialGradient(-s*.35,-c*.4,s*.1,0,0,c*1.1);p.addColorStop(0,K(f,.55)),p.addColorStop(.5,f),p.addColorStop(1,le(f,.35)),t.fillStyle=p,t.shadowColor=`rgba(0,0,0,.25)`,t.shadowBlur=16,t.shadowOffsetY=6,t.fill(),t.shadowColor=`transparent`,t.fillStyle=`rgba(255,255,255,.55)`,t.beginPath(),t.ellipse(-s*.42,-c*.45,s*.14,c*.2,-.5,0,Math.PI*2),t.fill(),t.fillStyle=le(f,.2),t.beginPath(),t.moveTo(0,c-2),t.lineTo(-9,c+14),t.lineTo(9,c+14),t.closePath(),t.fill(),t.restore()}}function mr(e){let{c:t}=e,n=[H(e,`colore`,`#ff4d6d`),H(e,`colore2`,`#ffd23f`),H(e,`colore3`,`#35e8ff`),`#ffffff`],r=J(e,`quanti`,140),i=z(e,.9,Y.lineare);for(let a=0;a<r;a++){let r=a%3!=2,o=r?.12+Z(a,9)*.12:.9+Z(a,9)*1.4,s=e.t-o;if(s<0)continue;let c,l;if(r){let t=a%2?1:-1,n=t>0?e.w*.03:e.w*.97,r=e.h+20,i=(18+Z(a,1)*37)*Math.PI/180,o=1100+Z(a,2)*1100,u=Math.sin(i)*o*t*-1,d=-Math.cos(i)*o,f=(1-Math.exp(-1.5*s))/1.5;c=n+u*f+Math.sin(s*4+a)*26*Math.min(1,s),l=r+(d+300)*f-300*s}else c=e.w*Z(a,1)+Math.sin(s*2.2+a)*60,l=-40+165*s;if(l>e.h+40||c<-40||c>e.w+40||l<-80)continue;let u=12+Z(a,3)*20,d=7+Z(a,4)*12,f=Math.abs(Math.cos(s*(5+Z(a,5)*8)+a));t.save(),t.translate(c,l),t.rotate(s*(2+Z(a,6)*5)*(a%2?1:-1)+a),t.scale(1,.2+.8*f),t.globalAlpha=i*Math.min(1,s*6),t.fillStyle=n[a%n.length],a%5==0?(t.beginPath(),t.arc(0,0,u*.35,0,Math.PI*2),t.fill()):t.fillRect(-u/2,-d/2,u,d),t.restore()}}var hr={"cr-monogramma":ir,"cr-cornice":ar,"cr-dedica":or,"cr-data":sr,"cr-auguri":cr,"cr-cuori":lr,"cr-petali":dr,"cr-scintille":fr,"cr-palloncini":pr,"cr-coriandoli":mr},gr=e=>J(e,`dim`,100)/100,_r=e=>({ent:R(e.t,.05,.55,Y.back(2)),u:z(e,.35),al:X(R(e.t,.05,.3,Y.lineare))*z(e,.35)});function vr(e){let{c:t}=e,n=gr(e),r=H(e,`colore`,`#35e8ff`),i=J(e,`spessore`,6),{ent:a,al:o}=_r(e),s=150*n*B(1.9,1,Math.min(1.1,a))*(1+.04*Math.sin(e.t*3.2)),c=46*n,l=e.w/2,u=e.h/2;t.save(),t.globalAlpha=o,t.strokeStyle=r,t.lineWidth=i,t.lineCap=`round`,t.lineJoin=`round`,t.shadowColor=I(r,.85),t.shadowBlur=16;for(let[e,n]of[[-1,-1],[1,-1],[1,1],[-1,1]]){let r=l+e*s,i=u+n*s;t.beginPath(),t.moveTo(r-e*c,i),t.lineTo(r,i),t.lineTo(r,i-n*c),t.stroke()}t.lineWidth=Math.max(2,i*.6),t.beginPath(),t.moveTo(l-16*n,u),t.lineTo(l+16*n,u),t.moveTo(l,u-16*n),t.lineTo(l,u+16*n),t.stroke(),t.restore()}function yr(e){let{c:t}=e,n=gr(e),r=H(e,`colore`,`#ffd23f`),i=J(e,`spessore`,6),{ent:a,al:o}=_r(e),s=130*n*B(1.7,1,Math.min(1.1,a))*(1+.035*Math.sin(e.t*4)),c=e.w/2,l=e.h/2;if(t.save(),t.globalAlpha=o,t.strokeStyle=r,t.lineWidth=i,t.lineCap=`round`,t.shadowColor=I(r,.8),t.shadowBlur=18,e.v.tratteggio!==!1){let r=2*Math.PI*s/16;t.setLineDash([r*.62,r*.38]),t.lineDashOffset=-e.t*60*n}t.beginPath(),t.arc(c,l,s,0,Math.PI*2),t.stroke(),t.restore()}function br(e){let{c:t}=e,n=gr(e),r=H(e,`colore`,`#ff4d6d`),{ent:i,al:a}=_r(e),o=String(e.v.da??`su`),s={su:Math.PI/2,giu:-Math.PI/2,sinistra:0,destra:Math.PI,"su-sinistra":Math.PI/4,"su-destra":3*Math.PI/4}[o]??Math.PI/2,c=(150*n+14*Math.sin(e.t*5))*B(1.8,1,Math.min(1.1,i)),l=e.w/2+Math.cos(s)*c,u=e.h/2+Math.sin(s)*c,d=120*n,f=46*n;t.save(),t.globalAlpha=a,t.translate(l,u),t.rotate(s+Math.PI),t.shadowColor=`rgba(0,0,0,.5)`,t.shadowBlur=16,t.shadowOffsetY=4,t.fillStyle=r,t.beginPath(),t.moveTo(d/2,0),t.lineTo(d/2-f,-f),t.lineTo(d/2-f,-f*.38),t.lineTo(-d/2,-f*.38),t.lineTo(-d/2,f*.38),t.lineTo(d/2-f,f*.38),t.lineTo(d/2-f,f),t.closePath(),t.fill(),t.lineWidth=4*n,t.strokeStyle=`rgba(255,255,255,.85)`,t.lineJoin=`round`,t.shadowColor=`transparent`,t.stroke(),t.restore()}function xr(e){let{c:t}=e,n=gr(e),r=H(e,`colore`,`#ffffff`),i=W(e,`testo`,`Qui`),{ent:a,al:o}=_r(e),s=String(e.v.verso??`su-destra`),c=s.includes(`sinistra`)?-1:1,l=s.startsWith(`giu`)?1:-1,u=e.w/2,d=e.h/2,f=`700 ${34*n}px "Montserrat", sans-serif`,p=ue(t,i,f,520*n),m=F(t,p,f)+48*n,h=62*n,g=120*n*Math.min(1,a),_=u+c*g*.9,v=d+l*g;t.save(),t.globalAlpha=o,t.fillStyle=r,t.shadowColor=I(r,.9),t.shadowBlur=14,t.beginPath(),t.arc(u,d,9*n,0,Math.PI*2),t.fill(),t.lineWidth=3*n,t.strokeStyle=I(r,.55),t.beginPath(),t.arc(u,d,(16+8*(.5+.5*Math.sin(e.t*4)))*n,0,Math.PI*2),t.stroke(),t.shadowColor=`transparent`,t.strokeStyle=r,t.lineWidth=3.5*n,t.beginPath(),t.moveTo(u,d),t.lineTo(_,v),t.lineTo(_+c*24*n,v),t.stroke();let y=c>0?_+24*n:_-24*n-m;t.save(),t.globalAlpha*=a>.7?1:a/.7,t.shadowColor=`rgba(0,0,0,.5)`,t.shadowBlur=20,t.shadowOffsetY=6,V(t,y,v-h/2,m,h,h/2),t.fillStyle=`#14151b`,t.fill(),t.shadowColor=`transparent`,t.lineWidth=3*n,t.strokeStyle=r,t.stroke(),L(t,p,y+m/2,v+2*n,{font:f,colore:`#fff`,align:`center`,base:`middle`}),t.restore(),t.restore()}function Sr(e){let{c:t}=e,n=gr(e),r=H(e,`colore`,`#ff2d6f`),i=W(e,`testo`,`Marco`),{ent:a,al:o}=_r(e),s=`800 ${40*n}px "Montserrat", sans-serif`,c=ue(t,i,s,560*n),l=F(t,c,s)+56*n,u=70*n,d=e.w/2,f=e.h/2-120*n-(1-Math.min(1,a))*40*n+4*Math.sin(e.t*3)*n;t.save(),t.globalAlpha=o,t.shadowColor=`rgba(0,0,0,.5)`,t.shadowBlur=20,t.shadowOffsetY=6,t.fillStyle=r,V(t,d-l/2,f-u,l,u,14*n),t.fill(),t.beginPath(),t.moveTo(d-18*n,f-2),t.lineTo(d+18*n,f-2),t.lineTo(d,f+26*n),t.closePath(),t.fill(),t.shadowColor=`transparent`,L(t,c,d,f-u/2+2*n,{font:s,colore:me(r),align:`center`,base:`middle`}),t.restore()}function Cr(e){let{c:t}=e,n=gr(e),r=H(e,`colore`,`#35e8ff`),i=J(e,`spessore`,5),{al:a}=_r(e),o=e.w/2,s=e.h/2;t.save(),t.lineWidth=i;for(let i=0;i<3;i++){let c=((e.t*.7+i/3)%1+1)%1;t.globalAlpha=a*(1-c)*.9,t.strokeStyle=r,t.shadowColor=I(r,.7),t.shadowBlur=14,t.beginPath(),t.arc(o,s,(24+190*c)*n,0,Math.PI*2),t.stroke()}t.globalAlpha=a,t.shadowBlur=0,t.fillStyle=r,t.beginPath(),t.arc(o,s,8*n,0,Math.PI*2),t.fill(),t.restore()}var wr={"sg-mirino":vr,"sg-cerchio":yr,"sg-freccia":br,"sg-etichetta":xr,"sg-nome":Sr,"sg-onde":Cr},Tr=e({DISEGNA:()=>Er,disegnaAnimazione:()=>Ar,firmaAnim:()=>kr}),Er={...mn,...Tn,...Mn,...Hn,...er,...hr,...wr},Dr=1500,Or=new Map,kr=e=>e.id+JSON.stringify(e.v);function Ar(e,t,n,r,i,a){let o=t+`x`+n,s=a??Or.get(o);s||(s=he(t,n),a||Or.set(o,s),Or.size>6&&Or.delete(Or.keys().next().value));let c=s.getContext(`2d`);c.setTransform(1,0,0,1,0,0),c.globalAlpha=1,c.shadowColor=`transparent`,c.clearRect(0,0,t,n);let l=n/1080;c.setTransform(l,0,0,l,0,0);let u=Er[e.id];if(u&&be(e.id)){c.save();let n=t/l,a=1080;if(n<Dr){let e=n/Dr;c.scale(e,e),n=Dr,a=1080/e}try{u({c,w:n,h:a,t:Math.max(0,r),d:Math.max(.1,i),v:xe(e)})}catch{}c.restore()}return c.setTransform(1,0,0,1,0,0),s}var jr=`
uniform int u_numClic;
uniform vec4 u_clic[8]; // x, y, età normalizzata, forza
uniform vec3 u_clicColore;
uniform float u_clicRapporto;
`,Mr=`
  for (int i = 0; i < 8; i++) {
    if (i >= u_numClic) break;
    vec4 s = u_clic[i];
    float d = length((uv0 - s.xy) * vec2(u_clicRapporto, 1.0));
    float r = 0.009 + s.z * 0.025;
    float bordo = 1.0 - smoothstep(0.0015, 0.003, abs(d - r));
    rgb = mix(rgb, u_clicColore, bordo * (1.0 - s.z) * (1.0 - s.z) * s.w);
  }
`;function Nr(e,t,n,r){let i={n:0,punti:new Float32Array(32),colore:[1,.835,.29]},a=e.media.find(e=>e.id===t.media),o=a?.cursoreLive;if(!o||o.v!==1||t.kind!==`media`)return i;let s=t.start+r,c=e.clips.filter(e=>e.kind===`fx`&&e.track===t.track&&e.start<=s&&s<e.start+e.len&&e.fxb?.id===`clicLive`&&e.fxb.tipo===`effetto`&&(!e.fxb.cursoreMedia||e.fxb.cursoreMedia===a.id)).at(-1)?.fxb;if(!c||c.forza<=0||!Number.isFinite(c.forza))return i;let l=(n-(a.t0||0))*1e3,u=st(o,l),d=new Float32Array(32);u.forEach((e,t)=>d.set([e.cx,e.cy,(l-e.tMs)/550,Math.min(1,c.forza)],t*4));let f=/^#[0-9a-f]{6}$/i.test(c.colore)?c.colore:`#ffd54a`,p=[1,3,5].map(e=>parseInt(f.slice(e,e+2),16)/255);return{n:u.length,punti:d,colore:p}}var Pr=`#version 300 es
in vec2 a_pos;
uniform vec2 u_res;        // dimensione del progetto in pixel
uniform vec2 u_size;       // dimensione mostrata della sorgente intera (dopo l'adattamento)
uniform vec4 u_crop;       // l, t, r, b in uv
uniform vec2 u_off;        // spostamento in pixel dal centro
uniform float u_scale, u_rot;
out vec2 v_uv;
void main() {
  vec2 uv = mix(u_crop.xy, vec2(1.0) - u_crop.zw, a_pos);
  vec2 p = (uv - 0.5) * u_size * u_scale;
  float c = cos(u_rot), s = sin(u_rot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + u_off;
  vec2 clip = p / (u_res * 0.5);
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = uv;
}`,Fr=`#version 300 es
precision highp float;
${jr}
in vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_src;          // 0 texture, 1 barre SMPTE, 2 barre EBU, 3 colore pieno
uniform int u_orient;       // rotazione dei metadati: 0, 90, 180, 270
uniform vec3 u_color;
uniform float u_bright, u_contrast, u_sat, u_hue;
uniform int u_look;         // bit: 1 vhs, 2 pellicola, 4 b/n, 8 seppia, 16 crt (si sommano)
uniform float u_time;
uniform vec2 u_texel;
uniform int u_key;          // 0 no, 1 luma, 2 colori (green screen), 3 maschera dell'AI
uniform vec3 u_keyColor;    // il colore principale della chiave
uniform vec3 u_keyExtra[2]; // gli altri colori da togliere
uniform int u_keyN;         // quanti altri
uniform float u_keyLevel, u_keySoft;
uniform bool u_keyInv;
uniform float u_keySpill;   // quanto colore del fondale si toglie dai bordi
uniform float u_keyBordo;   // restringe (−) o allarga (+) il soggetto
uniform float u_keySfuma;   // sfuma il bordo
uniform float u_keyPulisci; // toglie puntini e buchi
uniform sampler2D u_matte, u_matte2;  // le maschere dell'AI (prima e dopo l'istante) e quanto verso la seconda
uniform float u_matteK;
uniform sampler2D u_forma;  // le maschere a forma della clip (rettangolo, ellisse, Bézier): copertura 0..1 in un canale solo
uniform bool u_formaOn;
uniform int u_vista;        // 0 normale, 1 si vede la maschera, 2 il soggetto sugli scacchi, 3 il contorno di quello che resta
uniform bool u_mirror;
uniform float u_temp, u_vignette;
uniform bool u_auto;          // colore automatico: livelli, bianco e luce misurati sulla ripresa
uniform vec3 u_autoLo, u_autoHi, u_autoWb;
uniform float u_autoK, u_autoGamma;
uniform float u_alpha;        // i titoli animati che compaiono e spariscono
uniform vec3 u_color2;        // colore pieno sfumato: il secondo colore
uniform bool u_grad;
uniform vec4 u_box;           // il rettangolo che si vede (l, t, r, b in uv): per gli angoli tondi e l'ombra
uniform vec2 u_boxPx;         // quanti pixel del progetto fa la sorgente intera
uniform float u_round, u_feather;
out vec4 o;

${Vt}
vec2 orient(vec2 uv) {
  if (u_orient == 90) return vec2(uv.y, 1.0 - uv.x);
  if (u_orient == 180) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (u_orient == 270) return vec2(1.0 - uv.y, uv.x);
  return uv;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 smpte(vec2 uv) {
  vec3 bars[7] = vec3[7](vec3(.75), vec3(.75,.75,0.), vec3(0.,.75,.75), vec3(0.,.75,0.), vec3(.75,0.,.75), vec3(.75,0.,0.), vec3(0.,0.,.75));
  int i = int(clamp(floor(uv.x * 7.0), 0.0, 6.0));
  if (uv.y < 0.67) return bars[i];
  if (uv.y < 0.75) {
    vec3 rev[7] = vec3[7](vec3(0.,0.,.75), vec3(.075), vec3(.75,0.,.75), vec3(.075), vec3(0.,.75,.75), vec3(.075), vec3(.75));
    return rev[i];
  }
  float x = uv.x * 7.0;
  if (x < 1.25) return vec3(0.0, 0.129, 0.298);       // -I
  if (x < 2.5) return vec3(1.0);                      // bianco 100%
  if (x < 3.75) return vec3(0.196, 0.0, 0.416);       // +Q
  if (x < 5.0) return vec3(0.075);
  if (x < 5.333) return vec3(0.035);                  // PLUGE: sotto il nero
  if (x < 5.666) return vec3(0.075);
  if (x < 6.0) return vec3(0.115);                    //        sopra il nero
  return vec3(0.075);
}
vec3 ebu(vec2 uv) {
  vec3 b[8] = vec3[8](vec3(1.), vec3(.75,.75,0.), vec3(0.,.75,.75), vec3(0.,.75,0.), vec3(.75,0.,.75), vec3(.75,0.,0.), vec3(0.,0.,.75), vec3(0.));
  return b[int(clamp(floor(uv.x * 8.0), 0.0, 7.0))];
}

vec4 src(vec2 uv) {
  if (u_src == 1) return vec4(smpte(uv), 1.0);
  if (u_src == 2) return vec4(ebu(uv), 1.0);
  if (u_src == 3) return vec4(u_grad ? mix(u_color, u_color2, clamp(uv.y * 0.75 + uv.x * 0.25, 0.0, 1.0)) : u_color, 1.0);
  return texture(u_tex, orient(uv));
}

// colore → (luce, blu-giallo, rosso-verde): la distanza dalla chiave si misura sul colore, poco sulla luce
vec3 yuv(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }
float distChiave(vec3 rgb, vec3 kc) {
  vec3 a = yuv(rgb), k = yuv(kc);
  return distance(a.yz, k.yz) * 2.2 + abs(a.x - k.x) * 0.15;
}
// quanto un colore è "soggetto" (1) o "fondale" (0): il più vicino fra i colori scelti
float matteColori(vec3 rgb) {
  float d = distChiave(rgb, u_keyColor);
  if (u_keyN > 0) d = min(d, distChiave(rgb, u_keyExtra[0]));
  if (u_keyN > 1) d = min(d, distChiave(rgb, u_keyExtra[1]));
  float lo = max(0.0, u_keyLevel * 0.5 - u_keyBordo * 0.25);
  return smoothstep(lo, lo + u_keySoft + 0.001, d);
}
vec3 senzaRiflesso(vec3 rgb) {
  // toglie dai bordi il colore del fondale che rimbalza sul soggetto: la parte di colore che punta verso la chiave
  vec3 y = yuv(rgb), k = yuv(u_keyColor);
  vec2 kd = normalize(k.yz + vec2(1e-5));
  float len = length(y.yz);
  float ang = len > 1e-4 ? dot(y.yz / len, kd) : 0.0;
  float sp = max(0.0, dot(y.yz, kd));
  vec2 q = y.yz - kd * sp * smoothstep(0.35, 0.95, ang) * u_keySpill;
  return vec3(y.x + 1.402 * q.y, y.x - 0.344 * q.x - 0.714 * q.y, y.x + 1.772 * q.x);
}

void main() {
  vec2 uv0 = u_mirror ? vec2(1.0 - v_uv.x, v_uv.y) : v_uv;
  vec4 c = src(uv0);
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  vec3 rgbGrezzo = rgb;      // il colore com'è nella ripresa, prima di ogni ritocco: la chiave guarda questo
  float a = c.a;
  float aChiave = 1.0;
  if (u_auto) {
    vec3 lv = clamp((rgb - u_autoLo) / max(u_autoHi - u_autoLo, vec3(0.05)), 0.0, 1.0);
    lv = pow(lv * u_autoWb, vec3(u_autoGamma));
    rgb = mix(rgb, clamp(lv, 0.0, 1.0), u_autoK);
  }
  if ((u_look & 1) != 0) {
    // VHS: il colore scappa di lato, righe di tracking, rumore
    float wob = sin(v_uv.y * 180.0 + u_time * 3.0) * 0.0009 + (hash(vec2(floor(v_uv.y * 240.0), u_time)) - 0.5) * 0.0012;
    vec2 uvw = uv0 + vec2(wob, 0.0);
    vec3 cr = src(uvw + vec2(u_texel.x * 3.5, 0.0)).rgb;
    vec3 cb = src(uvw - vec2(u_texel.x * 3.5, 0.0)).rgb;
    vec3 cm = src(uvw).rgb;
    rgb = vec3(cr.r, cm.g, cb.b);
    float band = smoothstep(0.02, 0.0, abs(fract(v_uv.y * 0.6 - u_time * 0.07) - 0.95));
    rgb += band * 0.25 * hash(v_uv * 400.0 + u_time);
    rgb = mix(rgb, vec3(dot(rgb, vec3(.299,.587,.114))), -0.25);
    rgb += (hash(v_uv * vec2(640.0, 480.0) + u_time) - 0.5) * 0.07;
    rgb *= 0.94 + 0.06 * sin(v_uv.y * 900.0);
  }
  if ((u_look & 2) != 0) {
    // pellicola: grana, vignetta, tinta calda, sfarfallio
    float g = (hash(v_uv * 900.0 + fract(u_time * 7.13)) - 0.5) * 0.09;
    rgb = rgb * vec3(1.06, 1.0, 0.9) + g;
    vec2 d = v_uv - 0.5;
    rgb *= 1.0 - dot(d, d) * 0.9;
    rgb *= 0.97 + 0.03 * hash(vec2(u_time, 1.0));
  }
  if ((u_look & 4) != 0) {
    rgb = vec3(dot(rgb, vec3(.299, .587, .114)));
  }
  if ((u_look & 8) != 0) {
    float y = dot(rgb, vec3(.299, .587, .114));
    rgb = vec3(y * 1.07 + 0.05, y * 0.95 + 0.02, y * 0.75);
  }
  if ((u_look & 16) != 0) {
    // tubo catodico: righe, maschera RGB, bordi scuri
    float sl = 0.78 + 0.22 * sin(v_uv.y / u_texel.y * 3.14159);
    int m = int(mod(gl_FragCoord.x, 3.0));
    vec3 mask = m == 0 ? vec3(1.0, 0.8, 0.8) : m == 1 ? vec3(0.8, 1.0, 0.8) : vec3(0.8, 0.8, 1.0);
    rgb *= sl * mask * 1.15;
    vec2 d = v_uv - 0.5;
    rgb *= smoothstep(0.75, 0.35, length(d * vec2(1.0, 1.2)));
  }
  // proc amp (il TBC): nero, guadagno, croma, fase
  rgb = (rgb - 0.5) * u_contrast + 0.5 + u_bright;
  float Y = dot(rgb, vec3(0.299, 0.587, 0.114));
  float I = dot(rgb, vec3(0.596, -0.274, -0.322));
  float Q = dot(rgb, vec3(0.211, -0.523, 0.312));
  float h = radians(u_hue), ch = cos(h), sh = sin(h);
  vec2 iq = vec2(ch * I - sh * Q, sh * I + ch * Q) * u_sat;
  rgb = vec3(Y + 0.956 * iq.x + 0.621 * iq.y, Y - 0.272 * iq.x - 0.647 * iq.y, Y - 1.106 * iq.x + 1.703 * iq.y);
  if (u_temp != 0.0) rgb *= vec3(1.0 + u_temp * 0.18, 1.0 + u_temp * 0.02, 1.0 - u_temp * 0.2);
  rgb = coloreAvanzato(rgb);
  if (u_vignette > 0.0) { vec2 dv = v_uv - 0.5; rgb *= 1.0 - u_vignette * smoothstep(0.15, 0.6, dot(dv, dv) * 2.2); }
  rgb = clamp(rgb, 0.0, 1.0);
  // chiave
  if (u_key == 1) {
    float k = smoothstep(u_keyLevel - u_keySoft, u_keyLevel + u_keySoft, Y);
    aChiave = u_keyInv ? 1.0 - k : k;
  } else if (u_key == 2) {
    float k = matteColori(rgbGrezzo);
    if (u_keySfuma > 0.0) {
      // sfuma il bordo: la media della maschera su un anello attorno al punto
      float r = 1.0 + u_keySfuma * 5.0;
      float somma = k;
      for (int i = 0; i < 8; i++) {
        float an = float(i) * 0.785398;
        vec4 s = src(uv0 + vec2(cos(an), sin(an)) * u_texel * r);
        somma += matteColori(s.a > 0.0 ? s.rgb / s.a : vec3(0.0));
      }
      k = somma / 9.0;
    }
    if (u_keyPulisci > 0.0) k = clamp((k - u_keyPulisci * 0.4) / (1.0 - u_keyPulisci * 0.8), 0.0, 1.0);
    aChiave = u_keyInv ? 1.0 - k : k;
    if (u_keySpill > 0.0 && !u_keyInv) rgb = clamp(senzaRiflesso(rgb), 0.0, 1.0);
  } else if (u_key == 3) {
    float m = mix(texture(u_matte, uv0).r, texture(u_matte2, uv0).r, u_matteK);
    float soglia = 0.5 - u_keyBordo * 0.35;
    float mor = 0.03 + u_keySoft * 0.45;
    float k = smoothstep(soglia - mor, soglia + mor, m);
    aChiave = u_keyInv ? 1.0 - k : k;
  }
  ${Mr}
  a *= aChiave;
  // la passata con le maschere a forma: si moltiplica per la copertura (nessuna maschera = niente passata)
  if (u_formaOn) a *= texture(u_forma, uv0).r;
  // angoli tondi (e l'ombra, che è lo stesso rettangolo sfumato): distanza dal rettangolo arrotondato, in pixel
  if (u_round > 0.0 || u_feather > 0.0) {
    vec2 lo = u_box.xy * u_boxPx, hi = (vec2(1.0) - u_box.zw) * u_boxPx;
    vec2 q = abs(v_uv * u_boxPx - (lo + hi) * 0.5) - (hi - lo) * 0.5 + vec2(u_round);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_round;
    a *= 1.0 - smoothstep(-u_feather, u_feather, d);
  }
  a *= u_alpha;
  if (u_vista == 3 && u_key == 3) {
    // il contorno: dove la maschera cambia (a due pixel di distanza), colorato; fuori dalla maschera l'immagine è più scura
    vec2 d = u_texel * 3.0;
    float e1 = texture(u_matte, uv0 + vec2(d.x, 0.0)).r, e2 = texture(u_matte, uv0 - vec2(d.x, 0.0)).r;
    float e3 = texture(u_matte, uv0 + vec2(0.0, d.y)).r, e4 = texture(u_matte, uv0 - vec2(0.0, d.y)).r;
    float lo = min(min(e1, e2), min(e3, e4)), hi = max(max(e1, e2), max(e3, e4));
    float bordo = smoothstep(0.15, 0.6, hi - lo);
    o = vec4(mix(rgb * mix(0.4, 1.0, aChiave), vec3(1.0, 0.18, 0.58), bordo), 1.0);
    return;
  }
  if (u_vista == 1 && u_key != 0) { o = vec4(vec3(aChiave), 1.0); return; }
  if (u_vista == 2 && u_key != 0) {
    vec2 g = floor(gl_FragCoord.xy / 14.0);
    vec3 fondo = mix(vec3(0.16), vec3(0.30), mod(g.x + g.y, 2.0));
    o = vec4(rgb * a + fondo * (1.0 - a), 1.0);
    return;
  }
  o = vec4(rgb * a, a);
}`,Ir=`#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos; gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }`,Lr=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec3 u_lift, u_gamma, u_gain, u_shadow, u_high;
uniform float u_sat, u_contrast, u_vignette, u_grain, u_time, u_split;
${Vt}
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  vec3 r = c;
  if (v_uv.x >= u_split) {
    r = c * u_gain + u_lift * (1.0 - c);
    r = pow(max(r, 0.0), 1.0 / max(u_gamma, vec3(0.1)));
    r = (r - 0.5) * u_contrast + 0.5;
    float y = dot(r, vec3(0.2126, 0.7152, 0.0722));
    r = mix(vec3(y), r, u_sat);
    r += u_shadow * (1.0 - smoothstep(0.0, 0.55, y)) + u_high * smoothstep(0.45, 1.0, y);
    r = coloreAvanzato(r);
    vec2 d = v_uv - 0.5;
    r *= 1.0 - u_vignette * smoothstep(0.12, 0.62, dot(d, d) * 2.0);
    if (u_grain > 0.0) r += (hash(v_uv * vec2(1280.0, 720.0) + fract(u_time * 7.13)) - 0.5) * u_grain;
  }
  if (u_split > 0.0 && abs(v_uv.x - u_split) < 0.0015) r = vec3(1.0, 0.84, 0.29);
  o = vec4(clamp(r, 0.0, 1.0), 1.0);
}`,Rr=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_res, u_off;
uniform float u_zoom, u_rot, u_blur, u_pixel, u_rgb, u_glitch, u_seme, u_desat, u_invert, u_flash, u_fade, u_luce, u_lucePh, u_bande, u_vhs, u_time;
uniform float u_bagliore, u_flare, u_flarePh, u_arco, u_arcoPh, u_espo, u_neon, u_onda, u_bolla, u_vortice, u_caleido, u_calore, u_zblur;
uniform float u_eco, u_duo, u_poster, u_solar, u_termico, u_visore, u_retino, u_muto, u_gocce, u_specchio, u_quadri, u_rullo, u_pesce;
uniform float u_raggi, u_bokeh, u_scint, u_anam, u_neve, u_pioggia, u_polvere, u_coriandoli;
uniform float u_olo, u_prisma, u_matita, u_tunnel, u_nebbia, u_braci, u_vetro, u_nosegn, u_iride, u_mini, u_esa, u_scan;
uniform float u_grana, u_semeGrana, u_nitido;
uniform float u_censura;
uniform int u_numCensure;
uniform vec4 u_censure[8]; // centro (y dal basso) e mezze dimensioni
uniform float u_morbidoCensure[8];
uniform vec3 u_flashCol, u_fadeCol, u_tinta;
uniform vec2 u_centro;   // il centro di zoom e distorsioni (lo sceglie chi posa l'effetto)
uniform vec2 u_sole;     // il sole del riflesso d'obiettivo (x < -1 = passa da solo)
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 campione(vec2 uv) {
  vec2 q = clamp(uv, vec2(0.0005), vec2(0.9995));
  vec3 originale = texture(u_src, q).rgb;
  if (u_censura <= 0.0 || u_numCensure == 0) return originale;
  float maschera = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_numCensure) break;
    vec4 z = u_censure[i];
    vec2 d = abs(q - z.xy) - z.zw;
    // la morbidezza cresce FUORI dal riquadro: dentro è sempre mosaico pieno
    float sd = max(d.x, d.y);
    maschera = max(maschera, 1.0 - smoothstep(0.0, max(0.00001, u_morbidoCensure[i]), sd));
  }
  if (maschera <= 0.0) return originale;
  float lato = mix(0.008, 0.06, min(1.0, u_censura));
  vec2 cella = vec2(lato * u_res.y / u_res.x, lato);
  vec2 mosaico = clamp((floor(q / cella) + 0.5) * cella, vec2(0.0005), vec2(0.9995));
  return mix(originale, texture(u_src, mosaico).rgb, maschera);
}
vec3 tinta(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
// i colori sdoppiati (rosso e blu che scappano) valgono per ogni campione: così si sommano con sfocatura, neon e bagliore
float g_sp = 0.0;
vec3 camp(vec2 uv) {
  vec3 s = campione(uv);
  if (g_sp > 0.0) { s.r = campione(uv + vec2(g_sp, 0.0)).r; s.b = campione(uv - vec2(g_sp, 0.0)).b; }
  return s;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 caldo(float y) {
  vec3 c = mix(vec3(0.02, 0.0, 0.16), vec3(0.42, 0.0, 0.62), smoothstep(0.0, 0.25, y));
  c = mix(c, vec3(0.92, 0.1, 0.1), smoothstep(0.25, 0.5, y));
  c = mix(c, vec3(1.0, 0.76, 0.05), smoothstep(0.5, 0.75, y));
  return mix(c, vec3(1.0), smoothstep(0.78, 1.0, y));
}
// le particelle: strati di celle, ognuna con il suo granello che cade o fluttua
float fiocchi(vec2 st, float scala, float vel, float raggio) {
  vec2 g = st * scala;
  g.y += u_time * vel;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id), h2 = hash(id + 17.3);
  vec2 ctr = vec2(0.5 + sin(u_time * (0.7 + h1) + h2 * 6.28) * 0.28, 0.2 + 0.6 * h2);
  return step(0.4, h1) * smoothstep(raggio, raggio * 0.3, length(f - ctr));
}
float goccia(vec2 st, float scala, float vel) {
  vec2 s = vec2(st.x + st.y * 0.2, st.y);
  float colonna = floor(s.x * scala);
  float h = hash(vec2(colonna, 3.1));
  float yy = s.y * 1.4 + u_time * vel * (0.8 + 0.6 * h) + h * 9.0;
  float ciclo = floor(yy), ph = fract(yy);
  float c = step(0.55, hash(vec2(colonna, ciclo)));
  float fx = abs(fract(s.x * scala) - 0.5);
  return c * smoothstep(0.1, 0.0, fx) * pow(1.0 - ph, 5.0) * smoothstep(0.0, 0.04, ph);
}
float granello(vec2 st, float scala, float raggio, float seme) {
  vec2 g = st * scala + vec2(sin(u_time * 0.13 + seme), u_time * 0.06 + cos(u_time * 0.1 + seme));
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 3.3), h3 = hash(id + seme + 8.1);
  vec2 ctr = 0.5 + (vec2(h1, h2) - 0.5) * 0.6 + 0.08 * vec2(sin(u_time * 0.7 + h3 * 6.0), cos(u_time * 0.6 + h1 * 6.0));
  float tw = 0.45 + 0.55 * sin(u_time * (0.8 + h2) + h3 * 6.28);
  return step(0.35, h3) * tw * smoothstep(raggio, raggio * 0.2, length(f - ctr));
}
vec3 bokehStrato(vec2 st, float scala, float vel, float raggio, float seme) {
  vec2 g = st * scala + vec2(u_time * vel * 0.4, u_time * vel);
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 11.7), h3 = hash(id + seme + 5.3);
  vec2 ctr = 0.5 + (vec2(h1, h2) - 0.5) * 0.35;
  float d = length(f - ctr), r = raggio * (0.6 + 0.8 * h3);
  float disco = smoothstep(r, r * 0.88, d) * (0.4 + 0.6 * smoothstep(r * 0.55, r * 0.95, d));
  float tw = 0.5 + 0.5 * sin(u_time * (0.5 + h1) + h2 * 6.28);
  return u_tinta * disco * tw * step(0.5, h3);
}
vec3 scintStrato(vec2 st, float scala, float seme) {
  vec2 g = st * scala;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 3.7), h3 = hash(id + seme + 9.1);
  vec2 p = f - (0.5 + (vec2(h1, h2) - 0.5) * 0.6);
  float s = 0.05 + 0.05 * h2;
  float ph = fract(u_time * (0.25 + 0.4 * h3) + h1 * 3.0);
  float lampo = pow(sin(ph * 3.14159), 5.0);
  float core = exp(-dot(p, p) / (s * s * 0.06));
  float croce = exp(-abs(p.x) / (s * 0.05)) * exp(-abs(p.y) / (s * 1.8)) + exp(-abs(p.y) / (s * 0.05)) * exp(-abs(p.x) / (s * 1.8));
  return u_tinta * (core + croce * 0.55) * lampo * step(0.45, h3);
}
vec4 coriStrato(vec2 st, float scala, float vel, float seme) {
  vec2 g = st * scala;
  g.y += u_time * vel;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 7.7), h3 = hash(id + seme + 2.3);
  vec2 ctr = vec2(0.2 + 0.6 * h1 + 0.1 * sin(u_time * (1.0 + h2) * 2.0 + h3 * 6.0), 0.2 + 0.6 * h2);
  float a = u_time * (1.5 + 3.0 * h3) + h1 * 6.28;
  vec2 p = f - ctr;
  p = vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
  float w = 0.06 * abs(cos(u_time * (2.0 + 3.0 * h2) + h1 * 9.0)) + 0.008;
  float m = step(abs(p.x), 0.085) * step(abs(p.y), w) * step(0.3, h3);
  return vec4(tinta(h1) * (0.75 + 0.25 * h2) + 0.15, m);
}
float rum(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// le braci: puntini caldi che salgono e brillano
float brace(vec2 st, float scala, float vel, float seme) {
  vec2 g = st * scala;
  g.y -= u_time * vel;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 5.3), h3 = hash(id + seme + 9.7);
  vec2 ctr = vec2(0.5 + 0.3 * sin(u_time * (1.0 + h1) * 1.5 + h2 * 6.28), 0.3 + 0.4 * h2);
  float tw = 0.4 + 0.6 * sin(u_time * (3.0 + 4.0 * h2) + h3 * 6.28);
  return step(0.5, h3) * max(tw, 0.0) * smoothstep(0.12, 0.0, length(f - ctr));
}
void main() {
  float asp = u_res.x / u_res.y;
  // zoom e rotazione attorno al centro, poi lo spostamento (scossa, camera a mano)
  vec2 c = (v_uv - u_centro) * vec2(asp, 1.0);
  float cr = cos(u_rot), sr = sin(u_rot);
  c = vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y) / u_zoom;
  // le distorsioni: tutte sulle coordinate, così si sommano fra loro e con lo zoom
  float rr = length(c);
  if (u_pesce > 0.0) c *= (1.0 + u_pesce * 0.55 * rr * rr) / (1.0 + u_pesce * 0.3);
  if (u_gocce > 0.0) c += c / max(rr, 1e-4) * sin(rr * 42.0 - u_time * 8.0) * 0.011 * u_gocce * exp(-rr * 1.6);
  rr = length(c);
  if (u_caleido > 0.0) {
    float seg = 6.2831853 / 6.0;
    float a = mod(atan(c.y, c.x) + u_time * 0.2, seg);
    a = abs(a - seg * 0.5);
    c = mix(c, vec2(cos(a), sin(a)) * rr, u_caleido);
  }
  if (u_vortice > 0.0) {
    float ang = u_vortice * 2.6 * max(0.0, 1.0 - rr * 1.4);
    c = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y);
  }
  // bolla (positiva) e pizzico (negativa): la stessa lente, un verso o l'altro
  if (u_bolla != 0.0) c *= 1.0 - u_bolla * 0.45 * (1.0 - smoothstep(0.0, 0.55, rr));
  vec2 uv = c / vec2(asp, 1.0) + u_centro + u_off;
  if (u_tunnel > 0.0) {
    // il tunnel: l'immagine dentro l'immagine, in una zoomata senza fine (le copie rientrano nella cornice)
    float sc = mix(1.0, 2.4, min(1.0, u_tunnel));
    vec2 tq = (uv - u_centro) * pow(sc, fract(u_time * 0.35));
    float tm = max(abs(tq.x), abs(tq.y));
    for (int i = 0; i < 8; i++) {
      if (tm > 0.5) { tq /= sc; tm /= sc; } else if (tm < 0.5 / sc) { tq *= sc; tm *= sc; }
    }
    uv = mix(uv, u_centro + tq, min(1.0, u_tunnel));
  }
  if (u_prisma > 0.0) {
    // schegge oblique che spostano ognuna un po' l'immagine
    vec2 pg = uv * vec2(asp, 1.0) * 6.0;
    pg = vec2(pg.x + pg.y * 0.5, pg.y);
    uv += (vec2(hash(floor(pg) + 1.7), hash(floor(pg) + 4.1)) - 0.5) * 0.07 * u_prisma;
  }
  if (u_vetro > 0.0) {
    vec2 cella = floor(uv * u_res / 4.0);
    uv += (vec2(hash(cella), hash(cella + 9.1)) - 0.5) * 0.02 * u_vetro + vec2(sin(uv.y * 90.0), sin(uv.x * 70.0)) * 0.003 * u_vetro;
  }
  if (u_quadri > 0.0) { vec2 m = uv * (1.0 + u_quadri); uv = 1.0 - abs(1.0 - mod(m, 2.0)); }
  if (u_specchio > 0.0) uv.x = mix(uv.x, min(uv.x, 1.0 - uv.x), min(1.0, u_specchio));
  float roll = 0.0;
  if (u_rullo > 0.0) { roll = fract(u_time * 0.8) * min(1.0, u_rullo); uv.y = mod(uv.y + roll, 1.0); }
  if (u_onda > 0.0) uv += vec2(sin(uv.y * 22.0 + u_time * 7.0) * 0.018, sin(uv.x * 16.0 + u_time * 5.0) * 0.01) * u_onda;
  if (u_calore > 0.0) uv += vec2(sin(uv.y * 70.0 + u_time * 13.0) + sin(uv.y * 31.0 - u_time * 9.0), cos(uv.x * 55.0 + u_time * 11.0)) * 0.0022 * u_calore;
  if (u_glitch > 0.0) {
    float riga = floor(uv.y * 28.0);
    if (hash(vec2(riga, u_seme)) > 1.0 - u_glitch * 0.55) uv.x += (hash(vec2(riga * 3.1, u_seme + 1.0)) - 0.5) * 0.18 * u_glitch;
  }
  if (u_vhs > 0.0) uv.x += sin(uv.y * 120.0 + u_time * 9.0) * 0.0025 * u_vhs + (hash(vec2(floor(uv.y * 200.0), u_time)) - 0.5) * 0.004 * u_vhs;
  if (u_pixel > 0.0) {
    float lato = mix(1.0, 80.0, u_pixel * u_pixel) / u_res.y;
    vec2 cella = vec2(lato / asp, lato);
    uv = (floor(uv / cella) + 0.5) * cella;
  }
  if (u_esa > 0.0) {
    // mosaico di esagoni
    float nn = mix(160.0, 14.0, min(1.0, u_esa));
    vec2 pe = uv * vec2(asp, 1.0) * nn;
    const vec2 szh = vec2(1.0, 1.7320508);
    vec4 hc = floor(vec4(pe, pe - vec2(1.0, 1.5)) / szh.xyxy) + 0.5;
    vec4 hh = vec4(pe - hc.xy * szh, pe - (hc.zw + 0.5) * szh);
    vec2 idc = dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? hc.xy : hc.zw + 0.5;
    uv = mix(uv, idc * szh / nn / vec2(asp, 1.0), min(1.0, u_esa * 4.0));
  }
  g_sp = u_rgb * 0.014 + u_glitch * 0.012 + u_vhs * 0.004 + u_prisma * 0.012 + u_olo * 0.003;
  vec3 col;
  if (u_blur > 0.0 || u_zblur > 0.0) {
    // sfocatura a disco (spirale d'oro) e scia verso il centro nello stesso giro: sfoca e zoom sfocato si sommano
    float r = u_blur * 0.035;
    col = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float a = fi * 2.39996;
      vec2 pos = mix(uv, u_centro, fi / 23.0 * u_zblur * 0.22);
      col += camp(pos + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 24.0) * r * vec2(1.0 / asp, 1.0));
    }
    col /= 24.0;
  } else col = camp(uv);
  if (u_nitido > 0.0) {
    // unsharp mask: aggiunge solo il dettaglio, non sostituisce sfocatura/scia o RGB
    vec2 px = 1.0 / u_res;
    vec3 vicino = (camp(uv + vec2(px.x, 0.0)) + camp(uv - vec2(px.x, 0.0))
      + camp(uv + vec2(0.0, px.y)) + camp(uv - vec2(0.0, px.y))) * 0.25;
    col += clamp(camp(uv) - vicino, vec3(-0.2), vec3(0.2)) * u_nitido;
  }
  if (u_eco > 0.0) {
    // l'eco: due copie sfasate che rincorrono l'immagine
    vec3 g1 = camp(uv - vec2(0.02, 0.012) * u_eco), g2 = camp(uv - vec2(0.045, 0.026) * u_eco);
    col = mix(col, col * 0.55 + g1 * 0.3 + g2 * 0.15, min(1.0, u_eco));
  }
  if (u_neon > 0.0) {
    // i contorni: dove la luce cambia di colpo si accende il tubo, il resto si spegne
    vec2 px = 1.5 / u_res;
    float l = dot(camp(uv + vec2(px.x, 0.0)) - camp(uv - vec2(px.x, 0.0)), vec3(0.33));
    float m = dot(camp(uv + vec2(0.0, px.y)) - camp(uv - vec2(0.0, px.y)), vec3(0.33));
    float bordo = clamp(length(vec2(l, m)) * 5.0, 0.0, 1.0);
    vec3 luceNeon = tinta(fract(uv.x * 0.6 + uv.y * 0.3 + u_time * 0.15)) * bordo * 2.2;
    col = mix(col, col * 0.18 + luceNeon, u_neon);
  }
  if (u_bagliore > 0.0) {
    // le parti chiare si allargano (il bloom delle lenti)
    vec3 g = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec3 s = camp(uv + vec2(cos(a), sin(a)) * 0.022 * vec2(1.0 / asp, 1.0));
      g += max(s - 0.5, 0.0);
    }
    col += g / 12.0 * 2.2 * u_bagliore + col * 0.08 * u_bagliore;
  }
  if (u_anam > 0.0) {
    // le luci forti si allungano di lato in strisce azzurre (la lente anamorfica)
    vec3 st = vec3(0.0);
    for (int i = -10; i <= 10; i++) {
      float w = 1.0 - abs(float(i)) / 11.0;
      st += max(camp(uv + vec2(float(i) * 0.011, 0.0)) - 0.55, 0.0) * w;
    }
    col += st / 5.0 * vec3(0.3, 0.55, 1.0) * u_anam * 3.0;
  }
  if (u_raggi > 0.0) {
    // i raggi di luce: le parti chiare si stirano verso fuori dal punto scelto
    vec3 g = vec3(0.0);
    for (int i = 0; i < 20; i++) {
      float t = float(i) / 19.0;
      g += max(camp(mix(uv, u_centro, t * 0.55)) - 0.72, 0.0) * (1.0 - t);
    }
    col += g / 8.0 * vec3(1.0, 0.86, 0.6) * u_raggi * 2.4;
  }
  col *= 1.0 + u_espo;
  float y = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(y), u_desat);
  col = mix(col, 1.0 - col, u_invert);
  // il colore: ognuno rifà i colori a modo suo, e si sommano l'uno sull'altro nell'ordine in cui sono scritti
  if (u_solar > 0.0) col = mix(col, mix(col, 1.0 - col, smoothstep(0.42, 0.58, col)), min(1.0, u_solar));
  if (u_termico > 0.0) col = mix(col, caldo(luma(col)), min(1.0, u_termico));
  if (u_duo > 0.0) {
    float yy = luma(col);
    vec3 d = mix(u_tinta * 0.12, mix(u_tinta, vec3(1.0), 0.8), smoothstep(0.05, 0.95, yy));
    col = mix(col, d, min(1.0, u_duo));
  }
  if (u_poster > 0.0) {
    float n = mix(24.0, 4.0, min(1.0, u_poster));
    col = mix(col, floor(col * n + 0.5) / n, min(1.0, u_poster));
  }
  if (u_visore > 0.0) {
    float yy = pow(clamp(luma(col) * 1.5, 0.0, 1.0), 0.8);
    float n = (hash(v_uv * vec2(900.0, 600.0) + fract(u_time * 13.7)) - 0.5) * 0.28;
    float sl = 0.86 + 0.14 * sin(v_uv.y * u_res.y * 1.4);
    vec3 g = vec3(0.1, 1.0, 0.28) * (yy + n) * sl;
    g *= smoothstep(1.0, 0.4, length((v_uv - 0.5) * vec2(asp * 0.75, 1.0)));
    col = mix(col, g, min(1.0, u_visore));
  }
  if (u_retino > 0.0) {
    // il retino: puntini più grossi dove è scuro, su carta chiara
    vec2 gp = v_uv * vec2(asp, 1.0) * 80.0;
    vec2 cella = fract(gp) - 0.5;
    float yy = luma(col);
    float r = sqrt(clamp(1.0 - yy, 0.0, 1.0)) * 0.7;
    float punto = smoothstep(r, r - 0.14, length(cella));
    vec3 pop = mix(vec3(0.98, 0.95, 0.88), clamp(col * 1.15, 0.0, 1.0) * 0.85, punto);
    col = mix(col, pop, min(1.0, u_retino));
  }
  if (u_muto > 0.0) {
    // il film muto: bianco e nero caldo, sfarfallio, graffi verticali, polvere, bordi scuri
    float yy = luma(col);
    vec3 s = vec3(yy * 1.05 + 0.04, yy * 0.96 + 0.02, yy * 0.8);
    float fotogramma = floor(u_time * 12.0);
    s *= 0.9 + 0.1 * hash(vec2(fotogramma, 1.0));
    s += step(0.996, hash(vec2(floor(v_uv.x * 260.0), fotogramma))) * 0.35;
    s += step(0.9985, hash(floor(v_uv * vec2(160.0, 90.0)) + fotogramma)) * 0.5;
    s += (hash(v_uv * vec2(700.0, 500.0) + fract(u_time * 9.0)) - 0.5) * 0.08;
    s *= smoothstep(0.95, 0.35, length((v_uv - 0.5) * vec2(1.2, 1.0)));
    col = mix(col, s, min(1.0, u_muto));
  }
  if (u_olo > 0.0) {
    // l'ologramma: azzurro, righe che scorrono, sfarfallio e una banda luminosa
    float yy = luma(col);
    float righe = 0.72 + 0.28 * sin(v_uv.y * u_res.y * 0.8 - u_time * 5.0);
    float trem = 0.88 + 0.12 * hash(vec2(floor(u_time * 20.0), 3.0));
    vec3 hol = vec3(0.25, 0.85, 1.0) * (yy * 1.25 + 0.06) * righe * trem;
    hol += vec3(0.4, 0.9, 1.0) * smoothstep(0.03, 0.0, abs(fract(v_uv.y * 0.5 - u_time * 0.2) - 0.5)) * 0.25;
    col = mix(col, hol, min(1.0, u_olo));
  }
  if (u_matita > 0.0) {
    // lo schizzo: contorni scuri, tratteggio nelle ombre, carta con la grana
    vec2 px = 1.3 / u_res;
    float gx = luma(camp(uv + vec2(px.x, 0.0))) - luma(camp(uv - vec2(px.x, 0.0)));
    float gy = luma(camp(uv + vec2(0.0, px.y))) - luma(camp(uv - vec2(0.0, px.y)));
    float bordo = clamp(length(vec2(gx, gy)) * 7.0, 0.0, 1.0);
    float yy = luma(col);
    float tratti = step(0.5, fract((v_uv.x * asp + v_uv.y) * u_res.y * 0.06 + hash(floor(v_uv * u_res / 6.0)) * 0.3)) * smoothstep(0.55, 0.15, yy) * 0.55;
    vec3 carta = vec3(0.96, 0.94, 0.88) + (hash(v_uv * u_res) - 0.5) * 0.06;
    vec3 sk = carta * (1.0 - clamp(bordo + tratti, 0.0, 1.0) * 0.82);
    col = mix(col, sk * mix(vec3(1.0), col * 1.5, 0.18), min(1.0, u_matita));
  }
  if (u_mini > 0.0) {
    // la miniatura: fuoco solo in una fascia (attorno al centro), fuori sfocato, e colori più pieni
    float dist = abs(v_uv.y - u_centro.y);
    float r = smoothstep(0.08, 0.34, dist) * 0.03 * u_mini;
    vec3 bl = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      bl += camp(uv + vec2(cos(a), sin(a)) * r * vec2(1.0 / asp, 1.0));
    }
    col = mix(col, bl / 12.0, smoothstep(0.0, 0.004, r));
    col = mix(vec3(luma(col)), col, 1.0 + 0.5 * min(1.0, u_mini));
  }
  if (u_rullo > 0.0) col *= 1.0 - 0.85 * smoothstep(0.045, 0.0, abs(v_uv.y - (1.0 - roll))) * min(1.0, u_rullo);
  if (u_vhs > 0.0) {
    col += (hash(v_uv * vec2(640.0, 480.0) + u_time) - 0.5) * 0.12 * u_vhs;
    col += smoothstep(0.03, 0.0, abs(fract(v_uv.y * 0.7 - u_time * 0.35) - 0.9)) * 0.35 * u_vhs;
  }
  if (u_luce > 0.0) {
    // la lama di luce calda che attraversa il quadro
    float x = v_uv.x + (v_uv.y - 0.5) * 0.35;
    float lama = exp(-pow((x - mix(-0.2, 1.2, u_lucePh)) * 3.2, 2.0));
    col += vec3(1.0, 0.55, 0.2) * lama * u_luce * 0.9 + vec3(1.0, 0.85, 0.6) * pow(lama, 3.0) * u_luce * 0.5;
  }
  if (u_arco > 0.0) {
    // la scia di colori che attraversa in diagonale (come la luce che entra dalla pellicola)
    float d = v_uv.x * 0.8 + (1.0 - v_uv.y) * 0.45 - mix(-0.3, 1.5, u_arcoPh);
    float banda = exp(-d * d * 7.0);
    vec3 arco = tinta(fract(d * 1.3 + 0.1));
    col = 1.0 - (1.0 - col) * (1.0 - arco * banda * u_arco * 0.75);
  }
  if (u_flare > 0.0) {
    // il riflesso d'obiettivo: la sorgente che passa in alto, la striscia orizzontale e gli aloni verso il centro
    vec2 sole = u_sole.x < -1.0 ? vec2(mix(-0.1, 1.1, u_flarePh), 0.28) : u_sole;
    vec2 d = (v_uv - vec2(sole.x, 1.0 - sole.y)) * vec2(asp, 1.0);
    vec3 fl = vec3(1.0, 0.92, 0.75) * exp(-dot(d, d) * 60.0) * 1.4 + vec3(1.0, 0.8, 0.55) * exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 1.8) * 0.55;
    for (int i = 1; i <= 3; i++) {
      vec2 g = mix(vec2(sole.x, 1.0 - sole.y), vec2(0.5), 0.5 + float(i) * 0.45);
      vec2 dg = (v_uv - g) * vec2(asp, 1.0);
      float an = smoothstep(0.08 * float(i), 0.07 * float(i), length(dg)) * 0.12;
      fl += tinta(0.08 * float(i) + 0.5) * an;
    }
    col += fl * u_flare;
  }
  // le particelle e le luci che fluttuano stanno sopra l'immagine (e sotto i lampi e le dissolvenze)
  vec2 st = v_uv * vec2(asp, 1.0);
  if (u_bokeh > 0.0) col += (bokehStrato(st, 2.0, 0.04, 0.3, 0.0) + bokehStrato(st, 3.2, 0.06, 0.26, 4.0) + bokehStrato(st, 5.0, 0.09, 0.22, 9.0)) * 0.55 * min(1.5, u_bokeh);
  if (u_scint > 0.0) col += (scintStrato(st, 4.0, 0.0) + scintStrato(st, 7.0, 5.0) + scintStrato(st, 11.0, 12.0)) * min(1.5, u_scint);
  if (u_polvere > 0.0) col += vec3(1.0, 0.95, 0.8) * (granello(st, 10.0, 0.07, 0.0) + granello(st, 17.0, 0.055, 3.0) + granello(st, 26.0, 0.04, 7.0)) * 1.6 * min(1.5, u_polvere);
  if (u_neve > 0.0) {
    float fl = fiocchi(st, 7.0, 0.35, 0.22) + fiocchi(st + 3.1, 13.0, 0.55, 0.17) + fiocchi(st + 7.7, 22.0, 0.8, 0.12);
    col = mix(col, vec3(1.0), clamp(fl, 0.0, 1.0) * min(1.0, u_neve) * 0.95);
  }
  if (u_pioggia > 0.0) {
    float pi = goccia(st, 55.0, 1.6) + goccia(st + 2.3, 85.0, 2.1) + goccia(st + 5.1, 120.0, 2.7);
    col *= 1.0 - 0.14 * min(1.0, u_pioggia);
    col = mix(col, vec3(0.85, 0.9, 1.0), clamp(pi * 2.2, 0.0, 1.0) * min(1.0, u_pioggia) * 0.8);
  }
  if (u_coriandoli > 0.0) {
    for (int i = 0; i < 3; i++) {
      vec4 k = coriStrato(st + float(i) * 3.7, 6.0 + float(i) * 4.0, 0.5 + float(i) * 0.25, float(i) * 5.0);
      col = mix(col, k.rgb, k.a * min(1.0, u_coriandoli));
    }
  }
  if (u_nebbia > 0.0) {
    float nn = 0.0, am = 0.5;
    vec2 z = st * 2.2 + vec2(u_time * 0.04, 0.0);
    for (int i = 0; i < 5; i++) { nn += am * rum(z); z *= 2.0; am *= 0.5; }
    float dens = clamp((nn - 0.28) * 1.7, 0.0, 1.0) * min(1.0, u_nebbia) * (1.0 - v_uv.y * 0.4);
    col = mix(col, vec3(0.8, 0.84, 0.88), dens * 0.8);
  }
  if (u_braci > 0.0) {
    float br = brace(st, 9.0, 0.5, 0.0) + brace(st + 3.7, 15.0, 0.75, 4.0) + brace(st + 8.1, 24.0, 1.0, 9.0);
    col += (vec3(1.0, 0.5, 0.1) * br * 1.6 + vec3(1.0, 0.35, 0.05) * pow(1.0 - v_uv.y, 4.0) * 0.3) * min(1.5, u_braci);
  }
  if (u_scan > 0.0) {
    float d = v_uv.y - fract(u_time * 0.5);
    col += vec3(0.4, 1.0, 0.85) * (exp(-abs(d) * 55.0) * 0.9 + step(d, 0.0) * exp(d * 5.0) * 0.12) * min(1.0, u_scan);
  }
  if (u_nosegn > 0.0) {
    // il segnale che non prende: barre e neve, a scatti
    float fase = floor(u_time * 15.0);
    float bb = floor(v_uv.x * 7.0);
    vec3 barre = vec3(step(0.5, float(bb == 0.0 || bb == 1.0 || bb == 4.0 || bb == 5.0)), step(0.5, float(bb < 4.0)), step(0.5, float(bb == 0.0 || bb == 2.0 || bb == 4.0 || bb == 6.0)));
    float nv = hash(floor(v_uv * vec2(320.0, 180.0)) + fase);
    vec3 sig = mix(barre * 0.8, vec3(nv), 0.45);
    col = mix(col, sig, smoothstep(0.3, 0.7, min(1.0, u_nosegn) * (0.55 + 0.45 * hash(vec2(fase, 1.0)))));
  }
  if (u_grana > 0.0) {
    // griglia fissa del progetto, non della preview: il ridimensionamento non cambia il seme
    float g = hash(floor(v_uv * vec2(1920.0, 1080.0)) + vec2(mod(u_semeGrana, 65536.0), 17.0));
    col += (g - 0.5) * 0.12 * u_grana;
  }
  col = mix(col, u_flashCol, u_flash);
  col = mix(col, u_fadeCol, u_fade);
  if (u_iride > 0.0) {
    // l'iride: fuori dal cerchio è nero
    float rd = length((v_uv - u_centro) * vec2(asp, 1.0));
    float ir = (1.0 - min(1.0, u_iride)) * length(vec2(asp, 1.0) * 0.5 + abs(u_centro - 0.5) * vec2(asp, 1.0)) * 1.05;
    col *= 1.0 - smoothstep(ir - 0.01, ir, rd);
  }
  if (u_bande > 0.0) {
    float b = u_bande * max(0.0, (1.0 - asp / 2.39) * 0.5);
    if (v_uv.y < b || v_uv.y > 1.0 - b) col = vec3(0.0);
  }
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,zr=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_a, u_b;
uniform bool u_hasA;
uniform int u_mode;        // 0 solo B, 1 mix, 2 tendina, 3 passaggio a colore, 4 effetto digitale
uniform float u_p, u_opacity, u_soft, u_border, u_aspect;
uniform int u_pattern;
uniform bool u_reverse;
uniform vec3 u_borderColor, u_dipColor;
uniform int u_dir;         // effetti digitali: la direzione, in quarti di giro
uniform float u_forza;     // effetti digitali: quanto è forte (scia, onda, sfocatura…)
uniform int u_curva;       // come corre: 0 come vuole l'effetto, 1 dolce, 2 parte piano, 3 arriva piano
out vec4 o;
float asp = 1.0;           // il rapporto del quadro (girato con la direzione)
float P = 0.0;             // l'avanzamento, dopo la curva

// q: coordinate dello schermo, 0..1 con y verso il basso. Fuori dal quadro = trasparente.
bool fuori(vec2 q) { return q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0; }
// la direzione: l'effetto gira di quarti di giro attorno al centro, le immagini restano dritte
vec2 gira(vec2 q, int d) {
  vec2 v = q - 0.5;
  if (d == 1) v = vec2(-v.y, v.x); else if (d == 2) v = -v; else if (d == 3) v = vec2(v.y, -v.x);
  return v + 0.5;
}
vec4 tA(vec2 q) { vec2 r = gira(q, u_dir); return (!u_hasA || fuori(r)) ? vec4(0.0) : texture(u_a, vec2(r.x, 1.0 - r.y)); }
vec4 tB(vec2 q) { vec2 r = gira(q, u_dir); return fuori(r) ? vec4(0.0) : texture(u_b, vec2(r.x, 1.0 - r.y)); }
vec4 sopra(vec4 b, vec4 a) { return b + a * (1.0 - b.a); }
float caso(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float dolce(float t) { return t * t * (3.0 - 2.0 * t); }
// il rumore morbido (per l'inchiostro): valori a caso sulla griglia, sfumati in mezzo
float rumoreV(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = caso(i.x + i.y * 57.0), b = caso(i.x + 1.0 + i.y * 57.0);
  float c = caso(i.x + (i.y + 1.0) * 57.0), d = caso(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// la palla che cade e rimbalza (0 in alto, 1 a terra)
float rimbalzo(float x) {
  float n1 = 7.5625, d1 = 2.75;
  if (x < 1.0 / d1) return n1 * x * x;
  if (x < 2.0 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
  if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}

float campo(vec2 uv) {
  vec2 c = uv - 0.5;
  if (u_pattern == 1) return uv.x;
  if (u_pattern == 2) return uv.y;
  if (u_pattern == 3) return max(uv.x, uv.y);
  if (u_pattern == 4) return max(1.0 - uv.x, uv.y);
  if (u_pattern == 21) return abs(c.x) * 2.0;
  if (u_pattern == 22) return abs(c.y) * 2.0;
  if (u_pattern == 41) return (uv.x + uv.y) * 0.5;
  if (u_pattern == 42) return (uv.x + 1.0 - uv.y) * 0.5;
  if (u_pattern == 61) return uv.x * 0.7 + abs(uv.y - 0.5) * 0.6;
  if (u_pattern == 62) return uv.x * 0.7 + (0.5 - abs(uv.y - 0.5)) * 0.6;
  if (u_pattern == 103) return min(abs(c.x), abs(c.y)) * 2.0;
  if (u_pattern == 122) return uv.x * 0.88 + (sin(uv.y * 12.0) * 0.5 + 0.5) * 0.12;
  if (u_pattern == 123) return uv.x * 0.85 + abs(fract(uv.y * 8.0) - 0.5) * 0.3;
  if (u_pattern == 202) return fract(fract(atan(c.x, -c.y) / 6.2831853 + 1.0) * 3.0);
  if (u_pattern == 101) return max(abs(c.x), abs(c.y)) * 2.0;
  if (u_pattern == 102) return abs(c.x) + abs(c.y);
  if (u_pattern == 119) return length(c * vec2(asp, 1.0)) / length(vec2(asp, 1.0) * 0.5);
  if (u_pattern == 201) return fract(atan(c.x, -c.y) / 6.2831853 + 1.0);
  if (u_pattern == 7) return fract((uv.x * 8.0)) ; // veneziana
  return uv.x;
}

// forme per le tendine a sagoma: distanza con segno (negativa dentro), di Inigo Quilez
float sdStella(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float d2(vec2 v) { return dot(v, v); }
float sdCuore(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(d2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(d2(p - vec2(0.0, 1.0)), d2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

vec4 tendina(vec2 q, vec4 A, vec4 B) {
  float s = max(u_soft, 0.0005);
  if (u_pattern == 120 || u_pattern == 121) {
    // la sagoma cresce dal centro fino a coprire tutto il quadro
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    c.y = -c.y;
    float mezzaDiag = length(vec2(asp, 1.0) * 0.5);
    float k = u_reverse ? 1.0 - P : P;
    float d;
    if (u_pattern == 120) { float r = k * mezzaDiag * 3.4 + 0.0001; d = sdStella(c, r, 0.45); }
    else { float sc = k * mezzaDiag * 4.2 + 0.0001; d = sdCuore(c / sc + vec2(0.0, 0.5)) * sc; }
    float m = 1.0 - smoothstep(-s * 0.5, s * 0.5, d);
    if (u_reverse) m = 1.0 - m;
    vec4 r = mix(A, B, m);
    if (u_border > 0.0) {
      float bm = smoothstep(-s * 0.5, s * 0.5, d) * (1.0 - smoothstep(u_border * 0.6 - s * 0.5, u_border * 0.6 + s * 0.5, d));
      r = mix(r, vec4(u_borderColor, 1.0), bm * step(0.001, P) * step(P, 0.999));
    }
    return r;
  }
  float f = campo(q);
  if (u_reverse) f = 1.0 - f;
  float e = P * (1.0 + 2.0 * s + u_border) - s - u_border;
  float m = 1.0 - smoothstep(e - s, e, f);
  vec4 r = mix(A, B, m);
  if (u_border > 0.0) {
    float bm = smoothstep(e - s, e, f) * (1.0 - smoothstep(e + u_border - s, e + u_border, f));
    r = mix(r, vec4(u_borderColor, 1.0), bm);
  }
  return r;
}

// un piano (la faccia di un cubo o una cartolina) visto da un occhio davanti allo schermo
vec2 ruotaY(vec2 xz, float a) { float c = cos(a), s = sin(a); return vec2(c * xz.x - s * xz.y, s * xz.x + c * xz.y); }

// celle a caso (Voronoi): ritorna il centro del pezzo più vicino (in coordinate della griglia) e il suo numero
vec4 pezzo(vec2 g) {
  vec2 id = floor(g), f = fract(g);
  float best = 9.0;
  vec4 r = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 nb = vec2(float(i), float(j));
    vec2 pt = nb + vec2(caso(dot(id + nb, vec2(3.1, 7.3))), caso(dot(id + nb, vec2(5.7, 2.9))));
    float d = length(pt - f);
    if (d < best) { best = d; r = vec4(id + pt, id + nb); }
  }
  return r;
}

vec4 effetto(vec2 q, float p) {
  float e = dolce(p);
  float arco = sin(p * 3.14159265) * min(u_forza, 1.6);
  if (u_pattern == 301) return q.x < 1.0 - e ? tA(q + vec2(e, 0.0)) : tB(q - vec2(1.0 - e, 0.0));
  if (u_pattern == 302) return q.x > e ? tA(q - vec2(e, 0.0)) : tB(q + vec2(1.0 - e, 0.0));
  if (u_pattern == 303) return q.y < 1.0 - e ? tA(q + vec2(0.0, e)) : tB(q - vec2(0.0, 1.0 - e));
  if (u_pattern == 304) return q.y > e ? tA(q - vec2(0.0, e)) : tB(q + vec2(0.0, 1.0 - e));
  if (u_pattern == 311) return q.x >= 1.0 - e ? sopra(tB(q - vec2(1.0 - e, 0.0)), tA(q)) : tA(q);
  if (u_pattern == 321) {
    vec2 c = q - 0.5;
    float sa = 1.0 + e * 1.6, sb = 1.0 + (1.0 - e) * 1.6;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 10; i++) {
      float k = float(i) / 9.0 * arco * 0.35;
      a += tA(0.5 + c / (sa + k));
      b += tB(0.5 + c / (sb + k));
    }
    return mix(a / 10.0, b / 10.0, smoothstep(0.4, 0.6, p));
  }
  if (u_pattern == 331) {
    float lato = mix(0.0015, 0.075, 1.0 - abs(2.0 * p - 1.0));
    vec2 cella = vec2(lato / asp, lato);
    vec2 qq = (floor(q / cella) + 0.5) * cella;
    return mix(tA(qq), tB(qq), smoothstep(0.45, 0.55, p));
  }
  if (u_pattern == 341) {
    vec2 d = q - 0.5;
    float r = length(d * vec2(asp, 1.0));
    vec2 w = d / max(r, 1e-4) * sin(r * 42.0 - p * 32.0) * arco * 0.028;
    return mix(tA(q + w), tB(q + w), smoothstep(0.3, 0.7, p));
  }
  if (u_pattern == 351) {
    vec4 m = mix(tA(q), tB(q), smoothstep(0.45, 0.55, p));
    return mix(m, vec4(1.0), pow(arco, 3.0));
  }
  if (u_pattern == 361) {
    vec4 m = mix(tA(q), tB(q), smoothstep(0.35, 0.65, p));
    float n = sin(q.x * 6.0 + p * 9.0) * 0.5 + sin(q.y * 9.0 - p * 7.0 + q.x * 3.0) * 0.5;
    float fronte = smoothstep(0.0, 1.0, (q.x * 0.9 + n * 0.22 + 0.25 - (1.0 - p) * 1.3) * 2.2);
    float l = arco * fronte * 1.5;
    vec3 luce = vec3(1.0, 0.55, 0.18) * l + vec3(1.0, 0.92, 0.7) * pow(l, 4.0);
    return vec4(min(vec3(1.0), m.rgb + luce), max(m.a, min(1.0, l)));
  }
  if (u_pattern == 371) {
    float fase = floor(p * 18.0);
    float riga = floor(q.y * 26.0);
    float h = caso(riga * 13.7 + fase * 7.3);
    float sh = (h - 0.5) * 0.25 * arco * step(0.55, caso(riga + fase * 1.7));
    vec2 qq = q + vec2(sh, 0.0);
    float sw = step(caso(fase * 3.1 + riga * 0.7), p);
    float rs = 0.014 * arco;
    vec4 base = mix(tA(qq), tB(qq), sw);
    vec4 r1 = mix(tA(qq + vec2(rs, 0.0)), tB(qq + vec2(rs, 0.0)), sw);
    vec4 b1 = mix(tA(qq - vec2(rs, 0.0)), tB(qq - vec2(rs, 0.0)), sw);
    return vec4(r1.r, base.g, b1.b, base.a);
  }
  if (u_pattern == 381) {
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float ang = arco * 3.0 * max(0.0, 1.0 - length(c) * 1.2);
    vec2 r = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y) / vec2(asp, 1.0) + 0.5;
    return mix(tA(r), tB(r), smoothstep(0.35, 0.65, p));
  }
  if (u_pattern == 391) {
    float rad = arco * 0.028;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
      vec2 d = vec2(float(i), float(j)) * rad / 3.0 * vec2(1.0 / asp, 1.0);
      a += tA(q + d);
      b += tB(q + d);
    }
    return mix(a / 49.0, b / 49.0, smoothstep(0.3, 0.7, p));
  }
  if (u_pattern == 421) {
    // zoom sfocato: si entra nella vecchia con la scia, si esce dalla nuova
    vec2 c = q - 0.5;
    vec4 a = vec4(0.0), b = vec4(0.0);
    float sa = 1.0 + e * 2.0, sb = 1.0 + (1.0 - e) * 0.6;
    for (int i = 0; i < 14; i++) {
      float k = float(i) / 13.0 * arco * 0.5;
      a += tA(0.5 + c / (sa + k));
      b += tB(0.5 + c / (sb + k));
    }
    return mix(a / 14.0, b / 14.0, smoothstep(0.42, 0.58, p));
  }
  if (u_pattern == 431) {
    // frusta: la camera gira di scatto, tutto striscia di lato
    float sh = e;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      float k = (float(i) / 15.0 - 0.5) * arco * 0.35;
      a += tA(q + vec2(sh + k, 0.0));
      b += tB(q - vec2(1.0 - sh - k, 0.0));
    }
    return q.x < 1.0 - sh ? a / 16.0 : b / 16.0;
  }
  if (u_pattern == 441) {
    // rotazione: la vecchia gira e si rimpicciolisce, la nuova arriva girando
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float ang = e * 6.2831853;
    float s1 = mix(1.0, 3.0, e), s2 = mix(3.0, 1.0, e);
    vec2 ra = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y);
    vec2 qa = ra * s1 / vec2(asp, 1.0) + 0.5, qb = ra * s2 / vec2(asp, 1.0) + 0.5;
    return mix(tA(qa), tB(qb), smoothstep(0.4, 0.6, p));
  }
  if (u_pattern == 451) {
    // lama di luce: una striscia bianca in diagonale spazza via la vecchia
    float x = q.x * 0.8 + q.y * 0.4;
    float fronte = mix(-0.25, 1.45, p);
    vec4 m = x < fronte ? tB(q) : tA(q);
    float l = exp(-pow((x - fronte) * 9.0, 2.0));
    return vec4(min(vec3(1.0), m.rgb + vec3(1.0, 0.97, 0.9) * l * 1.3), max(m.a, l));
  }
  if (u_pattern == 461) {
    // caleidoscopio: l'immagine si piega a spicchi, cambia, si riapre
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c), seg = 6.2831853 / 8.0;
    float a0 = mod(atan(c.y, c.x) + p * 3.0, seg);
    a0 = abs(a0 - seg * 0.5);
    vec2 k = mix(c, vec2(cos(a0), sin(a0)) * r, arco);
    vec2 qq = k / vec2(asp, 1.0) + 0.5;
    return mix(tA(qq), tB(qq), smoothstep(0.4, 0.6, p));
  }
  if (u_pattern == 471) {
    // aria calda: tutto trema come sopra l'asfalto e si scioglie nella nuova
    vec2 w = vec2(sin(q.y * 60.0 + p * 40.0) + sin(q.y * 23.0 - p * 30.0), cos(q.x * 45.0 + p * 35.0)) * 0.012 * arco;
    float n = caso(floor(q.x * 90.0) + floor(q.y * 50.0) * 91.0);
    return mix(tA(q + w), tB(q + w), smoothstep(n * 0.5, n * 0.5 + 0.5, p));
  }
  if (u_pattern == 481) {
    // tenda: la vecchia si apre dal centro in due metà, con l'ombra
    float h = e * 0.5;
    vec4 b = tB(q) * (0.6 + 0.4 * e);
    if (q.x < 0.5 - h) return tA(q + vec2(h, 0.0)) * (1.0 - 0.25 * smoothstep(0.5 - h - 0.05, 0.5 - h, q.x));
    if (q.x > 0.5 + h) return tA(q - vec2(h, 0.0)) * (1.0 - 0.25 * smoothstep(0.5 + h + 0.05, 0.5 + h, q.x));
    return b;
  }
  if (u_pattern == 491) {
    // sovraesposta: la vecchia si brucia di luce, dalla luce esce la nuova
    vec4 m = mix(tA(q), tB(q), smoothstep(0.45, 0.55, p));
    float l = pow(arco, 1.5);
    return vec4(min(vec3(1.0), m.rgb * (1.0 + l * 3.5) + l * 0.25), m.a);
  }
  if (u_pattern == 521) {
    // polvere: la vecchia si sgretola in granelli e sotto c'è la nuova
    float n = caso(floor(q.x * 320.0) * 1.37 + floor(q.y * 180.0) * 91.7);
    float soglia = q.y * 0.35 + n * 0.65;
    return p > soglia ? tB(q) : tA(q + vec2(0.0, -max(0.0, p - soglia + 0.25) * 0.15));
  }
  if (u_pattern == 531) {
    // persiane: le stecche girano una dopo l'altra, dall'alto in basso
    float n = 10.0;
    float riga = floor(q.y * n);
    float yl = fract(q.y * n);
    float t = clamp(p * 1.6 - riga / n * 0.6, 0.0, 1.0);
    float ang = dolce(t) * 3.14159265;
    float hh = abs(cos(ang));
    float d = (yl - 0.5) / max(hh, 0.001);
    if (abs(d) > 0.5) return vec4(0.0);
    vec2 qq = vec2(q.x, (riga + d + 0.5) / n);
    float luce = 0.55 + 0.45 * hh;
    return (ang < 1.5707963 ? tA(qq) : tB(qq)) * vec4(vec3(luce), 1.0);
  }
  if (u_pattern == 541) {
    // scacchiera: le caselle si girano a caso, una alla volta
    vec2 n = vec2(12.0, 7.0);
    vec2 cella = floor(q * n);
    float r0 = caso(cella.x * 7.13 + cella.y * 31.7);
    float t = clamp((p - r0 * 0.6) / 0.4, 0.0, 1.0);
    float ang = dolce(t) * 3.14159265;
    float w = abs(cos(ang));
    vec2 l = fract(q * n) - 0.5;
    if (abs(l.x) > w * 0.5) return vec4(0.0);
    vec2 qq = (cella + 0.5 + vec2(l.x / max(w, 0.001), l.y)) / n;
    float luce = 0.6 + 0.4 * w;
    return (ang < 1.5707963 ? tA(qq) : tB(qq)) * vec4(vec3(luce), 1.0);
  }
  if (u_pattern == 551) {
    // tuffo: la vecchia si allontana girando, la nuova si avvicina da dietro
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float s = 1.0 - e;
    float ang = e * 1.2;
    vec2 rr = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y) / max(s, 0.001);
    vec2 qa = rr / vec2(asp, 1.0) + 0.5;
    float zb = mix(1.3, 1.0, e);
    vec4 b = tB(0.5 + (q - 0.5) / zb) * vec4(vec3(0.45 + 0.55 * e), 1.0);
    if (s > 0.002 && qa.x >= 0.0 && qa.y >= 0.0 && qa.x <= 1.0 && qa.y <= 1.0) return tA(qa);
    return b;
  }
  if (u_pattern == 561) {
    // inchiostro: la nuova si spande come una goccia d'inchiostro nell'acqua
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float n = 0.0, amp = 0.5;
    vec2 z = q * vec2(asp, 1.0) * 4.0;
    for (int i = 0; i < 4; i++) { n += amp * rumoreV(z); z *= 2.1; amp *= 0.5; }
    float campo = length(c) * 0.9 + (n - 0.5) * 0.55;
    float fronte = mix(-0.2, 1.3, p);
    float m = 1.0 - smoothstep(fronte - 0.06, fronte, campo);
    vec4 r = mix(tA(q), tB(q), m);
    float bordo = (1.0 - smoothstep(0.0, 0.05, abs(campo - fronte))) * 0.35;
    return vec4(r.rgb * (1.0 - bordo), r.a);
  }
  if (u_pattern == 571) {
    // colori sdoppiati: la nuova entra di lato col rosso e il blu che scappano
    float sp = 0.07 * arco;
    vec2 qa = q + vec2(e, 0.0), qb = q - vec2(1.0 - e, 0.0);
    if (q.x < 1.0 - e) return vec4(tA(qa + vec2(sp, 0.0)).r, tA(qa).g, tA(qa - vec2(sp, 0.0)).b, tA(qa).a);
    return vec4(tB(qb + vec2(sp, 0.0)).r, tB(qb).g, tB(qb - vec2(sp, 0.0)).b, tB(qb).a);
  }
  if (u_pattern == 581) {
    // bolle: tanti cerchi si aprono qua e là e si uniscono
    vec2 n = vec2(9.0 * asp, 9.0);
    vec2 cella = floor(q * n);
    float best = 0.0;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
      vec2 cc = cella + vec2(float(dx), float(dy));
      float r0 = caso(cc.x * 3.7 + cc.y * 17.3);
      vec2 centro = (cc + 0.5 + (vec2(caso(cc.x + cc.y * 5.1), caso(cc.y + cc.x * 2.3)) - 0.5) * 0.6) / n;
      float t = clamp((p - r0 * 0.5) / 0.5, 0.0, 1.0);
      float raggio = dolce(t) * 1.6 / n.y;
      float d = length((q - centro) * vec2(asp, 1.0));
      best = max(best, 1.0 - smoothstep(raggio - 0.004, raggio, d));
    }
    return mix(tA(q), tB(q), best);
  }
  if (u_pattern == 591) {
    // rimbalzo: la nuova cade dall'alto e rimbalza, la vecchia sotto si scurisce
    float off = 1.0 - rimbalzo(clamp(p, 0.0, 1.0));
    if (q.y + off <= 1.0) return tB(q + vec2(0.0, off));
    return tA(q) * vec4(vec3(1.0 - 0.35 * (1.0 - off)), 1.0);
  }
  if (u_pattern == 601) {
    // pagina: la pagina si solleva da destra e si rovescia, sotto c'è la nuova
    float f = 1.0 - e;
    if (q.x > f) return tB(q) * vec4(vec3(0.5 + 0.5 * smoothstep(0.0, 0.2, q.x - f)), 1.0);
    float xm = 2.0 * f - q.x;
    if (xm <= 1.0 && xm >= f) {
      // il retro della pagina: piano, più scuro verso il bordo, con un riflesso lungo la piega
      float t = clamp((f - q.x) / max(0.001, 1.0 - f), 0.0, 1.0);
      vec4 r = tA(vec2(xm, q.y));
      float riflesso = exp(-pow((f - q.x) * 10.0, 2.0)) * 0.35;
      return vec4(r.rgb * (0.9 - 0.3 * t) * 0.85 + riflesso, max(r.a, 0.0));
    }
    float ombra = 1.0 - 0.3 * smoothstep(0.12, 0.0, (2.0 * f - 1.0) - q.x) * step(0.0, 2.0 * f - 1.0);
    return tA(q) * vec4(vec3(ombra), 1.0);
  }
  if (u_pattern == 611) {
    // frantumi: le piastrelle si girano e si rimpiccioliscono, una dopo l'altra, e sotto c'è la nuova
    vec2 n = vec2(10.0 * asp, 10.0);
    vec2 cella = floor(q * n);
    float r0 = caso(cella.x * 5.3 + cella.y * 19.7);
    float t = clamp((p - r0 * 0.55) / 0.45, 0.0, 1.0);
    vec2 l = fract(q * n) - 0.5;
    float ang = dolce(t) * (r0 - 0.5) * 6.0 * min(u_forza, 1.6);
    float sc = 1.0 - dolce(t);
    vec4 b = tB(q);
    if (sc < 0.02) return b;
    vec2 loc = vec2(cos(ang) * l.x - sin(ang) * l.y, sin(ang) * l.x + cos(ang) * l.y) / sc;
    if (abs(loc.x) > 0.5 || abs(loc.y) > 0.5) return b;
    return tA((cella + 0.5 + loc) / n) * vec4(vec3(1.0 - 0.3 * t), 1.0);
  }
  if (u_pattern == 621) {
    // spinta veloce: la nuova spinge via la vecchia, con la scia del movimento
    vec4 a = vec4(0.0);
    float amt = arco * 0.2;
    for (int i = 0; i < 14; i++) {
      float k = (float(i) / 13.0 - 0.5) * amt;
      vec2 qq = q + vec2(k, 0.0);
      a += qq.x < 1.0 - e ? tA(qq + vec2(e, 0.0)) : tB(qq - vec2(1.0 - e, 0.0));
    }
    return a / 14.0;
  }
  if (u_pattern == 631) {
    // fette: strisce orizzontali che scorrono una a destra e una a sinistra, con un filo di ritardo
    float n = 8.0;
    float riga = floor(q.y * n);
    float t = dolce(clamp((p - riga / (n - 1.0) * 0.4) / 0.6, 0.0, 1.0));
    float verso = mod(riga, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 qa = q - vec2(t * verso, 0.0), qb = q - vec2(t * verso - verso, 0.0);
    return (qa.x >= 0.0 && qa.x <= 1.0) ? tA(qa) : tB(qb);
  }
  if (u_pattern == 641) {
    // alveare: esagoni che si chiudono su se stessi e scoprono la nuova
    const vec2 sz = vec2(1.0, 1.7320508);
    float N = 8.0;
    vec2 pp = (q - 0.5) * vec2(asp, 1.0) * N;
    vec4 hc = floor(vec4(pp, pp - vec2(1.0, 1.5)) / sz.xyxy) + 0.5;
    vec4 hh = vec4(pp - hc.xy * sz, pp - (hc.zw + 0.5) * sz);
    vec2 l, id;
    if (dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw)) { l = hh.xy; id = hc.xy; } else { l = hh.zw; id = hc.zw + 0.5; }
    vec2 ctr = (id * sz) / N / vec2(asp, 1.0) + 0.5;
    float r0 = caso(dot(id, vec2(7.13, 31.7)));
    float t = clamp((p * 1.6 - length(ctr - 0.5) * 0.7 - r0 * 0.3) / 0.5, 0.0, 1.0);
    float sc = 1.0 - dolce(t);
    vec4 b = tB(q);
    if (sc < 0.02) return b;
    vec2 loc = l / sc;
    float hd = max(dot(abs(loc), vec2(0.5, 0.8660254)), abs(loc.x));
    if (hd > 0.5) return b;
    return tA(ctr + loc / N / vec2(asp, 1.0));
  }
  if (u_pattern == 651) {
    // onda d'urto: un anello si allarga dal centro e piega l'immagine; dentro c'è la nuova
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c), R = length(vec2(asp, 1.0) * 0.5);
    float d = r - p * (R + 0.25);
    vec2 dir = c / max(r, 1e-4);
    vec2 off = dir * exp(-d * d * 220.0) * sin(d * 55.0) * 0.05 * min(u_forza, 1.6) / vec2(asp, 1.0);
    float m = 1.0 - smoothstep(-0.02, 0.02, d);
    vec4 res = mix(tA(q + off), tB(q + off), m);
    return vec4(min(vec3(1.0), res.rgb + exp(-d * d * 800.0) * 0.4), res.a);
  }
  if (u_pattern == 661) {
    // nuvole: un fumo denso dissolve la vecchia nella nuova, a chiazze morbide
    float n = 0.0, amp = 0.5;
    vec2 z = q * vec2(asp, 1.0) * 3.0;
    for (int i = 0; i < 5; i++) { n += amp * rumoreV(z + vec2(p * 0.8, 0.0)); z *= 2.0; amp *= 0.5; }
    float m = smoothstep(n - 0.12, n + 0.12, p * 1.5 - 0.25);
    vec4 res = mix(tA(q), tB(q), m);
    float fumo = (1.0 - abs(2.0 * m - 1.0)) * 0.2 * arco;
    return vec4(res.rgb + fumo, res.a);
  }
  if (u_pattern == 671) {
    // fuoco: la vecchia brucia dai punti scelti dal caso, i bordi diventano brace, sotto c'è la nuova
    float n = 0.0, amp = 0.5;
    vec2 z = q * vec2(asp, 1.0) * 3.5;
    for (int i = 0; i < 5; i++) { n += amp * rumoreV(z); z *= 2.1; amp *= 0.5; }
    float d = (p * 1.5 - 0.25) - n;
    vec4 a = tA(q), b = tB(q);
    if (d < 0.0) {
      float pre = smoothstep(-0.3, 0.0, d);
      return vec4(a.rgb * (1.0 - 0.75 * pre) + vec3(1.0, 0.45, 0.08) * smoothstep(-0.07, 0.0, d) * 1.2, a.a);
    }
    float k = smoothstep(0.0, 0.07, d);
    vec3 brace = mix(vec3(1.0, 0.75, 0.2), vec3(0.15, 0.03, 0.0), k);
    return vec4(mix(brace, b.rgb, smoothstep(0.03, 0.1, d)), 1.0);
  }
  if (u_pattern == 681) {
    // rullino: la pellicola scorre verso l'alto, coi fori ai lati e lo spazio fra un fotogramma e l'altro
    float bordoFilm = smoothstep(0.0, 0.14, p) * smoothstep(1.0, 0.86, p);
    float sx0 = 0.085 * bordoFilm, gap = 0.05 * bordoFilm;
    float hh = 1.0 + gap;
    float off = e * hh;
    if (q.x < sx0 || q.x > 1.0 - sx0) {
      float y = q.y + off;
      float foro = step(0.5, fract(y * 9.0)) * step(0.08, fract(y * 9.0)) * step(abs(abs(q.x - 0.5) - (0.5 - sx0 * 0.5)), sx0 * 0.28);
      return vec4(vec3(0.03) + foro * vec3(0.9, 0.85, 0.7), 1.0);
    }
    float x2 = (q.x - sx0) / max(1e-3, 1.0 - 2.0 * sx0);
    vec2 qa = vec2(x2, q.y + off), qb = vec2(x2, q.y + off - hh);
    if (qa.y >= 0.0 && qa.y <= 1.0) return tA(qa);
    if (qb.y >= 0.0 && qb.y <= 1.0) return tB(qb);
    return vec4(vec3(0.02), 1.0);
  }
  if (u_pattern == 691) {
    // diaframma: le lamelle si chiudono sulla vecchia e si riaprono sulla nuova
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float R = length(vec2(asp, 1.0) * 0.5);
    float sc = p < 0.5 ? 1.0 - dolce(p * 2.0) : dolce(p * 2.0 - 1.0);
    float ang = p * 2.0 * min(u_forza, 1.6);
    vec2 r = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y);
    float hd = max(abs(r.y), abs(r.x) * 0.8660254 + abs(r.y) * 0.5);
    float m = 1.0 - smoothstep(sc * R * 0.86 - 0.01, sc * R * 0.86 + 0.01, hd);
    return mix(vec4(0.0, 0.0, 0.0, 1.0), p < 0.5 ? tA(q) : tB(q), m);
  }
  if (u_pattern == 701) {
    // punti: tanti cerchi crescono da un angolo e si uniscono (il retino)
    vec2 g = q * vec2(asp, 1.0) * 20.0;
    vec2 id = floor(g);
    float rit = id.x / (20.0 * asp) * 0.25 + id.y / 20.0 * 0.25;
    float r = clamp(p * 1.5 - rit, 0.0, 1.0) * 0.76;
    float m = 1.0 - smoothstep(r - 0.07, r, length(fract(g) - 0.5));
    return mix(tA(q), tB(q), m);
  }
  if (u_pattern == 711) {
    // spirale: il braccio di una spirale spazza via la vecchia
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c) / length(vec2(asp, 1.0) * 0.5);
    float a = fract(atan(c.y, c.x) / 6.2831853 + 1.0);
    float f = fract(a + r * 1.6);
    float t = p * 1.12;
    return mix(tA(q), tB(q), 1.0 - smoothstep(t - 0.06, t, f));
  }
  if (u_pattern == 721) {
    // doppia esposizione: le due immagini si sovrappongono come due pose sulla stessa pellicola
    vec4 a = tA(q), b = tB(q);
    vec3 sc = 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb);
    return vec4(mix(mix(a.rgb, b.rgb, dolce(p)), sc, arco * 0.85), mix(a.a, b.a, e));
  }
  if (u_pattern == 731) {
    // TV che si spegne: la vecchia si schiaccia in una riga e in un puntino, la nuova si apre da lì
    vec2 c = q - 0.5;
    bool prima = p < 0.5;
    float u = prima ? p * 2.0 : 1.0 - (p - 0.5) * 2.0;
    float sy = max(1.0 - dolce(clamp(u * 1.5, 0.0, 1.0)), 0.004);
    float sx = max(1.0 - dolce(clamp((u - 0.6) / 0.4, 0.0, 1.0)), 0.001);
    vec2 cc = c / vec2(sx, sy);
    vec4 img = (abs(cc.x) <= 0.5 && abs(cc.y) <= 0.5) ? (prima ? tA(cc + 0.5) : tB(cc + 0.5)) : vec4(0.0);
    vec3 col = img.rgb * (1.0 + 1.6 * smoothstep(0.3, 1.0, u));
    float riga = exp(-pow(c.y / (0.003 + 0.012 * (1.0 - u)), 2.0)) * smoothstep(0.55 * sx + 0.03, 0.55 * sx - 0.02, abs(c.x));
    col += vec3(0.85, 0.95, 1.0) * riga * smoothstep(0.35, 1.0, u);
    return vec4(col, 1.0);
  }
  if (u_pattern == 741) {
    // pioggia digitale: colonne di luce verde cadono a velocità diverse e lasciano dietro la nuova
    float col = floor(q.x * 48.0 * asp);
    float fronte = clamp(p * 1.55 - caso(col * 1.7) * 0.45, 0.0, 1.0) * 1.15;
    float dist = fronte - q.y;
    float dentro = step(q.y, fronte);
    float cella = step(0.45, caso(col + floor(q.y * 70.0) * 3.1));
    float scia = dentro * exp(-dist * 7.0) * step(0.001, fronte) * step(fronte, 1.14) * (0.35 + 0.65 * cella);
    float testa = smoothstep(0.02, 0.0, abs(dist)) * step(0.001, fronte) * step(fronte, 1.14);
    vec4 r = mix(tA(q), tB(q), dentro);
    return vec4(r.rgb + vec3(0.15, 1.0, 0.4) * scia * 0.9 + vec3(0.8, 1.0, 0.85) * testa, r.a);
  }
  if (u_pattern == 751) {
    // strappo: la carta si rompe lungo una linea irregolare e sotto c'è la nuova
    float pos = q.x * 0.82 + (1.0 - q.y) * 0.18 + (rumoreV(vec2(q.y * 11.0, 1.0)) - 0.5) * 0.14 + (rumoreV(vec2(q.y * 47.0, 3.0)) - 0.5) * 0.03;
    float d = (p * 1.42 - 0.2) - pos;
    vec4 a = tA(q + vec2(0.012, 0.0) * smoothstep(0.0, -0.12, d) * arco), b = tB(q);
    vec3 rgb = mix(a.rgb, b.rgb * (1.0 - 0.55 * smoothstep(0.07, 0.0, d)), smoothstep(0.0, 0.004, d));
    float bordo = smoothstep(-0.03, -0.022, d) * (1.0 - smoothstep(-0.005, 0.0, d));
    rgb = mix(rgb, vec3(0.96, 0.94, 0.88), bordo * 0.95 * step(0.001, p) * step(p, 0.999));
    return vec4(rgb, mix(a.a, b.a, smoothstep(0.0, 0.004, d)));
  }
  if (u_pattern == 761) {
    // vetro rotto: crepe, poi i pezzi cadono uno dopo l'altro dal punto dell'urto e scoprono la nuova
    vec2 sc = vec2(7.0 * asp, 7.0);
    vec4 v1 = pezzo(q * sc);
    vec2 ctr1 = v1.xy / sc;
    float r1 = caso(dot(v1.zw, vec2(12.9, 78.2)));
    float t1 = clamp((p * 1.6 - 0.25 - length((ctr1 - 0.5) * vec2(asp, 1.0)) * 0.55 - r1 * 0.3) / 0.5, 0.0, 1.0);
    vec2 spos = vec2((r1 - 0.5) * 0.12, t1 * t1 * 1.4) * step(0.0001, t1);
    vec2 q2 = q - spos;
    vec4 v2 = pezzo(q2 * sc);
    bool stesso = distance(v2.zw, v1.zw) < 0.5;
    vec4 b = tB(q);
    vec4 a = tA(q2);
    vec3 rgb = (stesso && !fuori(q2)) ? a.rgb : b.rgb;
    // le crepe: dove si toccano due pezzi, prima che cadano
    vec2 gq = q * sc;
    vec2 idq = floor(gq), fq = fract(gq);
    float d1 = 9.0, d2 = 9.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 nb = vec2(float(i), float(j));
      vec2 pt = nb + vec2(caso(dot(idq + nb, vec2(3.1, 7.3))), caso(dot(idq + nb, vec2(5.7, 2.9))));
      float dd = length(pt - fq);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    float crepa = smoothstep(0.05, 0.0, d2 - d1) * smoothstep(0.02, 0.2, p) * (1.0 - t1);
    rgb = mix(rgb, vec3(0.9, 0.95, 1.0), crepa * 0.55);
    return vec4(rgb, 1.0);
  }
  if (u_pattern == 771) {
    // sipario: la vecchia si apre come una tenda, con le pieghe, e mostra la nuova
    float w = 0.5 * (1.0 - e);
    float piega = 0.5 + 0.5 * sin(q.x * asp * 48.0);
    if (w > 0.002 && q.x < w) {
      float u = q.x / w;
      return tA(vec2(u * 0.5, q.y)) * vec4(vec3(0.62 + 0.38 * piega * (1.0 - 0.4 * e) - 0.2 * u), 1.0);
    }
    if (w > 0.002 && q.x > 1.0 - w) {
      float u = (1.0 - q.x) / w;
      return tA(vec2(1.0 - u * 0.5, q.y)) * vec4(vec3(0.62 + 0.38 * piega * (1.0 - 0.4 * e) - 0.2 * u), 1.0);
    }
    float ombra = w > 0.002 ? smoothstep(0.0, 0.08, min(q.x - w, 1.0 - w - q.x)) : 1.0;
    return tB(q) * vec4(vec3(0.55 + 0.45 * ombra), 1.0);
  }
  if (u_pattern == 781) {
    // anelli: cerchi concentrici girano uno dopo l'altro, e girando cambiano l'immagine
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c) / length(vec2(asp, 1.0) * 0.5);
    float anello = floor(r * 7.0);
    float t = clamp((p * 1.4 - anello / 7.0 * 0.4) / 0.3, 0.0, 1.0);
    float ang = (mod(anello, 2.0) * 2.0 - 1.0) * t * 0.9 * min(u_forza, 1.6);
    vec2 rc = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y) / vec2(asp, 1.0) + 0.5;
    rc = 1.0 - abs(1.0 - mod(rc, 2.0));
    vec4 m = mix(tA(rc), tB(rc), step(0.5, t));
    float bordo = smoothstep(0.0, 0.05, fract(r * 7.0)) * smoothstep(1.0, 0.95, fract(r * 7.0));
    return m * vec4(vec3(mix(1.0, bordo, sin(t * 3.14159) * 0.8)), 1.0);
  }
  if (u_pattern == 791) {
    // segnale perso: l'immagine si strappa a righe, poi barre e neve, e ritorna quella nuova
    float pk = 1.0 - abs(2.0 * p - 1.0);
    float riga = floor(q.y * 40.0), fase = floor(p * 25.0);
    vec2 qq = q + vec2((caso(riga + fase) - 0.5) * 0.22 * pk * min(u_forza, 1.6) * step(0.4, caso(riga * 1.3 + fase)), 0.0);
    vec4 img = p < 0.5 ? tA(qq) : tB(qq);
    float b = floor(q.x * 7.0);
    vec3 barre = vec3(step(0.5, float(b == 0.0 || b == 1.0 || b == 4.0 || b == 5.0)), step(0.5, float(b < 4.0)), step(0.5, float(b == 0.0 || b == 2.0 || b == 4.0 || b == 6.0)));
    float neve = caso(dot(floor(q * vec2(320.0, 180.0)), vec2(12.9898, 78.233)) + fase);
    vec3 sig = mix(barre * 0.8, vec3(neve), 0.5);
    return vec4(mix(img.rgb, sig, smoothstep(0.55, 0.85, pk)), 1.0);
  }
  if (u_pattern == 811) {
    // cola: la vecchia si scioglie e cola verso il basso, a strisce diverse, e scopre la nuova
    float n = rumoreV(vec2(q.x * asp * 14.0, 0.0)) * 0.5 + caso(floor(q.x * asp * 40.0)) * 0.2;
    float f = (p * 1.5 - n) * 1.25;
    vec4 b = tB(q);
    if (q.y < f) return b;
    vec4 a = tA(vec2(q.x + sin(q.y * 30.0) * 0.004 * smoothstep(0.2, 0.0, q.y - f), q.y - f * 0.85));
    return vec4(a.rgb * (0.75 + 0.25 * smoothstep(0.0, 0.1, q.y - f)), a.a);
  }
  if (u_pattern == 831) {
    // lente: una lente d'ingrandimento cresce e attraversa il quadro: dentro c'è la nuova, ingrandita
    vec2 ctr = vec2(mix(0.2, 0.5, e), 0.5 + sin(p * 6.2832) * 0.08 * (1.0 - e));
    float rad = 0.1 + e * 1.15;
    float r = length((q - ctr) * vec2(asp, 1.0));
    float m = smoothstep(rad, rad - 0.012, r);
    vec4 dentro = tB(ctr + (q - ctr) / (1.0 + 0.8 * (1.0 - e)));
    vec4 fuoriL = tA(q);
    vec4 res = mix(fuoriL, dentro, m);
    float anello = smoothstep(0.014, 0.0, abs(r - rad)) * step(0.001, p) * step(p, 0.999);
    return vec4(res.rgb + vec3(0.9, 0.95, 1.0) * anello * 0.7, res.a);
  }
  if (u_pattern == 841) {
    // spettro: i tre colori se ne vanno uno dopo l'altro, prima il rosso e per ultimo il blu
    vec4 a = tA(q), b = tB(q);
    float mR = smoothstep(q.x - 0.07, q.x + 0.07, p * 1.5 - 0.1);
    float mG = smoothstep(q.x - 0.07, q.x + 0.07, p * 1.5 - 0.1 - 0.16);
    float mB = smoothstep(q.x - 0.07, q.x + 0.07, p * 1.5 - 0.1 - 0.32);
    return vec4(mix(a.r, b.r, mR), mix(a.g, b.g, mG), mix(a.b, b.b, mB), mix(a.a, b.a, mG));
  }
  if (u_pattern == 861) {
    // cerniera: si apre dall'alto verso il basso e mostra la nuova, coi dentini sui bordi
    float zp = p * 1.25;
    float aperto = clamp(zp - q.y, 0.0, 1.0);
    float w = dolce(aperto) * 0.62;
    float dx = abs(q.x - 0.5);
    vec4 a = tA(q), b = tB(q);
    vec3 rgb = dx < w ? b.rgb * (0.6 + 0.4 * smoothstep(0.0, 0.06, w - dx)) : a.rgb;
    if (aperto > 0.0 && dx >= w && dx < w + 0.02) {
      float dente = step(0.5, fract(q.y * 46.0 + (q.x < 0.5 ? 0.0 : 0.5)));
      rgb = mix(vec3(0.85, 0.85, 0.88), vec3(0.32, 0.32, 0.36), dente);
    }
    float cursore = smoothstep(0.02, 0.0, abs(q.y - zp)) * smoothstep(0.045, 0.0, dx) * step(0.001, p) * step(p, 0.999);
    rgb = mix(rgb, vec3(0.95, 0.85, 0.3), cursore);
    return vec4(rgb, mix(a.a, b.a, step(dx, w)));
  }
  if (u_pattern == 801) {
    // portoni 3D: due battenti si aprono come porte e rivelano la nuova
    float w = 1.0 - e;
    float mezzo = 0.5 * w;
    vec4 b = tB(q);
    if (mezzo > 0.002 && (q.x < mezzo || q.x > 1.0 - mezzo)) {
      float u = (q.x < mezzo ? q.x : 1.0 - q.x) / mezzo;
      float ys = 1.0 - 0.28 * e * u * min(u_forza, 1.6);
      float yy = 0.5 + (q.y - 0.5) / ys;
      if (yy >= 0.0 && yy <= 1.0) {
        vec4 r = tA(vec2(q.x < mezzo ? u * 0.5 : 1.0 - u * 0.5, yy));
        return r * vec4(vec3(1.0 - 0.45 * e * u), 1.0);
      }
    }
    return b * vec4(vec3(0.7 + 0.3 * e), 1.0);
  }
  if (u_pattern == 401 || u_pattern == 411) {
    // raggio dall'occhio (0,0,-D) attraverso il punto dello schermo; lo schermo è il piano z = 0
    float a = asp;
    vec3 s3 = vec3((q.x - 0.5) * a, 0.5 - q.y, 0.0);
    float D = 2.4;
    vec3 O = vec3(0.0, 0.0, -D);
    vec3 dir = normalize(s3 - O);
    bool cubo = u_pattern == 401;
    float ang = cubo ? e * 1.5707963 : e * 3.14159265;
    float lontano = arco * (cubo ? 0.45 : 0.6);
    vec3 C = vec3(0.0, 0.0, (cubo ? a * 0.5 : 0.0) + lontano);
    // si porta il raggio nel riferimento dell'oggetto: l'oggetto ruota verso sinistra (la faccia di destra viene davanti),
    // qui si applica la rotazione inversa
    vec2 oxz = ruotaY((O - C).xz, ang), dxz = ruotaY(dir.xz, ang);
    vec3 ol = vec3(oxz.x, O.y - C.y, oxz.y), dl = vec3(dxz.x, dir.y, dxz.y);
    vec4 col = vec4(0.0);
    float tMin = 1e9;
    if (cubo) {
      // faccia A davanti (z = -a/2), faccia B a destra (x = +a/2)
      float t = (-a * 0.5 - ol.z) / dl.z;
      vec3 h = ol + t * dl;
      if (t > 0.0 && abs(h.x) <= a * 0.5 && abs(h.y) <= 0.5) { tMin = t; col = tA(vec2((h.x + a * 0.5) / a, 0.5 - h.y)) * (0.55 + 0.45 * cos(ang)); }
      t = (a * 0.5 - ol.x) / dl.x;
      h = ol + t * dl;
      if (t > 0.0 && t < tMin && abs(h.z) <= a * 0.5 && abs(h.y) <= 0.5) { col = tB(vec2((h.z + a * 0.5) / a, 0.5 - h.y)) * (0.55 + 0.45 * sin(ang)); }
    } else {
      float t = -ol.z / dl.z;
      vec3 h = ol + t * dl;
      if (t > 0.0 && abs(h.x) <= a * 0.5 && abs(h.y) <= 0.5) {
        float u = (h.x + a * 0.5) / a;
        float luce = 0.6 + 0.4 * abs(cos(ang));
        col = (ang < 1.5707963 ? tA(vec2(u, 0.5 - h.y)) : tB(vec2(1.0 - u, 0.5 - h.y))) * luce;
      }
    }
    return col;
  }
  return mix(tA(q), tB(q), p);
}

void main() {
  vec2 q = vec2(v_uv.x, 1.0 - v_uv.y);
  vec4 B = texture(u_b, v_uv);
  vec4 A = u_hasA ? texture(u_a, v_uv) : vec4(0.0);
  // la curva dell'avanzamento e il rapporto del quadro (con la direzione gira: 90° scambia larghezza e altezza)
  P = clamp(u_p, 0.0, 1.0);
  if (u_curva == 1) P = dolce(P); else if (u_curva == 2) P = P * P; else if (u_curva == 3) P = 1.0 - (1.0 - P) * (1.0 - P);
  asp = (u_mode == 4 && (u_dir == 1 || u_dir == 3)) ? 1.0 / u_aspect : u_aspect;
  vec4 r = B;
  if (u_mode == 1) r = mix(A, B, P);
  else if (u_mode == 3) {
    vec4 d = vec4(u_dipColor, 1.0);
    r = P < 0.5 ? mix(A, d, P * 2.0) : mix(d, B, (P - 0.5) * 2.0);
  } else if (u_mode == 2) r = tendina(q, A, B);
  else if (u_mode == 4) r = effetto(u_dir == 0 ? q : gira(q, (4 - u_dir) % 4), P);
  o = r * u_opacity;
}`,Br=[`u_a`,`u_b`,`u_hasA`,`u_mode`,`u_p`,`u_opacity`,`u_soft`,`u_border`,`u_aspect`,`u_pattern`,`u_reverse`,`u_borderColor`,`u_dipColor`,`u_dir`,`u_forza`,`u_curva`];function Vr(e,t,n,r,i,a,o){e.uniform1i(t.u_a,0),e.uniform1i(t.u_b,1),e.uniform1i(t.u_hasA,+!!a);let s=n?n.type===`mix`?1:n.type===`wipe`?2:n.type===`dve`?4:3:0;e.uniform1i(t.u_mode,s),e.uniform1f(t.u_p,Math.max(0,Math.min(1,r))),e.uniform1f(t.u_opacity,i),e.uniform1f(t.u_soft,n?.soft??0),e.uniform1f(t.u_border,n?.border??0),e.uniform1f(t.u_aspect,o),e.uniform1i(t.u_pattern,n?.pattern??1),e.uniform1i(t.u_reverse,+!!n?.reverse);let c=Ur(n?.borderColor??`#ffffff`),l=Ur(n?.color??`#000000`);e.uniform3f(t.u_borderColor,c[0],c[1],c[2]),e.uniform3f(t.u_dipColor,l[0],l[1],l[2]),e.uniform1i(t.u_dir,n?.type===`dve`?((n.dir??0)%4+4)%4:0),e.uniform1f(t.u_forza,Math.max(.1,n?.forza??1)),e.uniform1i(t.u_curva,n?.curva===`dolce`?1:n?.curva===`entra`?2:n?.curva===`esce`?3:0)}function Hr(e,t,n){let r=(t,n)=>{let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw Error(`shader: `+e.getShaderInfoLog(r));return r},i=e.createProgram();if(e.attachShader(i,r(e.VERTEX_SHADER,t)),e.attachShader(i,r(e.FRAGMENT_SHADER,n)),e.bindAttribLocation(i,0,`a_pos`),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw Error(`programma: `+e.getProgramInfoLog(i));return i}function Ur(e){let t=e.replace(`#`,``),n=parseInt(t.length===3?t.split(``).map(e=>e+e).join(``):t.slice(0,6),16)||0;return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}var Wr=class{canvas;prestazioni={disegni:0,immagini:0,uploadMs:0,renderMs:0,readbackMs:0};immaginiPrima=new Map;immagineNuova=!1;gl;coloreGpu;pLayer;pComb;pMaster;pFx;uM={};uF={};prima=0;uL={};uC={};vao;fbo=[];fbW=0;fbH=0;texs=new Map;used=new Set;blank;fornitore;successivo;interp=null;uscita=2;perso=!1;vistaChiave=0;constructor(e,t=!1){this.canvas=e;let n=e.getContext(`webgl2`,{alpha:!1,antialias:!1,premultipliedAlpha:!0,preserveDrawingBuffer:t,desynchronized:!1,powerPreference:`high-performance`});if(!n)throw Error(`WebGL2 non disponibile`);this.gl=n,this.coloreGpu=new Ht(n),this.pLayer=this.prog(Pr,Fr),this.pComb=this.prog(Ir,zr),this.pMaster=this.prog(Ir,Lr),this.pFx=this.prog(Ir,Rr);for(let e of[`u_src`,`u_res`,`u_off`,`u_zoom`,`u_rot`,`u_blur`,`u_pixel`,`u_rgb`,`u_glitch`,`u_seme`,`u_desat`,`u_invert`,`u_flash`,`u_fade`,`u_luce`,`u_lucePh`,`u_bande`,`u_vhs`,`u_time`,`u_flashCol`,`u_fadeCol`,`u_bagliore`,`u_flare`,`u_flarePh`,`u_arco`,`u_arcoPh`,`u_espo`,`u_neon`,`u_onda`,`u_bolla`,`u_vortice`,`u_caleido`,`u_calore`,`u_zblur`,`u_centro`,`u_sole`,`u_tinta`,`u_semeGrana`,`u_numCensure`,`u_censure`,`u_morbidoCensure`,...x.map(e=>`u_`+e)])this.uF[e]=n.getUniformLocation(this.pFx,e);for(let e of[`u_res`,`u_size`,`u_crop`,`u_off`,`u_scale`,`u_rot`,`u_tex`,`u_src`,`u_orient`,`u_color`,`u_bright`,`u_contrast`,`u_sat`,`u_hue`,`u_look`,`u_time`,`u_texel`,`u_key`,`u_keyColor`,`u_keyExtra`,`u_keyN`,`u_keyLevel`,`u_keySoft`,`u_keyInv`,`u_keySpill`,`u_keyBordo`,`u_keySfuma`,`u_keyPulisci`,`u_matte`,`u_matte2`,`u_matteK`,`u_forma`,`u_formaOn`,`u_vista`,...Bt,`u_mirror`,`u_temp`,`u_vignette`,`u_alpha`,`u_color2`,`u_grad`,`u_box`,`u_boxPx`,`u_round`,`u_feather`,`u_auto`,`u_autoLo`,`u_autoHi`,`u_autoWb`,`u_autoK`,`u_autoGamma`,`u_numClic`,`u_clic`,`u_clicColore`,`u_clicRapporto`])this.uL[e]=n.getUniformLocation(this.pLayer,e);for(let e of[...Bt,`u_src`,`u_lift`,`u_gamma`,`u_gain`,`u_shadow`,`u_high`,`u_sat`,`u_contrast`,`u_vignette`,`u_grain`,`u_time`,`u_split`])this.uM[e]=n.getUniformLocation(this.pMaster,e);for(let e of Br)this.uC[e]=n.getUniformLocation(this.pComb,e);this.vao=n.createVertexArray(),n.bindVertexArray(this.vao);let r=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,r),n.bufferData(n.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),n.STATIC_DRAW);for(let e of[this.pLayer,this.pComb,this.pMaster,this.pFx]){let t=n.getAttribLocation(e,`a_pos`);n.enableVertexAttribArray(t),n.vertexAttribPointer(t,2,n.FLOAT,!1,0,0)}this.blank=this.newTex(),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,1,1,0,n.RGBA,n.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),`addEventListener`in e&&e.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),this.perso=!0,this.coloreGpu.distruggi()},!1)}prog(e,t){return Hr(this.gl,e,t)}newTex(){let e=this.gl,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),t}ensureFbo(e,t){let n=this.gl;if(!(this.fbW===e&&this.fbH===t&&this.fbo.length)){for(let e of this.fbo)n.deleteFramebuffer(e.fb),n.deleteTexture(e.tex);this.fbo=[];for(let r=0;r<7;r++){let r=this.newTex();n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,e,t,0,n.RGBA,n.UNSIGNED_BYTE,null);let i=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,i),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,r,0),this.fbo.push({fb:i,tex:r})}this.fbW=e,this.fbH=t}}matte(e,t,n,r){let i=this.gl,a=this.texs.get(e);return a||(a={tex:this.newTex(),src:null,w:0,h:0},this.texs.set(e,a)),this.used.add(e),a.src!==r&&(i.bindTexture(i.TEXTURE_2D,a.tex),i.pixelStorei(i.UNPACK_ALIGNMENT,1),i.texImage2D(i.TEXTURE_2D,0,i.R8,t,n,0,i.RED,i.UNSIGNED_BYTE,r),i.pixelStorei(i.UNPACK_ALIGNMENT,4),a.src=r,a.w=t,a.h=n),a.tex}upload(e,t,n,r,i){let a=this.gl,o=this.texs.get(e);return o||(o={tex:this.newTex(),src:null,w:0,h:0},this.texs.set(e,o)),this.used.add(e),o.src!==i&&(a.bindTexture(a.TEXTURE_2D,o.tex),a.pixelStorei(a.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),a.texImage2D(a.TEXTURE_2D,0,a.RGBA,a.RGBA,a.UNSIGNED_BYTE,t),o.src=i,o.w=n,o.h=r),o}render(e,t,n,r,i,o){this.immagineNuova=!1,this.fornitore=i,this.successivo=o,this.interp?.inizia();let s=this.gl;if(this.perso||s.isContextLost())return;let c=this.canvas.width,l=this.canvas.height;this.coloreGpu.inizia(),this.ensureFbo(c,l),this.used.clear(),s.bindVertexArray(this.vao),s.bindFramebuffer(s.FRAMEBUFFER,this.fbo[2].fb),s.viewport(0,0,c,l),s.disable(s.BLEND),s.clearColor(0,0,0,1),s.clear(s.COLOR_BUFFER_BIT);let u=e.tracks.filter(e=>e.kind===`video`);for(let i=u.length-1;i>=0;i--){let a=u[i].id;for(let i of t){if(i.trackId!==a)continue;let t=!!i.a&&!!i.tr,o=i.b?this.layer(e,i.b,1,n,r):!1,c=t?this.layer(e,i.a,0,n,r):!1;if(o||c){if(o||(s.bindFramebuffer(s.FRAMEBUFFER,this.fbo[1].fb),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT)),i.altre?.length&&c&&o){let e=1,t=[{tr:i.tr,prog:i.prog,sopra:!1},...i.altre];for(let n=0;n<t.length;n++){let r=n===t.length-1,a=r?2:n%2?6:5;this.combine(t[n].tr,t[n].prog,r?i.opacity:1,!0,e,a,t[n].sopra&&n>0?e:0),e=a}}else this.combine(i.tr,i.prog,i.opacity,c)}}let o=p(e,r,a);o&&(this.effetti(o,r,c,l),s.bindFramebuffer(s.READ_FRAMEBUFFER,this.fbo[4].fb),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,this.fbo[2].fb),s.blitFramebuffer(0,0,c,l,0,0,c,l,s.COLOR_BUFFER_BIT,s.NEAREST),s.bindFramebuffer(s.FRAMEBUFFER,this.fbo[2].fb))}let d=At(a(e)),f=Nt(d)&&this.prima<=0?2:3;if(f===3){s.bindFramebuffer(s.FRAMEBUFFER,this.fbo[3].fb),s.viewport(0,0,c,l),s.disable(s.BLEND),s.useProgram(this.pMaster);let t=this.uM;s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,this.fbo[2].tex),s.uniform1i(t.u_src,0),s.uniform3f(t.u_lift,...d.lift),s.uniform3f(t.u_gamma,...d.gamma),s.uniform3f(t.u_gain,...d.gain),s.uniform3f(t.u_shadow,...d.shadow),s.uniform3f(t.u_high,...d.high),s.uniform1f(t.u_sat,d.sat),s.uniform1f(t.u_contrast,d.contrast),s.uniform1f(t.u_vignette,d.vignette),s.uniform1f(t.u_grain,d.grain),s.uniform1f(t.u_time,r%1e4/25),s.uniform1f(t.u_split,this.prima),this.coloreGpu.imposta(e,d,t,!1),s.drawArrays(s.TRIANGLE_STRIP,0,4)}this.uscita=f;let m=Zt(e,r,c,l);m&&this.sovrimpressione(e,r,c,l,m,f),s.bindFramebuffer(s.READ_FRAMEBUFFER,this.fbo[f].fb),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.blitFramebuffer(0,0,c,l,0,0,c,l,s.COLOR_BUFFER_BIT,s.NEAREST),s.bindFramebuffer(s.FRAMEBUFFER,null);for(let[e,t]of this.texs)this.used.has(e)||(s.deleteTexture(t.tex),this.texs.delete(e));this.interp?.finisce(),this.coloreGpu.finisce()}sovr=null;sovrimpressione(e,t,n,r,i,a){let o=this.gl;if(!this.sovr||this.sovr.firma!==i){let a=this.sovr&&this.sovr.tela.width===n&&this.sovr.tela.height===r?this.sovr.tela:he(n,r);$t(a.getContext(`2d`),e,t,n,r),this.sovr={firma:i,tela:a}}let s=this.upload(`img:sovr`,this.sovr.tela,n,r,i);o.bindFramebuffer(o.FRAMEBUFFER,this.fbo[a].fb),o.viewport(0,0,n,r),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),o.useProgram(this.pLayer);let c=this.uL;o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,s.tex),o.uniform1i(c.u_numClic,0),o.uniform1i(c.u_formaOn,0),o.uniform1i(c.u_tex,0),o.uniform2f(c.u_res,n,r),o.uniform2f(c.u_size,n,r),o.uniform4f(c.u_crop,0,0,0,0),o.uniform2f(c.u_off,0,0),o.uniform1f(c.u_scale,1),o.uniform1f(c.u_rot,0),o.uniform1i(c.u_src,0),o.uniform1i(c.u_orient,0),o.uniform1f(c.u_bright,0),o.uniform1f(c.u_contrast,1),o.uniform1f(c.u_sat,1),o.uniform1f(c.u_hue,0),o.uniform1i(c.u_look,0),o.uniform1i(c.u_key,0),o.uniform1i(c.u_mirror,0),o.uniform1f(c.u_temp,0),o.uniform1f(c.u_vignette,0),o.uniform1f(c.u_alpha,1),o.uniform1i(c.u_auto,0),o.uniform1f(c.u_round,0),o.uniform1f(c.u_feather,0),o.drawArrays(o.TRIANGLE_STRIP,0,4),o.disable(o.BLEND)}effetti(e,t,n,r){let i=this.gl;i.bindFramebuffer(i.FRAMEBUFFER,this.fbo[4].fb),i.viewport(0,0,n,r),i.disable(i.BLEND),i.useProgram(this.pFx);let a=this.uF;i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,this.fbo[2].tex),i.uniform1i(a.u_src,0),i.uniform2f(a.u_res,n,r),i.uniform2f(a.u_off,e.dx,e.dy),i.uniform1f(a.u_zoom,e.zoom),i.uniform1f(a.u_rot,e.rot),i.uniform1f(a.u_blur,e.blur),i.uniform1f(a.u_pixel,e.pixel),i.uniform1f(a.u_rgb,e.rgb),i.uniform1f(a.u_glitch,e.glitch),i.uniform1f(a.u_seme,e.seme%1e3),i.uniform1f(a.u_semeGrana,e.semeGrana),i.uniform1i(a.u_numCensure,e.censure.length);let o=new Float32Array(32),s=new Float32Array(8);e.censure.forEach((e,t)=>{o.set([e.x,1-e.y,e.w/2,e.h/2],t*4),s[t]=e.morbido}),i.uniform4fv(a.u_censure,o),i.uniform1fv(a.u_morbidoCensure,s),i.uniform1f(a.u_desat,e.desat),i.uniform1f(a.u_invert,e.invert),i.uniform1f(a.u_flash,e.flash),i.uniform1f(a.u_fade,e.fade),i.uniform1f(a.u_luce,e.luce),i.uniform1f(a.u_lucePh,e.lucePh),i.uniform1f(a.u_bande,e.bande),i.uniform1f(a.u_vhs,e.vhs),i.uniform1f(a.u_bagliore,e.bagliore),i.uniform1f(a.u_flare,e.flare),i.uniform1f(a.u_flarePh,e.flarePh),i.uniform1f(a.u_arco,e.arco),i.uniform1f(a.u_arcoPh,e.arcoPh),i.uniform1f(a.u_espo,e.espo),i.uniform1f(a.u_neon,e.neon),i.uniform1f(a.u_onda,e.onda),i.uniform1f(a.u_bolla,e.bolla),i.uniform1f(a.u_vortice,e.vortice),i.uniform1f(a.u_caleido,e.caleido),i.uniform1f(a.u_calore,e.calore),i.uniform1f(a.u_zblur,e.zblur),i.uniform1f(a.u_time,t%1e4/25),i.uniform3f(a.u_flashCol,...e.flashCol),i.uniform3f(a.u_fadeCol,...e.fadeCol),i.uniform3f(a.u_tinta,...e.tinta);for(let t of x)i.uniform1f(a[`u_`+t],e[t]);i.uniform2f(a.u_centro,e.cx??.5,1-(e.cy??.5)),i.uniform2f(a.u_sole,Number.isFinite(e.soleX)?e.soleX:-9,Number.isFinite(e.soleY)?e.soleY:0),i.drawArrays(i.TRIANGLE_STRIP,0,4)}fluido(e,t,n,r,i,a){let o=t.clip,s=c(e,o);if(!s||!o.media)return null;let u=this.successivo?this.successivo(t):l(o.id+`~`,o.media,i.timestamp+1.05/Math.max(1,s.fps||25),r,this.canvas.width*Math.min(1,o.tf.scale));if(!u||u instanceof ImageBitmap||u===i)return null;let d=u.timestamp-i.timestamp,f=1/Math.max(1,s.fps||25);if(d<f*.3||d>f*1.9)return null;let p=(t.t-i.timestamp)/d;if(p<.02||p>.98)return null;let m=this.upload(`v:`+o.id+`:`+n+`b`,u.toCanvasImageSource(),u.displayWidth,u.displayHeight,u);return this.interp??=new vt(this.gl),this.interp.mezzo(`f:`+o.id+`:`+n,a,m,i,p,i.displayWidth,i.displayHeight,o.fluido===2)}layer(e,t,i,s,d){let f=this.gl,p=t.clip,m=e.w,h=e.h,g=0,v=this.blank,y=m,b=h,x=0,S={dx:0,dy:0},C=!0;if(p.kind===`media`&&p.media){if(!c(e,p))return!1;let n=this.fornitore?this.fornitore(t):l(p.id,p.media,t.t,s,this.canvas.width*Math.min(1,p.tf.scale));if(!n)return!1;if(n instanceof ImageBitmap)v=this.upload(`img:`+p.media,n,n.width,n.height,n).tex,y=n.width,b=n.height;else{let r=n.toCanvasImageSource(),a=this.upload(`v:`+p.id+`:`+i,r,n.displayWidth,n.displayHeight,n);v=a.tex,p.fluido&&p.speed<.98&&(v=this.fluido(e,t,i,s,n,a)??v),x=n.rotation,y=x%180?n.displayHeight:n.displayWidth,b=x%180?n.displayWidth:n.displayHeight,n.squarePixelWidth&&n.squarePixelHeight&&!(x%180)&&(y=n.squarePixelWidth,b=n.squarePixelHeight)}}else if(p.kind===`bars`)g=p.gen?.bars===`ebu`?2:1;else if(p.kind===`color`)g=3;else if(p.kind===`countdown`){let n=_e(m,h,t.local,p.len*e.rate.den/e.rate.num,p.gen?.conto??`pellicola`);v=this.upload(`cd:`+p.id+`:`+i,n,n.width,n.height,d+`:`+t.lf).tex,y=m,b=h}else if(p.kind===`title`&&p.gen?.html){let n=p.len*e.rate.den/e.rate.num,{rw:r,rh:a}=Ce(m,h,this.canvas.width),o=we(p.gen.html,r,a,t.local,n,s?6:2,e.rate.den/e.rate.num);if(!o)return!1;v=this.upload(`ht:`+p.id+`:`+i,o,r,a,o).tex,y=m,b=h,C=!1}else if(p.kind===`title`&&p.gen?.anim){let n=Ar(p.gen.anim,m,h,t.local,p.len*e.rate.den/e.rate.num);v=this.upload(`an:`+p.id+`:`+i,n,m,h,d+`:`+t.lf+`:`+kr(p.gen.anim)).tex,y=m,b=h,C=!1}else if(p.kind===`title`){let r=ve(p.gen?.title??n,t.local),i=ye(r,m,h);v=this.upload(`img:t:`+p.id,i.tela,i.w,i.h,i.tela).tex,y=i.w,b=i.h,C=!1,S=ge(r,i.w,i.h,m,h,t.local,p.len*e.rate.den/e.rate.num)}else return!1;let w=y,T=b;if(C){let e=Math.min(m/y,h/b);w=y*e,T=b*e}let E=o(p,t.lf),D=p.fx,O=r(e,p,p.start+t.lf),k=E.sx??1,A=Yt(D);f.bindFramebuffer(f.FRAMEBUFFER,this.fbo[i].fb),f.viewport(0,0,this.fbW,this.fbH),f.clearColor(0,0,0,0),f.clear(f.COLOR_BUFFER_BIT),f.disable(f.BLEND),f.useProgram(this.pLayer);let j=this.uL;f.uniform1i(j.u_numClic,0),f.uniform1i(j.u_formaOn,0),f.activeTexture(f.TEXTURE0),f.bindTexture(f.TEXTURE_2D,v),f.uniform1i(j.u_tex,0),f.uniform2f(j.u_res,m,h),f.uniform2f(j.u_size,w*k,T);let M=A.zoom?1+A.zoom*Math.min(1,t.lf/Math.max(1,p.len)):1,N=E.scale*M*(S.scala??1);f.uniform1f(j.u_scale,N),f.uniform1f(j.u_rot,E.rot*Math.PI/180),f.uniform1i(j.u_orient,x);let ee=w*k*N,te=T*N,P=Math.max(0,Math.min(1,E.angoli??0))*.5*Math.min(ee*(1-E.cropL-E.cropR),te*(1-E.cropT-E.cropB));if(f.uniform2f(j.u_boxPx,ee,te),f.uniform4f(j.u_box,E.cropL,E.cropT,E.cropR,E.cropB),f.uniform1i(j.u_grad,0),(E.ombra??0)>0){this.coloreGpu.imposta(e,Mt(),j,!1);let t=Math.max(4,(E.ombra??0)*Math.min(m,h)*.045),n=t*2/Math.max(1,ee),r=t*2/Math.max(1,te);f.uniform4f(j.u_crop,E.cropL-n,E.cropT-r,E.cropR-n,E.cropB-r),f.uniform2f(j.u_off,E.x+S.dx+O.dx,E.y+S.dy+O.dy+t*.45),f.uniform1i(j.u_src,3),f.uniform3f(j.u_color,0,0,0),f.uniform1f(j.u_bright,0),f.uniform1f(j.u_contrast,1),f.uniform1f(j.u_sat,1),f.uniform1f(j.u_hue,0),f.uniform1i(j.u_look,0),f.uniform1i(j.u_key,0),f.uniform1i(j.u_mirror,0),f.uniform1f(j.u_temp,0),f.uniform1f(j.u_vignette,0),f.uniform1i(j.u_auto,0),f.uniform1f(j.u_alpha,(S.alfa??1)*Math.min(.7,.3+(E.ombra??0)*.45)),f.uniform1f(j.u_round,P+t*.5),f.uniform1f(j.u_feather,t),f.drawArrays(f.TRIANGLE_STRIP,0,4),f.enable(f.BLEND),f.blendFunc(f.ONE,f.ONE_MINUS_SRC_ALPHA)}f.uniform4f(j.u_crop,E.cropL,E.cropT,E.cropR,E.cropB),f.uniform2f(j.u_off,E.x+S.dx+O.dx,E.y+S.dy+O.dy),f.uniform1f(j.u_alpha,S.alfa??1),f.uniform1f(j.u_round,P),f.uniform1f(j.u_feather,P>0?Math.max(.6,m/Math.max(1,this.fbW)):0),f.uniform1i(j.u_src,g),this.passataForma(p,y/b,j);let ie=Nr(e,p,t.t,t.lf);f.uniform1i(j.u_numClic,ie.n),ie.n&&(f.uniform4fv(j.u_clic,ie.punti),f.uniform3fv(j.u_clicColore,ie.colore),f.uniform1f(j.u_clicRapporto,y/b));let ae=Ur(p.gen?.color??`#000000`);if(f.uniform3f(j.u_color,ae[0],ae[1],ae[2]),g===3&&p.gen?.color2){let e=Ur(p.gen.color2);f.uniform1i(j.u_grad,1),f.uniform3f(j.u_color2,e[0],e[1],e[2])}this.coloreGpu.imposta(e,Mt(D.colore),j,!!D.colore),f.uniform1f(j.u_bright,A.bright),f.uniform1f(j.u_contrast,A.contrast),f.uniform1f(j.u_sat,A.sat),f.uniform1f(j.u_hue,A.hue),f.uniform1i(j.u_look,A.looks),f.uniform1f(j.u_time,d%1e4/25),f.uniform2f(j.u_texel,1/Math.max(1,w),1/Math.max(1,T));let oe=p.ritaglio,F=oe&&p.media?re(oe.firma,t.t):null,I=ne(D);f.uniform1i(j.u_key,F?3:D.key===`luma`?1:D.key===`chroma`?2:0);let se=Ur(I[0]);f.uniform3f(j.u_keyColor,se[0],se[1],se[2]);let L=new Float32Array(6);for(let e=1;e<I.length;e++)L.set(Ur(I[e]),(e-1)*3);f.uniform3fv(j.u_keyExtra,L),f.uniform1i(j.u_keyN,Math.max(0,I.length-1)),f.uniform1i(j.u_vista,this.vistaChiave),f.uniform1i(j.u_matte,2),f.uniform1i(j.u_matte2,3),f.activeTexture(f.TEXTURE2),f.bindTexture(f.TEXTURE_2D,F?this.matte(`mk:${oe.firma}:${F.i}`,F.w,F.h,F.a):this.blank),f.activeTexture(f.TEXTURE3),f.bindTexture(f.TEXTURE_2D,F?this.matte(`mk:${oe.firma}:${F.i+(F.b===F.a?0:1)}`,F.w,F.h,F.b):this.blank),f.activeTexture(f.TEXTURE0),f.uniform1f(j.u_matteK,F?.k??0),F&&oe?(f.uniform1f(j.u_keyLevel,0),f.uniform1f(j.u_keySoft,oe.morbido),f.uniform1f(j.u_keyBordo,oe.bordo),f.uniform1i(j.u_keyInv,+!!oe.inverti),f.uniform1f(j.u_keySpill,0),f.uniform1f(j.u_keySfuma,0),f.uniform1f(j.u_keyPulisci,0)):(f.uniform1f(j.u_keyLevel,D.keyLevel),f.uniform1f(j.u_keySoft,D.keySoft),f.uniform1i(j.u_keyInv,+!!D.keyInvert),f.uniform1f(j.u_keySpill,D.keySpill??.5),f.uniform1f(j.u_keyBordo,D.keyBordo??0),f.uniform1f(j.u_keySfuma,D.keySfuma??0),f.uniform1f(j.u_keyPulisci,D.keyPulisci??0)),f.uniform1i(j.u_mirror,+!!A.mirror),f.uniform1f(j.u_temp,A.temp),f.uniform1f(j.u_vignette,A.vignette);let ce=p.media&&u(e,p)?_(p.media)?.colore:void 0;return f.uniform1i(j.u_auto,+!!ce),ce&&(f.uniform3f(j.u_autoLo,...ce.lo),f.uniform3f(j.u_autoHi,...ce.hi),f.uniform3f(j.u_autoWb,...ce.wb),f.uniform1f(j.u_autoGamma,ce.gamma),f.uniform1f(j.u_autoK,a(e).autoK)),f.drawArrays(f.TRIANGLE_STRIP,0,4),f.disable(f.BLEND),!0}passataForma(e,t,n){let r=this.gl,i=ze(e.maschere,t);if(r.uniform1i(n.u_forma,6),r.activeTexture(r.TEXTURE6),!i){r.bindTexture(r.TEXTURE_2D,this.blank),r.uniform1i(n.u_formaOn,0),r.activeTexture(r.TEXTURE0);return}let a=this.forme.get(i);if(a)this.forme.delete(i),this.forme.set(i,a);else{let o=Re(e.maschere,t);if(!o){r.bindTexture(r.TEXTURE_2D,this.blank),r.uniform1i(n.u_formaOn,0),r.activeTexture(r.TEXTURE0);return}a=o,this.forme.set(i,a),this.forme.size>24&&this.forme.delete(this.forme.keys().next().value)}r.bindTexture(r.TEXTURE_2D,this.matte(`fm:`+i,a.w,a.h,a.dati)),r.uniform1i(n.u_formaOn,1),r.activeTexture(r.TEXTURE0)}forme=new Map;combine(e,t,n,r,i=1,a=2,o=0){let s=this.gl;s.bindFramebuffer(s.FRAMEBUFFER,this.fbo[a].fb),s.viewport(0,0,this.canvas.width,this.canvas.height),a===2?(s.enable(s.BLEND),s.blendFunc(s.ONE,s.ONE_MINUS_SRC_ALPHA)):(s.disable(s.BLEND),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT)),s.useProgram(this.pComb);let c=this.uC;s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,this.fbo[o].tex),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,this.fbo[i].tex),Vr(s,c,e,t,n,r,this.canvas.width/this.canvas.height),s.drawArrays(s.TRIANGLE_STRIP,0,4),s.activeTexture(s.TEXTURE0)}leggiPiccolo(e,t,n){let r=this.gl;if(r.bindFramebuffer(r.READ_FRAMEBUFFER,null),!this.small||this.smallW!==e||this.smallH!==t){this.small&&(r.deleteFramebuffer(this.small.fb),r.deleteRenderbuffer(this.small.rb));let n=r.createRenderbuffer();r.bindRenderbuffer(r.RENDERBUFFER,n),r.renderbufferStorage(r.RENDERBUFFER,r.RGBA8,e,t);let i=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,i),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,n),this.small={fb:i,rb:n},this.smallW=e,this.smallH=t}if(!this.fbo.length){n.fill(0);return}r.bindFramebuffer(r.READ_FRAMEBUFFER,this.fbo[this.uscita].fb),r.bindFramebuffer(r.DRAW_FRAMEBUFFER,this.small.fb),r.blitFramebuffer(0,0,this.fbW,this.fbH,0,0,e,t,r.COLOR_BUFFER_BIT,r.LINEAR),r.bindFramebuffer(r.READ_FRAMEBUFFER,this.small.fb),r.readPixels(0,0,e,t,r.RGBA,r.UNSIGNED_BYTE,n),r.bindFramebuffer(r.FRAMEBUFFER,null)}small=null;smallW=0;smallH=0;dimentica(e){for(let[t,n]of this.texs)t.startsWith(e)&&(this.gl.deleteTexture(n.tex),this.texs.delete(t))}distruggi(){let e=this.gl;for(let t of this.texs.values())e.deleteTexture(t.tex);this.texs.clear(),this.coloreGpu.distruggi();for(let t of this.fbo)e.deleteFramebuffer(t.fb),e.deleteTexture(t.tex);this.fbo=[],this.interp?.distruggi(),e.getExtension(`WEBGL_lose_context`)?.loseContext()}},Gr={bassa:new A(`low`),media:new A(`medium`),alta:new A(`high`),altissima:new A(`very-high`)},Kr=null;async function qr(e,t,n,r){if(e===`wav`)return{v:null,a:`pcm-s16`};let i=e===`webm`?[`vp9`,`av1`,`vp8`]:e===`mov`?[`avc`,`hevc`]:[`avc`,`hevc`,`vp9`,`av1`];r&&i.includes(r)&&i.unshift(r);let a=e===`webm`?[`opus`,`vorbis`]:[`aac`,`opus`,`mp3`],o=await O(i,{width:t,height:n}),s=await k(a,{numberOfChannels:2,sampleRate:48e3});if(e!==`webm`&&s!==`aac`)try{Kr||=j(()=>import(`./mediabunny-aac-encoder-BPs-IYx1.js`).then(e=>{e.registerAacEncoder()}),__vite__mapDeps([0,1,2,3,4]),import.meta.url),await Kr,s=await k([`aac`],{numberOfChannels:2,sampleRate:48e3})??s}catch{}return{v:o,a:s}}async function Jr(e,t,n){if(te){let r=await ee(e,n,t);if(!r)return null;let i=await P(`export_apri`,{path:r}),a=new WritableStream({write:async e=>{await P(`export_scrivi`,e.data,{headers:{"x-id":String(i),"x-pos":String(e.position)}})}});return{target:new S(a,{chunked:!0,chunkSize:4194304}),chiudi:async()=>(await P(`export_chiudi`,{id:i}),N(r)),annulla:async()=>{await P(`export_chiudi`,{id:i}).catch(()=>{})},percorso:r}}let r=window;if(r.showSaveFilePicker)try{let i=await r.showSaveFilePicker({suggestedName:e,types:[{description:n.toUpperCase(),accept:{[t]:[`.`+n]}}]}),a=await i.createWritable(),o=new WritableStream({write:e=>a.write({type:`write`,position:e.position,data:e.data})});return{target:new S(o,{chunked:!0,chunkSize:4194304}),chiudi:async()=>(await a.close(),i.name),annulla:async()=>{await a.abort().catch(()=>{})}}}catch(e){if(e.name===`AbortError`)return null}let i=new g;return{target:i,chiudi:async()=>(M(new Blob([i.buffer],{type:t}),e),e),annulla:async()=>{}}}async function Yr(e,t,n){if(te){let t=await P(`registrazione_percorso`,{name:e}),r=await P(`export_apri`,{path:t}),i=new WritableStream({write:async e=>{await P(`export_scrivi`,e.data,{headers:{"x-id":String(r),"x-pos":String(e.position)}})}});return{target:new S(i,{chunked:!0,chunkSize:4194304}),chiudi:async()=>(await P(`export_chiudi`,{id:r}),n({name:N(t),path:t}),N(t)),annulla:async()=>{await P(`export_chiudi`,{id:r}).catch(()=>{})}}}let r=new g;return{target:r,chiudi:async()=>(n({name:e,file:new File([r.buffer],e,{type:t,lastModified:Date.now()})}),e),annulla:async()=>{}}}async function Xr(e,t){if(te){let t=await P(`registrazione_percorso`,{name:e}),n=await P(`export_apri`,{path:t}),r=new WritableStream({write:async e=>{await P(`export_scrivi`,e.data,{headers:{"x-id":String(n),"x-pos":String(e.position)}})}});return{target:new S(r,{chunked:!0,chunkSize:4194304}),chiudi:async()=>(await P(`export_chiudi`,{id:n}),N(t)),annulla:async()=>{await P(`export_chiudi`,{id:n}).catch(()=>{})},percorso:t}}let n=new g;return{target:n,chiudi:async()=>(M(new Blob([n.buffer],{type:t}),e),e),annulla:async()=>{}}}var Zr=class{l=new Map;sinks=new Map;vecchi=[];async prendi(e,t,n){let r=e.media?_(e.media):void 0;if(!r)return null;if(r.image)return r.image;if(!r.v||!r.vDecodable)return null;let i=this.l.get(e.id);if(!i||i.cur&&t<i.cur.timestamp-1e-4){i&&this.chiudi(e.id);let a=this.sinks.get(e.media);a||(a=new T(r.v),this.sinks.set(e.media,a)),i={it:a.samples(t),cur:null,next:null,fine:!1,usato:n},this.l.set(e.id,i)}for(i.usato=n;!i.fine;){if(!i.next){let e=await i.it.next();if(e.done){i.fine=!0;break}i.next=e.value}if(i.next.timestamp<=t+1e-4)i.cur&&this.vecchi.push(i.cur),i.cur=i.next,i.next=null;else break}return i.cur??i.next}dopo(e){return this.l.get(e.id)?.next??null}pulisci(e){for(let e of this.vecchi)e.close();this.vecchi.length=0;for(let[t,n]of this.l)e-n.usato>2&&this.chiudi(t)}chiudi(e){let t=this.l.get(e);t&&(t.cur&&this.vecchi.push(t.cur),t.next&&this.vecchi.push(t.next),t.it.return(void 0).catch(()=>{}),this.l.delete(e))}tutto(){for(let e of[...this.l.keys()])this.chiudi(e);for(let e of this.vecchi)e.close();this.vecchi.length=0}};async function Qr(e,n,r,a){let o=structuredClone(e);await ut();let c=D(o.rate),l=n.soloInOut&&o.inF!==null?o.inF:0,u=n.soloInOut&&o.outF!==null?o.outF:i(o);if(u<=l)throw Error(`Il montaggio è vuoto`);let f=Math.round(n.w/2)*2,p=Math.round(n.h/2)*2,{v:_,a:x}=await qr(n.formato,f,p,n.codec);if(n.formato!==`wav`&&!_)throw Error(`Questo sistema non sa codificare video in ${n.formato.toUpperCase()}. Prova WebM o MP4.`);let S=n.formato===`webm`?`video/webm`:n.formato===`mov`?`video/quicktime`:n.formato===`wav`?`audio/wav`:`video/mp4`,C=n.interna?await Yr(n.nome,S,n.interna.file):n.automatica?await Xr(n.nome,S):await Jr(n.nome,S,n.formato);if(!C)return null;let T=n.formato===`webm`?new v:n.formato===`mov`?new h:n.formato===`wav`?new t:new d({fastStart:C.target instanceof g&&`in-memory`}),O=new m({format:T,target:C.target}),k=null,A=null,j=null,M=n.geometria??null,N=null,ee=null,te=Math.max(1,Math.round(n.passo??1));n.formato!==`wav`&&_&&(k=new OffscreenCanvas(M?M.cw:f,M?M.ch:p),A=new Wr(k,!0),M&&(N=new OffscreenCanvas(f,p),ee=N.getContext(`2d`)),j=new b(N??k,{codec:_,bitrate:n.bitrate??Gr[n.qualita],keyFrameInterval:2,latencyMode:`quality`}),O.addVideoTrack(j,{frameRate:c/te}));let P=null;x&&(P=new w({codec:x,bitrate:n.formato===`wav`?void 0:n.audioBps||Gr[n.qualita]}),O.addAudioTrack(P)),O.setMetadataTags({title:o.name,comment:`Montato con DaProd Editor Video`});let ne=new Zr,re=performance.now();try{await O.start();let e=E(l,o.rate),t=E(u,o.rate),i=P?s(o,e,t):null,d=n.guadagnoDb?10**(n.guadagnoDb/20):1,f=e,p=async()=>{if(!i||!P)return!1;let e=await i.next();if(e.done)return f=1/0,!1;if(d!==1)for(let t=0;t<e.value.numberOfChannels;t++){let n=e.value.getChannelData(t);for(let e=0;e<n.length;e++)n[e]*=d}return await P.add(e.value),f+=e.value.duration,!0},m=u-l;if(A&&j){let e={...o,w:o.w,h:o.h};for(let t=l;t<u;t+=te){if(a())throw Error(`annullato`);let n=Math.floor((t-l)/te),s=E(t,o.rate);for(;i&&f<s+2&&f!==1/0;)await p();let d=y(e,t),h=new Map;for(let e of d)for(let t of[e.b,e.a])t&&t.clip.kind===`media`&&h.set(t,await ne.prendi(t.clip,t.t,n));await Se(e,d,k.width),A.render(e,d,!1,t,e=>h.get(e)??null,e=>ne.dopo(e.clip)),ee&&N&&M&&(ee.fillStyle=`#000`,ee.fillRect(0,0,N.width,N.height),ee.drawImage(k,M.dx,M.dy,M.cw,M.ch)),await j.add((t-l)/c,Math.min(te,u-t)/c),ne.pulisci(n),(t-l)%5==0&&r({fatti:t-l,totale:m,fase:`video`,fpsResa:(t-l)/((performance.now()-re)/1e3)})}}for(;i&&await p();){if(a())throw Error(`annullato`);r({fatti:Math.min(m,(f-e)*c),totale:m,fase:`audio`,fpsResa:0})}r({fatti:m,totale:m,fase:`chiusura`,fpsResa:0}),await O.finalize(),ne.tutto(),A?.distruggi();let h=await C.chiudi();return C.percorso&&n.alPercorso?.(C.percorso),h}catch(e){if(ne.tutto(),A?.distruggi(),await O.cancel().catch(()=>{}),await C.annulla(),e.message===`annullato`)return null;throw e}}var $r=null;async function ei(e,t){if($r?.comp.perso&&($r=null),!$r){let t=new OffscreenCanvas(e.w,e.h);$r={canvas:t,comp:new Wr(t,!0)}}let{canvas:n,comp:r}=$r;(n.width!==e.w||n.height!==e.h)&&(n.width=e.w,n.height=e.h);let i=new Zr;try{let a=y(e,t),o=new Map;for(let e of a)for(let t of[e.b,e.a])t&&t.clip.kind===`media`&&o.set(t,await i.prendi(t.clip,t.t,0));return await Se(e,a,n.width),r.render(e,a,!1,t,e=>o.get(e)??null,e=>i.dopo(e.clip)),await n.convertToBlob({type:`image/png`})}finally{i.tutto()}}export{Me as A,nt as C,We as D,rt as E,Ae as F,je as M,Ee as N,Ve as O,Te as P,ut as S,ot as T,yt as _,zr as a,wt as b,Hr as c,Ar as d,Kt as f,Dt as g,Lt as h,Wr as i,Be as j,at as k,Vr as l,Rt as m,Qr as n,Br as o,zt as p,ei as r,Ir as s,Zr as t,Tr as u,St as v,it as w,dt as x,Ct as y};
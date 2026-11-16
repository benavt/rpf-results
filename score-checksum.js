/* SHA-256 for public HTTPS and private HTTP previews. */
(() => {
  'use strict';
function sha256(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),K=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
 const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;const dv=new DataView(padded.buffer);dv.setUint32(padded.length-8,Math.floor(bytes.length/536870912));dv.setUint32(padded.length-4,(bytes.length*8)>>>0);
 const h=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],w=new Uint32Array(64),rr=(v,n)=>(v>>>n)|(v<<(32-n));
 for(let o=0;o<padded.length;o+=64){for(let j=0;j<16;j++)w[j]=dv.getUint32(o+4*j);for(let j=16;j<64;j++){const a=w[j-15],b=w[j-2];w[j]=(w[j-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[j-7]+(rr(b,17)^rr(b,19)^(b>>>10)))>>>0}let[a,b,c,d,e,f,g,z]=h;for(let j=0;j<64;j++){const t1=(z+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[j]+w[j])>>>0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}for(const[j,v]of[a,b,c,d,e,f,g,z].entries())h[j]=(h[j]+v)>>>0}
 return h.map(v=>v.toString(16).padStart(8,'0')).join('');
}
  window.RpfChecksum = async bytes => globalThis.crypto?.subtle
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
    : sha256(bytes);
})();

export const palette={black:'#292824',white:'#eeeae1',grey:'#92938e',beige:'#c5b08c',brown:'#76533b',red:'#b74c49',orange:'#ce874a',yellow:'#d5bf59',green:'#6d8a62',blue:'#577d9d',purple:'#8c6b9c',pink:'#d491a8'};
export function hsv(hex){const [r,g,b]=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d)h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;return {h:h*60,s:max?d/max:0,v:max};}
export function colourName(hex){const c=hsv(hex);if(c.v<.22)return 'black';if(c.s<.13)return c.v>.82?'white':'grey';if(c.h>20&&c.h<55&&c.s<.45&&c.v>.55)return 'beige';if(c.h>12&&c.h<52&&c.v<.55)return 'brown';if(c.h<18||c.h>=345)return 'red';if(c.h<45)return 'orange';if(c.h<68)return 'yellow';if(c.h<165)return 'green';if(c.h<265)return 'blue';if(c.h<300)return 'purple';return 'pink';}
export function neutral(hex){return ['black','white','grey','beige','brown'].includes(colourName(hex));}
// Styling heuristics: harmony is subjective, so offer three different directions.
export function pairScore(a,b,style='balanced') {
 const x=hsv(a),y=hsv(b),gap=Math.min(Math.abs(x.h-y.h),360-Math.abs(x.h-y.h));
 const nx=neutral(a),ny=neutral(b);
 if(nx&&ny)return .9;
 if(nx||ny){
   const n=nx?x:y,c=nx?y:x;
   // Dark neutrals and navy, plus earth tones and green, are useful anchors.
   const earth=['beige','brown'].includes(colourName(nx?a:b));
   return earth&&c.s>.65&&c.h>270&&c.h<330?.7:.9;
 }
 const muted=Math.max(x.s,y.s)<.45;
 if(gap<35)return .92;
 if(gap<65)return muted?.87:.78;
 if(style==='similar')return Math.max(.25,.8-gap/300);
 if(style==='bold')return gap>140?.94:gap>95?.8:.6;
 // Restrained complementary colours work; two vivid competing colours rank lower.
 if(gap>140)return muted?.84:.66;
 return muted?.76:.42;
}
export function outfitScore(items,style='balanced') {
 if(!items.length)return 0;
 let sum=0,total=0;
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
   const weight=items[i].category==='shoes'||items[j].category==='shoes'?.75:1;
   sum+=pairScore(items[i].colour,items[j].colour,style)*weight;total+=weight;
 }
 let score=total?sum/total:.9;
 const colourful=items.filter(item=>!neutral(item.colour));
 const vivid=colourful.filter(item=>{const c=hsv(item.colour);return c.s>.55&&c.v>.5;});
 const families=[];
 for(const item of colourful){const h=hsv(item.colour).h;if(!families.some(f=>Math.min(Math.abs(f-h),360-Math.abs(f-h))<45))families.push(h);}
 if(style==='balanced'){score-=Math.max(0,vivid.length-1)*.09;score-=Math.max(0,families.length-2)*.13;}
 if(style==='similar')score-=Math.max(0,families.length-1)*.08;
 if(style==='bold')score-=Math.max(0,families.length-2)*.1;
 return score;
}
export function explainColourMatch(items,style) {
 const names=[...new Set(items.map(item=>colourName(item.colour)))];
 const accents=names.filter(name=>!['black','white','grey','beige','brown'].includes(name));
 if(!accents.length)return 'A coordinated neutral palette: '+names.join(', ')+'.';
 if(style==='similar')return 'Related shades with neutral pieces to keep the whole outfit coordinated.';
 if(style==='bold')return 'Colour contrast balanced across the shirt, pants and shoes.';
 return accents.length===1?'A '+accents[0]+' accent with neutral colours to balance the outfit.':'Coordinated colours with restrained accents across the whole outfit.';
}
export function pickMatchedOutfit(groups,style,previous={},random=Math.random){let beam=[[]];for(const category of ['shirt','pants','shoes']){const choices=groups[category];if(!choices?.length)throw new Error('Add at least one shirt, pants and shoes to match a whole outfit.');beam=beam.flatMap(items=>choices.map(item=>[...items,item])).sort((a,b)=>outfitScore(b,style)-outfitScore(a,style)).slice(0,80);}const variants=beam.flatMap(items=>[items,...(groups.jacket||[]).filter(jacket=>items.every(item=>pairScore(item.colour,jacket.colour,style)>=.65)).map(jacket=>[...items,jacket])]);variants.sort((a,b)=>outfitScore(b,style)-outfitScore(a,style));const best=outfitScore(variants[0],style);const top=variants.filter(items=>outfitScore(items,style)>=best-.04).slice(0,24);const alternatives=top.filter(items=>items.some(item=>previous[item.category]!==item.id)||(!items.some(item=>item.category==='jacket')&&previous.jacket!=='no-jacket'));const choices=alternatives.length?alternatives:top;const pick=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];return Object.fromEntries([['jacket','no-jacket'],...pick.map(item=>[item.category,item.id])]);}
export function outfitMood(items){const colours=items.map(item=>hsv(item.colour));if(!colours.length)return 'chill';const average=key=>colours.reduce((sum,c)=>sum+c[key],0)/colours.length;if(average('v')<.4)return 'moody';if(average('s')>.45)return 'energetic';const colourful=items.filter(item=>!neutral(item.colour));if(colourful.length>1&&pairScore(colourful[0].colour,colourful[1].colour,'bold')>.75)return 'confident';return 'chill';}
export function safeMusicLink(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}

export const musicMoods=["chill","energetic","confident","moody","happy","focused","romantic","nostalgic","dreamy"];

export function songColourScore(hex,mood){const {h,s,v}=hsv(hex);const warm=h<70||h>330;switch(mood){case 'moody':return 1-v;case 'energetic':return s*.7+v*.3;case 'confident':return s*.6+(1-v)*.4;case 'happy':return v*.6+(warm?s:0)*.4;case 'focused':return (1-s)*.7+(1-Math.abs(v-.55))*.3;case 'romantic':return (h>280||h<20?.6:0)+v*.2+(1-s)*.2;case 'nostalgic':return (h>15&&h<70?.5:0)+(1-s)*.3+(1-Math.abs(v-.6))*.2;case 'dreamy':return v*.5+(1-s)*.3+(h>190&&h<330?.2:0);default:return (1-s)*.6+v*.4;}}
export function pickSongOutfit(groups,mood,previous={},random=Math.random){if(!musicMoods.includes(mood))throw new Error('Choose a music mood first.');const style=['energetic','confident','happy'].includes(mood)?'bold':['dreamy','romantic','chill'].includes(mood)?'similar':'balanced';const score=items=>items.reduce((sum,item)=>sum+songColourScore(item.colour,mood),0)/items.length*.7+outfitScore(items,style)*.3;let beam=[[]];for(const category of ['shirt','pants','shoes']){if(!groups[category]?.length)throw new Error('Add at least one shirt, pants and shoes to dress for a song.');beam=beam.flatMap(items=>groups[category].map(item=>[...items,item])).sort((a,b)=>score(b)-score(a)).slice(0,80);}const variants=beam.flatMap(items=>[items,...(groups.jacket||[]).filter(jacket=>items.every(item=>pairScore(item.colour,jacket.colour,style)>=.65)).map(jacket=>[...items,jacket])]).sort((a,b)=>score(b)-score(a));const best=score(variants[0]);const top=variants.filter(items=>score(items)>=best-.04).slice(0,12);const alternatives=top.filter(items=>items.some(item=>previous[item.category]!==item.id)||(!items.some(item=>item.category==='jacket')&&previous.jacket!=='no-jacket'));const choices=alternatives.length?alternatives:top;return Object.fromEntries([['jacket','no-jacket'],...choices[Math.floor(random()*choices.length)].map(item=>[item.category,item.id])]);}

export function pickSurpriseOutfit(groups,previous={},random=Math.random) {
 // Sample across the wardrobe first, then keep coherent palettes for variety.
 const candidates=[];
 for(const category of ['shirt','pants','shoes'])if(!groups[category]?.length)throw new Error('Add at least one shirt, pants and shoes to surprise you with a whole outfit.');
 const choose=items=>items[Math.min(items.length-1,Math.floor(random()*items.length))];
 for(let i=0;i<600;i++){
   const items=['shirt','pants','shoes'].map(category=>choose(groups[category]));
   const jackets=(groups.jacket||[]).filter(jacket=>items.every(item=>pairScore(item.colour,jacket.colour,'balanced')>=.75));
   if(jackets.length&&random()<.4)items.push(choose(jackets));
   const outfit=Object.fromEntries([['jacket','no-jacket'],...items.map(item=>[item.category,item.id])]);
   if(!candidates.some(candidate=>['shirt','pants','shoes','jacket'].every(key=>candidate.outfit[key]===outfit[key])))candidates.push({outfit,score:outfitScore(items,'balanced')});
 }
 const best=Math.max(...candidates.map(candidate=>candidate.score));
 const compatible=candidates.filter(candidate=>candidate.score>=Math.max(.72,best-.12));
 const pool=compatible.length?compatible:candidates.filter(candidate=>candidate.score>=best-.04);
 const alternatives=pool.filter(candidate=>['shirt','pants','shoes','jacket'].some(key=>candidate.outfit[key]!==previous[key]));
 return choose(alternatives.length?alternatives:pool).outfit;
}

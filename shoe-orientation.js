// A side-view outsole normally has the flatter of the two silhouette edges.
export function soleIsOnTop(pixels,width,height){
  const top=[],bottom=[];
  for(let x=Math.ceil(width*.12);x<width*.88;x++){
    let first=-1,last=-1;
    for(let y=0;y<height;y++)if(pixels[(y*width+x)*4+3]>120){if(first<0)first=y;last=y;}
    if(first>=0&&last-first>height*.1){top.push(first);bottom.push(last);}
  }
  if(top.length<width*.3)return false;
  const variance=values=>{const mean=values.reduce((a,b)=>a+b,0)/values.length;return values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length;};
  return variance(top)+.5<(variance(bottom)+.5)*.65;
}

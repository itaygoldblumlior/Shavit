// Locate separate foreground shoes in an already background-removed image.
export function shoeRegions(pixels, width, height, forcePair = false, aspect = 1) {
  const seen=new Uint8Array(width*height),components=[];
  for(let index=0;index<seen.length;index++){
    if(seen[index]||pixels[index*4+3]<=100)continue;
    const queue=[index];seen[index]=1;let left=width,top=height,right=0,bottom=0;
    for(let cursor=0;cursor<queue.length;cursor++){
      const point=queue[cursor],x=point%width,y=Math.floor(point/width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const next of [x>0?point-1:-1,x<width-1?point+1:-1,y>0?point-width:-1,y<height-1?point+width:-1]){
        if(next>=0&&!seen[next]&&pixels[next*4+3]>100){seen[next]=1;queue.push(next);}
      }
    }
    components.push({x:left,y:top,width:right-left+1,height:bottom-top+1,area:queue.length});
  }
  components.sort((a,b)=>b.area-a.area);
  const substantial=components.filter(component=>component.area/(component.width*component.height)>.28&&Math.min(component.width,component.height)/Math.max(component.width,component.height)>.16);
  const first=substantial[0]||components[0];
  if(!first)return null;
  const second=substantial.find(component=>component!==first&&component.area>=first.area*.35);
  if(second){
    const dx=Math.abs(first.x+first.width/2-second.x-second.width/2);
    const dy=Math.abs(first.y+first.height/2-second.y-second.height/2);
    if(dx>Math.min(first.width,second.width)*.4||dy>Math.min(first.height,second.height)*.4)return [first,second].sort((a,b)=>a.x-b.x||a.y-b.y);
  }
  if(!forcePair)return null;
  // Ignore detached strings before splitting a connected pair. Compare both axes
  // so two stacked shoes are not cut into left and right halves.
  const bounds=first;
  const cuts=[];
  for(const horizontal of [true,false]){
    const dimension=horizontal?bounds.width:bounds.height;
    const counts=[];
    for(let axis=0;axis<dimension;axis++){
      let count=0;
      for(let cross=0;cross<(horizontal?bounds.height:bounds.width);cross++){
        const x=bounds.x+(horizontal?axis:cross),y=bounds.y+(horizontal?cross:axis);
        if(pixels[(y*width+x)*4+3]>100)count++;
      }
      counts.push(count);
    }
    const total=counts.reduce((a,b)=>a+b,0),average=total/dimension;
    let before=0;
    for(let axis=0;axis<dimension;axis++){
      before+=counts[axis];
      if(axis<dimension*.3||axis>dimension*.7||before<total*.25||before>total*.75)continue;
      cuts.push({horizontal,split:axis,score:counts[axis]/Math.max(1,average)+Math.abs(before/total-.5)*.1});
    }
  }
  cuts.sort((a,b)=>a.score-b.score);
  const best=cuts[0]||{horizontal:aspect>=.9,split:Math.floor((aspect>=.9?bounds.width:bounds.height)/2)};
  const {horizontal,split}=best;
  const halves=horizontal?[{x:bounds.x,y:bounds.y,width:split,height:bounds.height},{x:bounds.x+split,y:bounds.y,width:bounds.width-split,height:bounds.height}]:[{x:bounds.x,y:bounds.y,width:bounds.width,height:split},{x:bounds.x,y:bounds.y+split,width:bounds.width,height:bounds.height-split}];
  return halves.map(region=>{
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=region.y;y<region.y+region.height;y++)for(let x=region.x;x<region.x+region.width;x++)if(pixels[(y*width+x)*4+3]>100){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    return right>=left?{x:left,y:top,width:right-left+1,height:bottom-top+1}:region;
  });
}

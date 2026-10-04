// Separate flat-lay slots preserve each piece's original proportions.
export const garmentLayout = {
  shirt: {x:50,y:150,width:240,height:180},
  pants: {x:60,y:365,width:220,height:185},
  shoes: {x:105,y:590,width:55,height:80},
  jacket: {x:66,y:150,width:208,height:180}
};
export function fitGarment(category, anchor) {
  const box={...garmentLayout[category]};
  if(!anchor?.aspect)return box;
  const width=Math.min(box.width,box.height*anchor.aspect);
  const height=width/anchor.aspect;
  return {...box,x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height};
}

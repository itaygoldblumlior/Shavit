import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
// Draw Shavit's code-native smile consistently at each platform's icon size.
func render(_ size:Int,_ path:String,transparent:Bool=false){
 let space=CGColorSpaceCreateDeviceRGB()
 let bitmap=transparent ? CGImageAlphaInfo.premultipliedLast.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue
 let c=CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:size*4,space:space,bitmapInfo:bitmap)!
 if !transparent {c.setFillColor(CGColor(red:12/255,green:21/255,blue:38/255,alpha:1));c.fill(CGRect(x:0,y:0,width:size,height:size))}
 c.translateBy(x:0,y:CGFloat(size));c.scaleBy(x:CGFloat(size)/100,y:-CGFloat(size)/100)
 c.setStrokeColor(CGColor(red:143/255,green:196/255,blue:1,alpha:1));c.setLineWidth(4);c.setLineCap(.round);c.setLineJoin(.round)
 c.move(to:CGPoint(x:79,y:49));c.addCurve(to:CGPoint(x:47,y:81),control1:CGPoint(x:81,y:72),control2:CGPoint(x:67,y:83));c.addCurve(to:CGPoint(x:19,y:48),control1:CGPoint(x:27,y:79),control2:CGPoint(x:18,y:69));c.addCurve(to:CGPoint(x:51,y:19),control1:CGPoint(x:20,y:27),control2:CGPoint(x:32,y:18));c.addCurve(to:CGPoint(x:79,y:49),control1:CGPoint(x:70,y:20),control2:CGPoint(x:80,y:31));c.closePath();c.strokePath()
 c.move(to:CGPoint(x:37,y:41));c.addLine(to:CGPoint(x:38,y:46));c.move(to:CGPoint(x:62,y:40));c.addLine(to:CGPoint(x:63,y:45));c.move(to:CGPoint(x:35,y:59));c.addQuadCurve(to:CGPoint(x:65,y:58),control:CGPoint(x:51,y:75));c.strokePath()
 let url=URL(fileURLWithPath:path);let destination=CGImageDestinationCreateWithURL(url as CFURL,UTType.png.identifier as CFString,1,nil)!
 CGImageDestinationAddImage(destination,c.makeImage()!,nil);CGImageDestinationFinalize(destination)
}
for size in [180,192,512]{render(size,"public/shavit-\(size).png")}
render(32,"public/favicon.png");render(1024,"ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
for (density,size,foreground) in [("mdpi",48,108),("hdpi",72,162),("xhdpi",96,216),("xxhdpi",144,324),("xxxhdpi",192,432)]{
 let dir="android/app/src/main/res/mipmap-\(density)";for name in ["ic_launcher","ic_launcher_round"]{render(size,"\(dir)/\(name).png")};render(foreground,"\(dir)/ic_launcher_foreground.png",transparent:true)
}

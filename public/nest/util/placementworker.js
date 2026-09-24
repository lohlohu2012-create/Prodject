
// jsClipper uses X/Y instead of x/y...
function toClipperCoordinates(polygon){
	var clone = [];
	for(var i=0; i<polygon.length; i++){
		clone.push({
			X: polygon[i].x,
			Y: polygon[i].y
		});
	}
	
	return clone;
};

function toNestCoordinates(polygon, scale){
	var clone = [];
	for(var i=0; i<polygon.length; i++){
		clone.push({
			x: polygon[i].X/scale,
			y: polygon[i].Y/scale
		});
	}
	
	return clone;
};

function rotatePolygon(polygon, degrees){
	var rotated = [];
	var angle = degrees * Math.PI / 180;
	for(var i=0; i<polygon.length; i++){
		var x = polygon[i].x;
		var y = polygon[i].y;
		var x1 = x*Math.cos(angle)-y*Math.sin(angle);
		var y1 = x*Math.sin(angle)+y*Math.cos(angle);
						
		rotated.push({x:x1, y:y1});
	}
	
	if(polygon.children && polygon.children.length > 0){
		rotated.children = [];
		for(var j=0; j<polygon.children.length; j++){
			rotated.children.push(rotatePolygon(polygon.children[j], degrees));
		}
	}
	
	return rotated;
};

function PlacementWorker(binPolygon, paths, ids, rotations, config, nfpCache){
	this.binPolygon = binPolygon;
	this.paths = paths;
	this.ids = ids;
	this.rotations = rotations;
	this.config = config;
	this.nfpCache = nfpCache || {};
	this.searchTelemetry = {candidateChecks:0,boundsRejects:0,collisionRejects:0,feasibleCandidates:0,segmentsSampled:0,budgetExceeded:false};
	
	// return a placement for the paths/rotations given
	// happens inside a webworker
	this.placePaths = function(paths){

		var self = global.env.self;

		if(!self.binPolygon){
			return null;
		}		
		
		var i, j, k, m, n, path;
		
		// rotate paths by given rotation
		var rotated = [];
		for(i=0; i<paths.length; i++){
			var r = rotatePolygon(paths[i], paths[i].rotation);
			r.rotation = paths[i].rotation;
			r.source = paths[i].source;
			r.id = paths[i].id;
			rotated.push(r);
		}
		
		paths = rotated;
		
		var allplacements = [];
		var fitness = 0;
		var telemetry = {candidateChecks:0,boundsRejects:0,collisionRejects:0,feasibleCandidates:0,segmentsSampled:0,budgetExceeded:false};
		var candidateBudget = Math.max(64, Number(self.config.candidateBudget || 1200));
		var segmentSamples = Math.max(0, Math.min(6, Number(self.config.segmentSamples || 1)));
		function candidateKey(x,y){
			var q=Math.max(1e-6,Number(self.config.candidateGrid || 0.05));
			return Math.round(x/q)+":"+Math.round(y/q);
		}
		var searchStartedAt=Date.now();
		var searchBudgetMs=Math.max(20,Number(self.config.nfpSearchBudgetMs || 250));
		var searchBudgetExceeded=false;
		function searchBudgetHit(){
			if(searchBudgetExceeded)return true;
			if(Date.now()-searchStartedAt>=searchBudgetMs){
				searchBudgetExceeded=true;
				telemetry.budgetExceeded=true;
				return true;
			}
			return false;
		}
		function addCandidate(out,seen,x,y,source){
			if(!Number.isFinite(x)||!Number.isFinite(y))return;
			var key=candidateKey(x,y);
			if(seen.has(key))return;
			seen.add(key);
			out.push({x:x,y:y,source:source||"boundary"});
			telemetry.segmentsSampled++;
		}
		function collectCandidates(polygons, anchor){
			var out=[], seen=new Set();
			var interiorSamples=Math.max(0,Math.min(6,Number(self.config.segmentSamples||1)));
			var hardCap=Math.max(64,Number(self.config.candidateBudget||1200))*2;
			for(var pi=0;pi<polygons.length;pi++){
				var poly=polygons[pi];
				if(!poly||poly.length<2)continue;
				for(var vi=0;vi<poly.length;vi++){
					if(searchBudgetHit())break;
					var a=poly[vi], b=poly[(vi+1)%poly.length];
					addCandidate(out,seen,a.x-anchor.x,a.y-anchor.y,"vertex");
					var count=interiorSamples;
					for(var si=1;si<=count;si++){
						if(searchBudgetHit())break;
						var t=si/(count+1);
						addCandidate(out,seen,
							a.x+(b.x-a.x)*t-anchor.x,
							a.y+(b.y-a.y)*t-anchor.y,
							"segment");
						if(out.length>=hardCap)break;
					}
					if(out.length>=hardCap)break;
				}
				if(searchBudgetHit()||out.length>=hardCap)break;
			}
			// Deterministic bottom-left priority keeps the search bounded while
			// still allowing interior segment points to beat a bad vertex.
			out.sort(function(a,b){
				if(!GeometryUtil.almostEqual(a.y,b.y))return a.y-b.y;
				return a.x-b.x;
			});
			var budget=Math.max(64,Number(self.config.candidateBudget||1200));
			if(out.length>budget)out.length=budget;
			return out;
		}
		function scoreCandidate(x,y,placedBounds,pathBounds){
			var minX=Math.min(placedBounds.minX,pathBounds.x+x);
			var minY=Math.min(placedBounds.minY,pathBounds.y+y);
			var maxX=Math.max(placedBounds.maxX,pathBounds.x+pathBounds.width+x);
			var maxY=Math.max(placedBounds.maxY,pathBounds.y+pathBounds.height+y);
			var w=maxX-minX,h=maxY-minY;
			return w*2+h;
		}
		var binarea = Math.abs(GeometryUtil.polygonArea(self.binPolygon));
		var workerBinBounds = GeometryUtil.getPolygonBounds(self.binPolygon);
		var key, nfp;
		
		while(paths.length > 0){
			
			var placed = [];
			var placements = [];
			fitness += 1; // add 1 for each new bin opened (lower fitness is better)

			for(i=0; i<paths.length; i++){
				path = paths[i];
				
				// inner NFP
				key = JSON.stringify({A:-1,B:path.id,inside:true,Arotation:0,Brotation:path.rotation});
				var binNfp = self.nfpCache[key];
				
				// part unplaceable, skip
				if(!binNfp || binNfp.length == 0){
					continue;
				}
				
				// ensure all necessary NFPs exist
				var error = false;
				for(j=0; j<placed.length; j++){			
					key = JSON.stringify({A:placed[j].id,B:path.id,inside:false,Arotation:placed[j].rotation,Brotation:path.rotation});
					nfp = self.nfpCache[key];
										
					if(!nfp){
						error = true;
						break;
					}	
				}
				
				// part unplaceable, skip
				if(error){
					continue;
				}
				
				var position = null;
				if(placed.length == 0){
					// First placement: use a bottom-left anchor in dense mode.
					var firstScore = null;
					var firstCandidates=collectCandidates(binNfp,path[0]);
					for(k=0;k<firstCandidates.length;k++){
							var fx = firstCandidates[k].x;
							var fy = firstCandidates[k].y;
							telemetry.candidateChecks++;
							if(fx < workerBinBounds.x-path[0].x || fy < workerBinBounds.y-path[0].y ||
								fx+GeometryUtil.getPolygonBounds(path).x+GeometryUtil.getPolygonBounds(path).width > workerBinBounds.x+workerBinBounds.width ||
								fy+GeometryUtil.getPolygonBounds(path).y+GeometryUtil.getPolygonBounds(path).height > workerBinBounds.y+workerBinBounds.height){
								telemetry.boundsRejects++; continue;
							}
							telemetry.feasibleCandidates++;
							var score = self.config.densePlacementScoring===false
								? fx
								: (fy/Math.max(1,workerBinBounds.height))*10 + (fx/Math.max(1,workerBinBounds.width));
							if(position === null || score < firstScore){
								firstScore = score;
								position = {
									x: fx,
									y: fy,
									id: path.id,
									rotation: path.rotation
								};
							}
					}
					
					if(position){
						placements.push(position);
						placed.push(path);
						placedAreaInBin += Math.abs(GeometryUtil.polygonArea(path));
					}
					
					continue;
				}
				
				var clipperBinNfp = [];
				for(j=0; j<binNfp.length; j++){
					clipperBinNfp.push(toClipperCoordinates(binNfp[j]));
				}
				
				ClipperLib.JS.ScaleUpPaths(clipperBinNfp, self.config.clipperScale);
				
				var clipper = new ClipperLib.Clipper();
				var combinedNfp = new ClipperLib.Paths();
				
				
				for(j=0; j<placed.length; j++){			
					key = JSON.stringify({A:placed[j].id,B:path.id,inside:false,Arotation:placed[j].rotation,Brotation:path.rotation});
					nfp = self.nfpCache[key];
										
					if(!nfp){
						continue;
					}
					
					for(k=0; k<nfp.length; k++){
						var clone = toClipperCoordinates(nfp[k]);
						for(m=0; m<clone.length; m++){
							clone[m].X += placements[j].x;
							clone[m].Y += placements[j].y;
						}
						
						ClipperLib.JS.ScaleUpPath(clone, self.config.clipperScale);
						clone = ClipperLib.Clipper.CleanPolygon(clone, 0.0001*self.config.clipperScale);
						var area = Math.abs(ClipperLib.Clipper.Area(clone));
						if(clone.length > 2 && area > 0.1*self.config.clipperScale*self.config.clipperScale){
							clipper.AddPath(clone, ClipperLib.PolyType.ptSubject, true);
						}
					}		
				}
				
				if(!clipper.Execute(ClipperLib.ClipType.ctUnion, combinedNfp, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)){
					continue;
				}
				
				// difference with bin polygon
				var finalNfp = new ClipperLib.Paths();
				clipper = new ClipperLib.Clipper();
				
				clipper.AddPaths(combinedNfp, ClipperLib.PolyType.ptClip, true);
				clipper.AddPaths(clipperBinNfp, ClipperLib.PolyType.ptSubject, true);
				if(!clipper.Execute(ClipperLib.ClipType.ctDifference, finalNfp, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)){
					continue;
				}
				
				finalNfp = ClipperLib.Clipper.CleanPolygons(finalNfp, 0.0001*self.config.clipperScale);
				
				for(j=0; j<finalNfp.length; j++){
					var area = Math.abs(ClipperLib.Clipper.Area(finalNfp[j]));
					if(finalNfp[j].length < 3 || area < 0.1*self.config.clipperScale*self.config.clipperScale){
						finalNfp.splice(j,1);
						j--;
					}
				}
				
				if(!finalNfp || finalNfp.length == 0){
					continue;
				}
				
				var f = [];
				for(j=0; j<finalNfp.length; j++){
					// back to normal scale
					f.push(toNestCoordinates(finalNfp[j], self.config.clipperScale));
				}
				finalNfp = f;
				
				// choose placement that results in the smallest bounding box
				// could use convex hull instead, but it can create oddly shaped nests (triangles or long slivers) which are not optimal for real-world use
				// todo: generalize gravity direction
				var minwidth = null;
				var minarea = null;
				var minx = null;
				var nf, area, shiftvector;

				if(self.config.fastPlacementScoring===false){
					// Baseline: original scoring path before the optimization.
					for(j=0; j<finalNfp.length; j++){
						nf = finalNfp[j];
						if(Math.abs(GeometryUtil.polygonArea(nf)) < 2)continue;
						for(k=0; k<nf.length; k++){
							var allpoints = [];
							for(m=0; m<placed.length; m++){
								for(n=0; n<placed[m].length; n++){
									allpoints.push({x:placed[m][n].x+placements[m].x,y:placed[m][n].y+placements[m].y});
								}
							}
							shiftvector = {
								x:nf[k].x-path[0].x,
								y:nf[k].y-path[0].y,
								id:path.id,
								rotation:path.rotation,
								nfp:combinedNfp
							};
							for(m=0; m<path.length; m++){
								allpoints.push({x:path[m].x+shiftvector.x,y:path[m].y+shiftvector.y});
							}
							var rectbounds=GeometryUtil.getPolygonBounds(allpoints);
							area=rectbounds.width*2+rectbounds.height;
							if(minarea===null||area<minarea||(GeometryUtil.almostEqual(minarea,area)&&(minx===null||shiftvector.x<minx))){
								minarea=area;minwidth=rectbounds.width;position=shiftvector;minx=shiftvector.x;
							}
						}
					}
				}else{
					// Optimized: bounding box of placed geometry is calculated once.
					var placedMinX=Infinity,placedMinY=Infinity,placedMaxX=-Infinity,placedMaxY=-Infinity;
					for(m=0; m<placed.length; m++){
						var placedPath=placed[m],placedOffset=placements[m];
						for(n=0; n<placedPath.length; n++){
							var px=placedPath[n].x+placedOffset.x,py=placedPath[n].y+placedOffset.y;
							if(px<placedMinX)placedMinX=px;
							if(py<placedMinY)placedMinY=py;
							if(px>placedMaxX)placedMaxX=px;
							if(py>placedMaxY)placedMaxY=py;
						}
					}
					var pathBounds=GeometryUtil.getPolygonBounds(path);
					var pathMinX=pathBounds.x,pathMinY=pathBounds.y;
					var pathMaxX=pathBounds.x+pathBounds.width,pathMaxY=pathBounds.y+pathBounds.height;
					var placedBounds={minX:placedMinX,minY:placedMinY,maxX:placedMaxX,maxY:placedMaxY};
					var candidatePoints=collectCandidates(finalNfp,path[0]);
					for(k=0;k<candidatePoints.length;k++){
							var cp=candidatePoints[k];
							telemetry.candidateChecks++;
							shiftvector={
								x:cp.x,
								y:cp.y,
								id:path.id,
								rotation:path.rotation,
								nfp:combinedNfp
							};
							var shiftedMinX=pathMinX+shiftvector.x,shiftedMinY=pathMinY+shiftvector.y;
							var shiftedMaxX=pathMaxX+shiftvector.x,shiftedMaxY=pathMaxY+shiftvector.y;
							var rectbounds={
								x:Math.min(placedMinX,shiftedMinX),
								y:Math.min(placedMinY,shiftedMinY),
								width:Math.max(placedMaxX,shiftedMaxX)-Math.min(placedMinX,shiftedMinX),
								height:Math.max(placedMaxY,shiftedMaxY)-Math.min(placedMinY,shiftedMinY)
							};
							if(shiftedMinX < workerBinBounds.x || shiftedMinY < workerBinBounds.y ||
								shiftedMinX+pathBounds.width > workerBinBounds.x+workerBinBounds.width ||
								shiftedMinY+pathBounds.height > workerBinBounds.y+workerBinBounds.height){
								telemetry.boundsRejects++; continue;
							}
							telemetry.feasibleCandidates++;
							if(self.config.densePlacementScoring===false){
								area=rectbounds.width*2+rectbounds.height;
							}else{
								var normalizedBox=(rectbounds.width*rectbounds.height)/Math.max(1,binarea);
								var bottomLeft=(rectbounds.x/Math.max(1,workerBinBounds.width))+
									(rectbounds.y/Math.max(1,workerBinBounds.height));
								var compactness=(rectbounds.width/Math.max(1,workerBinBounds.width))+
									(rectbounds.height/Math.max(1,workerBinBounds.height));
								area=normalizedBox*1000+bottomLeft*25+compactness*2;
							}
							if(minarea===null||area<minarea||(GeometryUtil.almostEqual(minarea,area)&&(minx===null||shiftvector.x<minx))){
								minarea=area;minwidth=rectbounds.width;position=shiftvector;minx=shiftvector.x;
							}
						}
					}
				}
				if(position){
					placed.push(path);
					placements.push(position);
					placedAreaInBin += Math.abs(GeometryUtil.polygonArea(path));
				}
			}

			// Penalize a poorly filled active sheet. This makes the GA prefer
			// arrangements that keep usable space for additional small parts.
			if(placements.length > 0){
				var fillRatio = Math.min(1, Math.max(0, placedAreaInBin/Math.max(1,binarea)));
				fitness += (1-fillRatio)*Number(self.config.fillWeight || 0);
			}
			
			if(minwidth){
				fitness += minwidth/binarea;
			}
			
			for(i=0; i<placed.length; i++){
				var index = paths.indexOf(placed[i]);
				if(index >= 0){
					paths.splice(index,1);
				}
			}
			
			if(placements && placements.length > 0){
				allplacements.push(placements);
			}
			else{
				break; // something went wrong
			}
		}
		
		// there were parts that couldn't be placed
		fitness += 2*paths.length;
		
		this.searchTelemetry = telemetry;
		return {placements: allplacements, fitness: fitness, paths: paths, area: binarea, telemetry: telemetry };
	};

}
(typeof window !== 'undefined' ? window : self).PlacementWorker = PlacementWorker;

// clipperjs uses alerts for warnings
function alert(message) { 
    console.log('alert: ', message);
}

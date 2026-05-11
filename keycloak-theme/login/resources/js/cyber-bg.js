(function() {
  var canvas = document.createElement('canvas');
  canvas.id = 'cyber-bg';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;opacity:0.22;';
  document.body.insertBefore(canvas, document.body.firstChild);

  var ctx = canvas.getContext('2d');
  var TILE_W=58, TILE_H=29, MAP_COLS=22, MAP_ROWS=13;

  var p = {
    serverTop:'#d0c9b8', serverRight:'#b2ab9a', serverLeft:'#948c7d',
    serverOutline:'rgba(61,40,23,0.55)', serverVent:'rgba(61,40,23,0.15)',
    ledSafe:'#8ba990', ledAttack:'#d89760', ledIdle:'rgba(61,40,23,0.35)',
    gridDot:'rgba(61,40,23,0.11)', tileEdge:'rgba(61,40,23,0.06)',
    tileFill:'rgba(234,224,204,0.09)', hackerBody:'rgba(48,36,26,0.72)',
    hackerHood:'rgba(30,22,14,0.78)', hackerFoot:'rgba(24,18,12,0.82)',
    teamOrange:'#c26d1a', teamTeal:'#5a7d8f', teamPurple:'#7c6ba0',
    teamSienna:'#a06548', teamMoss:'#7d8c5a',
    payloadBg:'rgba(253,249,240,0.9)', payloadText:'rgba(61,40,23,0.82)',
    label:'rgba(61,40,23,0.58)', flagNeutral:'#8a7c6a',
    keystroke:'rgba(61,40,23,0.55)'
  };

  var TEAM_COLORS = [
    {color:p.teamOrange, soft:'rgba(194,109,26,0.88)'},
    {color:p.teamTeal,   soft:'rgba(90,125,143,0.88)'},
    {color:p.teamMoss,   soft:'rgba(125,140,90,0.88)'},
    {color:p.teamPurple, soft:'rgba(124,107,160,0.88)'},
    {color:p.teamSienna, soft:'rgba(160,101,72,0.88)'}
  ];

  var PAYLOADS = {
    WEB:["<script>","onerror=x","' OR 1=1--","UNION SELECT","SSRF=169.254","gopher://","?file=../etc/","{{7*7}}","?next=//evil"],
    PWN:["0x41414141","stack smash","%p.%p.%p","use-after-free","tcache++","ret2libc","ROP chain","\\x90\\x90","system('/bin/sh')"],
    CRYPTO:["RSA e=3","Wiener atk","N=p*q","xor key","crib drag","pad oracle","CBC bit-flip","MD5 coll","hashcat"],
    REVERSE:["crackme","strcmp()","keygen","serial=42","IDA pro","ghidra","radare2","deobfuscate"],
    FORENSICS:["wireshark","tcp.stream",".pcap","volatility","memdump","autopsy","$MFT","syslog"],
    STEGO:["stegsolve","zsteg","LSB plane","audacity","PNG chunk","exiftool","binwalk","steghide"],
    OSINT:["shodan","whois","crt.sh","wayback","EXIF GPS","geohash","reverse img"],
    MISC:["base64 -d","rot13","pyjail esc","regex puzzle","QR decode","morse .-..","unicode fuzz"]
  };

  var SERVER_POS = [
    {tx:1,ty:8,type:'CRYPTO'},{tx:5,ty:9,type:'WEB'},{tx:6,ty:13,type:'FORENSICS'},
    {tx:10,ty:14,type:'STEGO'},{tx:14,ty:-1,type:'REVERSE'},{tx:15,ty:3,type:'PWN'},
    {tx:18,ty:6,type:'OSINT'},{tx:22,ty:4,type:'MISC'}
  ];

  var TEAM_STARTS = [{tx:0,ty:3},{tx:2,ty:9},{tx:4,ty:12},{tx:13,ty:0},{tx:22,ty:8}];
  var TEAM_TARGETS = [[0,1],[1,2],[2,3],[4,5],[5,6,7]];

  var width=0, height=0, rafId=0;
  var start = performance.now();

  function resize() {
    var dpr = Math.min(window.devicePixelRatio||1, 2);
    var rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    canvas.width = Math.floor(width*dpr);
    canvas.height = Math.floor(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function scaleFn() {
    var needH = width/(((MAP_COLS-1)+(MAP_ROWS-1))*TILE_W*0.5);
    var needV = height/(((MAP_COLS-1)+(MAP_ROWS-1))*TILE_H*0.5);
    return Math.max(0.55, Math.max(needH,needV)*1.04);
  }

  function iso(tx,ty) {
    var gs=scaleFn();
    var ox = width/2 - ((MAP_COLS-1)-(MAP_ROWS-1))*TILE_W*0.25*gs;
    var oy = height/2 - (MAP_COLS-1+MAP_ROWS-1)*TILE_H*0.25*gs;
    return {x: ox+(tx-ty)*TILE_W*gs*0.5, y: oy+(tx+ty)*TILE_H*gs*0.5};
  }

  function easeInOut(x) { return x<0.5 ? 2*x*x : 1-Math.pow(-2*x+2,2)/2; }
  function easeOutQuad(x) { return 1-Math.pow(1-x,2); }
  function dist(a,b) { return Math.hypot(a.tx-b.tx, a.ty-b.ty); }

  function spring(pos,vel,target,k,d) {
    var a = -k*(pos-target)-d*vel;
    var nv = vel+a;
    return {pos:pos+nv, vel:nv};
  }

  // Init servers
  var servers = SERVER_POS.map(function(s) {
    return {tx:s.tx, ty:s.ty, type:s.type, controller:null, captureAnimStart:null,
      lastHit:0, shakeX:0, shakeY:0, shakeVx:0, shakeVy:0, ledNoise:Math.random()*100};
  });

  // Init teams
  function initTeam(idx) {
    var def = TEAM_COLORS[idx];
    var start2 = TEAM_STARTS[idx];
    var targets = TEAM_TARGETS[idx].slice();
    var firstTgt = {tx:servers[targets[0]].tx-1.15, ty:servers[targets[0]].ty+0.55};
    var d = dist(start2, firstTgt);
    return {
      id:idx, color:def.color, colorSoft:def.soft,
      targets:targets, cursor:0, phase:'traveling', phaseStart:start,
      currentPos:{tx:start2.tx,ty:start2.ty}, fromPos:{tx:start2.tx,ty:start2.ty},
      travelDuration:700+d*230, totalDist:d,
      lastPayload:0, lastKeystroke:0, payloadIdx:0,
      initialDelay:idx*500, headTilt:0, headTiltVel:0, bounce:0, bounceVel:0
    };
  }

  var teams = [0,1,2,3,4].map(initTeam);
  var payloads=[], impacts=[], sparks=[], keystrokes=[];
  var roundStart = start;

  function getApproach(s) { return {tx:s.tx-1.15, ty:s.ty+0.55}; }

  function drawGrid() {
    var gs=scaleFn();
    var hw=TILE_W*gs*0.5, hh=TILE_H*gs*0.5;
    ctx.strokeStyle=p.tileEdge; ctx.lineWidth=0.8;
    ctx.fillStyle=p.tileFill;
    for(var ty=-2; ty<=MAP_ROWS+2; ty++) {
      for(var tx=-2; tx<=MAP_COLS+2; tx++) {
        var pt=iso(tx,ty);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y-hh);
        ctx.lineTo(pt.x+hw, pt.y);
        ctx.lineTo(pt.x, pt.y+hh);
        ctx.lineTo(pt.x-hw, pt.y);
        ctx.closePath();
        if((tx+ty)%3===0) ctx.fill();
        ctx.stroke();
      }
    }
    ctx.fillStyle=p.gridDot;
    for(var ty=-2; ty<=MAP_ROWS+2; ty++) {
      for(var tx=-2; tx<=MAP_COLS+2; tx++) {
        if((tx+ty)%2!==0) continue;
        var pt=iso(tx,ty);
        ctx.beginPath(); ctx.arc(pt.x,pt.y,0.9,0,Math.PI*2); ctx.fill();
      }
    }
  }

  function drawIsoCube(pos,bw,bh,zH) {
    ctx.strokeStyle=p.serverOutline; ctx.lineWidth=1.1;
    ctx.fillStyle=p.serverLeft;
    ctx.beginPath();
    ctx.moveTo(pos.x-bw,pos.y); ctx.lineTo(pos.x,pos.y+bh);
    ctx.lineTo(pos.x,pos.y+bh-zH); ctx.lineTo(pos.x-bw,pos.y-zH);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle=p.serverRight;
    ctx.beginPath();
    ctx.moveTo(pos.x,pos.y+bh); ctx.lineTo(pos.x+bw,pos.y);
    ctx.lineTo(pos.x+bw,pos.y-zH); ctx.lineTo(pos.x,pos.y+bh-zH);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle=p.serverTop;
    ctx.beginPath();
    ctx.moveTo(pos.x-bw,pos.y-zH); ctx.lineTo(pos.x,pos.y+bh-zH);
    ctx.lineTo(pos.x+bw,pos.y-zH); ctx.lineTo(pos.x,pos.y-bh-zH);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawServer(s,t,now) {
    var pos=iso(s.tx,s.ty), gs=scaleFn();
    var bw=TILE_W*gs*0.46, bh=TILE_H*gs*0.46, cH=20*gs;
    var underAttack=teams.some(function(te) {
      return te.phase==='attacking' && te.targets[te.cursor]===servers.indexOf(s);
    });
    ctx.save(); ctx.translate(s.shakeX,s.shakeY);
    ctx.fillStyle='rgba(61,40,23,0.28)';
    ctx.beginPath(); ctx.ellipse(pos.x,pos.y+bh*0.5,bw*1.2,bh*0.8,0,0,Math.PI*2); ctx.fill();
    drawIsoCube(pos,bw,bh,cH);
    // flag
    var flagColor = s.controller!==null ? teams[s.controller].color : p.flagNeutral;
    var top={x:pos.x, y:pos.y-cH};
    var flagTop={x:top.x, y:top.y-6*gs};
    var wave=Math.sin(t*5+s.tx*2);
    ctx.strokeStyle=p.serverOutline; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(top.x,top.y); ctx.lineTo(flagTop.x,flagTop.y); ctx.stroke();
    ctx.fillStyle=flagColor; ctx.strokeStyle=p.serverOutline; ctx.lineWidth=0.8;
    ctx.beginPath();
    ctx.moveTo(flagTop.x,flagTop.y);
    ctx.lineTo(flagTop.x+8*gs+wave*0.6, flagTop.y+1.5*gs);
    ctx.lineTo(flagTop.x+6*gs, flagTop.y+3*gs);
    ctx.lineTo(flagTop.x, flagTop.y+4.5*gs);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // label
    ctx.font=Math.max(9,Math.round(10*gs*0.9))+'px monospace';
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillStyle=s.controller!==null ? teams[s.controller].color : p.label;
    ctx.fillText(s.type, pos.x, pos.y+bh*1.25+3*gs);
    // LED
    var ledFlick=0.4+0.6*Math.abs(Math.sin(t*3+s.ledNoise));
    var ledColor = s.controller!==null ? teams[s.controller].color : (underAttack ? p.ledAttack : p.ledSafe);
    ctx.fillStyle=ledColor; ctx.globalAlpha=ledFlick;
    ctx.shadowColor=ledColor; ctx.shadowBlur=3;
    ctx.beginPath(); ctx.arc(pos.x-bw*0.55,pos.y-cH*0.8,1.5,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
    if(underAttack) {
      var pulse=0.14+Math.sin(t*10)*0.08;
      ctx.strokeStyle='rgba(216,151,96,'+pulse+')'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.ellipse(pos.x,pos.y-cH*0.5,bw*1.25,cH*0.75,0,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
    if(s.captureAnimStart!==null && s.controller!==null) {
      var age2=(now-s.captureAnimStart)/900;
      if(age2<1) {
        var r2=10+age2*55*gs;
        ctx.strokeStyle=teams[s.controller].colorSoft;
        ctx.lineWidth=1.5*(1-age2); ctx.globalAlpha=1-age2;
        ctx.beginPath(); ctx.arc(pos.x,pos.y-cH*0.5,r2,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=1;
      } else { s.captureAnimStart=null; }
    }
  }

  function drawHacker(team,t,now) {
    var pos=iso(team.currentPos.tx, team.currentPos.ty), gs=scaleFn();
    var walking=team.phase==='traveling';
    var elapsed=now-team.phaseStart;
    var prog=walking ? Math.min(elapsed/team.travelDuration,1) : 0;
    var walkPhase=walking ? (prog*team.totalDist*3.2)%1 : 0;
    var bob=walking ? Math.abs(Math.sin(walkPhase*Math.PI*2))*1.1 : Math.sin(t*2)*0.5;
    ctx.save();
    ctx.translate(pos.x, pos.y+(bob+team.bounce)*gs);
    ctx.scale(gs, gs);
    // shadow
    ctx.fillStyle='rgba(61,40,23,0.26)';
    ctx.beginPath(); ctx.ellipse(0,4,7.5,2.2,0,0,Math.PI*2); ctx.fill();
    // feet
    var legA=walking?Math.max(0,Math.sin(walkPhase*Math.PI*2)):0;
    var legB=walking?Math.max(0,Math.sin((walkPhase+0.5)*Math.PI*2)):0;
    ctx.fillStyle=p.hackerFoot;
    ctx.beginPath(); ctx.ellipse(-2.3,2.2-legA*1.8,1.5,0.9,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2.3,2.2-legB*1.8,1.5,0.9,0,0,Math.PI*2); ctx.fill();
    // body
    ctx.fillStyle=p.hackerBody; ctx.strokeStyle='rgba(30,22,14,0.85)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(-5,1); ctx.quadraticCurveTo(-6,-8,-3,-11);
    ctx.lineTo(3,-11); ctx.quadraticCurveTo(6,-8,5,1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // accent stripe
    ctx.fillStyle=team.color;
    ctx.beginPath(); ctx.moveTo(-5,1); ctx.lineTo(5,1); ctx.lineTo(4,3); ctx.lineTo(-4,3); ctx.closePath(); ctx.fill();
    // hood
    ctx.fillStyle=p.hackerHood; ctx.strokeStyle='rgba(30,22,14,0.85)';
    ctx.beginPath(); ctx.ellipse(0,-13,5,6,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    // eyes
    var eyeFlick=0.55+Math.sin(t*3+team.id)*0.45;
    ctx.fillStyle=team.color; ctx.globalAlpha=eyeFlick;
    ctx.beginPath(); ctx.arc(-1.3,-13,0.75,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(1.3,-13,0.75,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    ctx.restore();
  }

  function bezier(pl,tr) {
    return {
      x:(1-tr)*(1-tr)*pl.from.x+2*(1-tr)*tr*pl.cp.x+tr*tr*pl.to.x,
      y:(1-tr)*(1-tr)*pl.from.y+2*(1-tr)*tr*pl.cp.y+tr*tr*pl.to.y
    };
  }

  function drawPayload(pl,now) {
    var gs=scaleFn();
    var age=now-pl.startTime;
    var progress=Math.min(age/pl.duration,1);
    var eased=easeOutQuad(progress);
    var head=bezier(pl,eased);
    ctx.strokeStyle=pl.color; ctx.lineWidth=0.6; ctx.globalAlpha=0.35;
    ctx.setLineDash([2,3]);
    ctx.beginPath();
    for(var i=0;i<=14;i++) {
      var tr=Math.max(0,eased-i*0.04);
      var pt=bezier(pl,tr);
      if(i===0) ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
    var fontPx=Math.max(9,Math.round(11*gs*0.85));
    ctx.font=fontPx+'px monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    var metrics=ctx.measureText(pl.text);
    var boxW=metrics.width+8*gs*0.8, boxH=fontPx+6;
    var fadeIn=Math.min(1,progress*3);
    var fadeOut=progress>0.85 ? 1-(progress-0.85)/0.15 : 1;
    var alpha=fadeIn*fadeOut;
    ctx.globalAlpha=alpha*0.9;
    ctx.fillStyle=p.payloadBg; ctx.strokeStyle=pl.color; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(head.x-boxW/2,head.y-boxH/2,boxW,boxH,3);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha=alpha; ctx.fillStyle=p.payloadText;
    ctx.fillText(pl.text,head.x,head.y);
    ctx.globalAlpha=1;
    return progress>=1 ? {x:head.x,y:head.y,color:pl.color,targetIdx:pl.targetIdx} : null;
  }

  function drawImpact(imp,now) {
    var age=(now-imp.startTime)/500;
    if(age>=1) return true;
    var r=6+age*28, alpha=1-age;
    ctx.strokeStyle=imp.color; ctx.lineWidth=1.6*(1-age); ctx.globalAlpha=alpha*0.7;
    ctx.beginPath(); ctx.arc(imp.x,imp.y,r,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=1; return false;
  }

  function spawnPayload(team,now) {
    var sh=servers[team.targets[team.cursor]];
    var list=PAYLOADS[sh.type];
    var text=list[team.payloadIdx%list.length]; team.payloadIdx++;
    var from=iso(team.currentPos.tx, team.currentPos.ty-0.15);
    var target=iso(sh.tx,sh.ty);
    var gs=scaleFn();
    target.y-=20*gs; target.x+=(Math.random()-0.5)*14*gs; target.y+=(Math.random()-0.5)*10*gs;
    var midX=(from.x+target.x)/2+(Math.random()-0.5)*24;
    var midY=Math.min(from.y,target.y)-(32+Math.random()*26)*gs;
    payloads.push({startTime:now,duration:900+Math.random()*250,text:text,
      from:from,to:target,cp:{x:midX,y:midY},color:team.colorSoft,targetIdx:team.targets[team.cursor]});
  }

  function beginTravel(team,now,cursor) {
    team.cursor=cursor; team.fromPos={tx:team.currentPos.tx,ty:team.currentPos.ty};
    team.phase='traveling'; team.phaseStart=now; team.payloadIdx=0;
    var target=getApproach(servers[team.targets[cursor]]);
    team.totalDist=dist(team.fromPos,target);
    team.travelDuration=700+team.totalDist*230;
  }

  function advanceTeam(team,now) {
    if(now-start<team.initialDelay) return;
    if(team.phase==='traveling') {
      var elapsed=now-team.phaseStart;
      var target=getApproach(servers[team.targets[team.cursor]]);
      if(elapsed>=team.travelDuration) {
        team.currentPos={tx:target.tx,ty:target.ty};
        team.phase='attacking'; team.phaseStart=now;
      } else {
        var prog2=easeInOut(elapsed/team.travelDuration);
        team.currentPos={
          tx:team.fromPos.tx+(target.tx-team.fromPos.tx)*prog2,
          ty:team.fromPos.ty+(target.ty-team.fromPos.ty)*prog2
        };
      }
    } else if(team.phase==='attacking') {
      if(now-team.phaseStart>=800) {
        var shIdx=team.targets[team.cursor];
        servers[shIdx].controller=team.id; servers[shIdx].captureAnimStart=now;
        var shPos=iso(servers[shIdx].tx,servers[shIdx].ty);
        sparks.push({startTime:now,x:shPos.x,y:shPos.y-20*scaleFn(),color:team.colorSoft});
        team.phase='victorious'; team.phaseStart=now; team.bounceVel-=1.2;
      }
    } else if(team.phase==='victorious') {
      if(now-team.phaseStart>=320) {
        var next=(team.cursor+1)%team.targets.length;
        beginTravel(team,now,next);
      }
    }
  }

  function renderFrame(now) {
    var t=(now-start)/1000;
    ctx.clearRect(0,0,width,height);
    drawGrid();
    if(now-roundStart>16000) {
      roundStart=now;
      servers.forEach(function(s){s.controller=null;s.captureAnimStart=null;});
    }
    teams.forEach(function(team){advanceTeam(team,now);});
    // physics
    servers.forEach(function(s){
      var rx=spring(s.shakeX,s.shakeVx,0,0.22,0.34);
      s.shakeX=rx.pos;s.shakeVx=rx.vel;
      var ry=spring(s.shakeY,s.shakeVy,0,0.22,0.34);
      s.shakeY=ry.pos;s.shakeVy=ry.vel;
    });
    teams.forEach(function(team){
      var tilt=spring(team.headTilt,team.headTiltVel,0,0.18,0.28);
      team.headTilt=tilt.pos;team.headTiltVel=tilt.vel;
      var bnc=spring(team.bounce,team.bounceVel,0,0.24,0.3);
      team.bounce=bnc.pos;team.bounceVel=bnc.vel;
    });
    // spawn
    teams.forEach(function(team){
      if(team.phase==='attacking') {
        if(now-team.lastPayload>100){team.lastPayload=now;spawnPayload(team,now);}
      }
    });
    // draw order by depth
    var entries=[];
    servers.forEach(function(s){entries.push({depth:s.tx+s.ty,draw:function(sv){return function(){drawServer(sv,t,now);};}(s)});});
    teams.forEach(function(team){entries.push({depth:team.currentPos.tx+team.currentPos.ty+0.1,draw:function(te){return function(){drawHacker(te,t,now);};}(team)});});
    entries.sort(function(a,b){return a.depth-b.depth;});
    entries.forEach(function(e){e.draw();});
    // payloads
    for(var i=payloads.length-1;i>=0;i--) {
      var landed=drawPayload(payloads[i],now);
      if(landed){
        impacts.push({startTime:now,x:landed.x,y:landed.y,color:landed.color});
        var sv=servers[landed.targetIdx];
        sv.shakeVx+=(Math.random()-0.5)*2.4; sv.shakeVy+=(Math.random()-0.3)*1.5;
        payloads.splice(i,1);
      }
    }
    for(var i=impacts.length-1;i>=0;i--){if(drawImpact(impacts[i],now))impacts.splice(i,1);}
    // sparks
    for(var i=sparks.length-1;i>=0;i--){
      var sp=sparks[i], age2=(now-sp.startTime)/800;
      if(age2>=1){sparks.splice(i,1);continue;}
      for(var j=0;j<6;j++){
        var a2=(j*Math.PI)/3+age2*2, d2=5+age2*22;
        ctx.fillStyle=sp.color; ctx.globalAlpha=(1-age2)*0.7;
        ctx.beginPath(); ctx.arc(sp.x+Math.cos(a2)*d2,sp.y+Math.sin(a2)*d2-age2*8,1.5*(1-age2),0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    rafId=requestAnimationFrame(renderFrame);
  }

  resize();
  window.addEventListener('resize', resize);
  rafId=requestAnimationFrame(renderFrame);
})();

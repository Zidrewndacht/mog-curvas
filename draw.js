//Funções de desenho no canvas:

function drawTangentVector(vector, color) { //ok
  const start = NURBScontrolPoints[0];
  const scale = 0.1;
  const end = {
    x: start.x + vector.x * scale,
    y: start.y + vector.y * scale
  };
  
  // Draw the line
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw arrowhead with base at the end of the line
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const arrowLength = 10; // Length of the arrowhead
  const arrowWidth = 6;   // Width at the base of the arrowhead
  
  // Calculate the tip point (extending beyond 'end')
  const tip = {
    x: end.x + arrowLength * Math.cos(angle),
    y: end.y + arrowLength * Math.sin(angle)
  };
  
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y); // Start at the tip
  // Draw to one side of the base
  ctx.lineTo(
    end.x - arrowWidth * Math.cos(angle - Math.PI/2),
    end.y - arrowWidth * Math.sin(angle - Math.PI/2)
  );
  // Draw to the other side of the base
  ctx.lineTo(
    end.x - arrowWidth * Math.cos(angle + Math.PI/2),
    end.y - arrowWidth * Math.sin(angle + Math.PI/2)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawNURBScurve() { /** reescrever */
    // Get the valid parameter range [u_min, u_max]
    const u_min = NURBSknotVector[NURBS_DEGREE];
    const u_max = NURBSknotVector[NURBSknotVector.length - NURBS_DEGREE - 1];
    const sampleCount = parseInt(document.getElementById('sampleCount').value) * NURBScontrolPoints.length;
    const delta = (u_max - u_min) / sampleCount;

    // Evaluate first point
    const startPoint = evaluateNURBS(u_min, NURBS_DEGREE, NURBScontrolPoints, NURBSknotVector);
    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);

    // Sample the curve within the valid range
    for (let i = 1; i <= sampleCount; i++) {
        const u = Math.min(u_min + i * delta, u_max - Number.EPSILON);
        const point = evaluateNURBS(u, NURBS_DEGREE, NURBScontrolPoints, NURBSknotVector);
        ctx.lineTo(point.x, point.y);
    }

    ctx.strokeStyle = '#083';
    ctx.lineWidth = 2;
    ctx.stroke();
}
/*** Fim da mágica. */

function drawBezierCurve() { //OK
    const sampleCount = parseInt(document.getElementById('sampleCount').value) * bezierControlPoints.length;
    ctx.beginPath();
    
    //Move-se ao primeiro ponto sem riscar nada:
    const startPoint = bezierControlPoints[0];
    ctx.moveTo(startPoint.x, startPoint.y);
    
    //Para o número de amostras sampleCount, desenha a curva usando segmentos de reta entre pontos amostrados:
    for (let i = 1; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const point = deCasteljau(bezierControlPoints, t);
        ctx.lineTo(point.x, point.y);
    }
    
    ctx.strokeStyle = '#800'; // vermelho escuro para Bézier.
    ctx.lineWidth = 2;
    ctx.stroke();
}

function draw() {
  requestAnimationFrame(() => { //limita taxa de atualização ao FPS do dispositivo:
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

      ctx.translate(panOffset.x, panOffset.y);
      ctx.translate(zoomOrigin.x, zoomOrigin.y);
      ctx.scale(zoomLevel, zoomLevel);
      ctx.translate(-zoomOrigin.x, -zoomOrigin.y);
      
      ctx.font = '12px system-ui';

      if (document.getElementById('showControlPolygon').checked){ //OK: "Exibir polígono de controle"
        ctx.beginPath();
        ctx.moveTo(NURBScontrolPoints[0].x, NURBScontrolPoints[0].y);
        for (let i = 1; i < NURBScontrolPoints.length; i++) {
          ctx.lineTo(NURBScontrolPoints[i].x, NURBScontrolPoints[i].y);
        }
        ctx.moveTo(bezierControlPoints[0].x, bezierControlPoints[0].y);
        for (let i = 1; i < bezierControlPoints.length; i++) {
          ctx.lineTo(bezierControlPoints[i].x, bezierControlPoints[i].y);
        }
        ctx.strokeStyle = '#b8b8b8';
        ctx.lineWidth = 1;
        ctx.stroke();

        //linha mais sutil do último ponto ao primeiro:
        ctx.beginPath();
        ctx.moveTo(NURBScontrolPoints[NURBScontrolPoints.length-1].x, NURBScontrolPoints[NURBScontrolPoints.length-1].y);
        ctx.lineTo(NURBScontrolPoints[0].x, NURBScontrolPoints[0].y);
        ctx.moveTo(bezierControlPoints[bezierControlPoints.length-1].x, bezierControlPoints[bezierControlPoints.length-1].y);
        ctx.lineTo(bezierControlPoints[0].x, bezierControlPoints[0].y);
        ctx.strokeStyle = '#b8b8b848'; 
        ctx.stroke();
      }

      if (document.getElementById('showPointIndex').checked){ //OK: "Exibir índices"
        NURBScontrolPoints.forEach((point, index) => {
          ctx.fillStyle = '#208030e0';
          ctx.fillText(index.toString(), point.x - 8, point.y - 10);
        });
        bezierControlPoints.forEach((point, index) => {
            ctx.fillStyle = '#802030e0';
            ctx.fillText(index.toString(), point.x - 2, point.y - 10);
        });
      }  

      drawNURBScurve();
      drawBezierCurve();
      
      //Nós e pontos de controle precisam aparecer 'por cima' das curvas, todo o resto 'por baixo':
      if (document.getElementById('debugPopup').classList.contains('visible')){ //OK  //exibe vetor tangente enquanto popu está ativo
          drawTangentVector(bezier1stDerivative, '#b005');  //vetores calculados previamente por showDebugPopup();
          drawTangentVector(NURBS1stDerivative, '#0b05');
          if (NURBScontrolPoints.slice(0, 4).every(point => point.weight === 1)) {
              drawTangentVector(bezier2ndDerivative, '#f2a6'); 
              drawTangentVector(NURBS2ndDerivative, '#08f6');
          }
      }

      if (document.getElementById('showWeights').checked) { //OK: "Exibir pesos"
        NURBScontrolPoints.forEach((point) => {
            ctx.font = '10px system-ui';
            ctx.fillStyle = '#010';
            ctx.fillText(`w:${point.weight.toFixed(1)}`, point.x + 10, point.y - 10);
        });
      }
    
      if (document.getElementById('showKnots').checked) {  //Mágica //"Exibir nós"
        /** refazer: */
        const u_min = NURBSknotVector[NURBS_DEGREE];
        const u_max = NURBSknotVector[NURBSknotVector.length - NURBS_DEGREE - 1];
        
        const uniqueKnots = [...new Set(NURBSknotVector)].filter(u => u >= u_min && u <= u_max);
        
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        uniqueKnots.forEach(u => {
          const point = evaluateNURBS(u, NURBS_DEGREE, NURBScontrolPoints, NURBSknotVector);
          
          // Draw a smaller circle at the knot position
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2.25, 0, Math.PI * 2);
          ctx.fillStyle = '#208030';
          ctx.fill();
          
          // Display the knot value below the marker
          ctx.fillStyle = '#208030';
          ctx.fillText(u.toFixed(1), point.x, point.y + 15);
        });
      }

      if (document.getElementById('showControlPoints').checked){ //OK: "Exibir pontos de controle"
        NURBScontrolPoints.forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#208030';
          ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#050'; 
            ctx.stroke();
        });
        bezierControlPoints.forEach((point) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#802030'; 
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#500'; 
            ctx.stroke();
        });
      }
    
    ctx.restore();
  })
}

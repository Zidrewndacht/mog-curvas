
/**Define vetor de nós como valores padrão para o grau e número de pontos.
 * usado por initCanvas(), adição/remoção de ponto e evento de botão de reset.
 * Difere do padrão 0~1 porque a representação do vetor de nós fica mais legível
 * (apenas valores inteiros) e não ocorre diferença na curva pois NURBS 
 * considera apenas a distância relativa entre nós: */
function setNURBSknotVector() { //OK 
  const requiredLength = NURBS_DEGREE + NURBScontrolPoints.length + 1;
    if (NURBSknotVector.length !== requiredLength) {
      
    const controlPoints = NURBScontrolPoints.length;
    const knots = NURBS_DEGREE + 1;
    NURBSknotVector = []; //limpa vetor existente
    
    // Inicia com 'grau+1' zeros (0) para clamping:
    for (let i = 0; i < knots; i++) {
      NURBSknotVector.push(0);
    }
    // Adiciona nós excedentes (para controlPoints > knots)
    const internalKnots = controlPoints - knots;
    if (controlPoints > knots) {
      for (let i = 1; i <= internalKnots; i++) {
        const knotValue = i 
        NURBSknotVector.push(parseFloat(knotValue));
      }
    }
    // Termina com clamping:
    for (let i = 0; i < knots; i++) {
      NURBSknotVector.push(internalKnots + 1);
    }
    
    /** Versão anterior "padrão" (normalizado 0~1): */
    // if (controlPoints > knots) {
    //   const internalKnots = controlPoints - knots;
    //   for (let i = 1; i <= internalKnots; i++) {
    //     const knotValue = i / (internalKnots + 1);  //distribui ~uniformemente entre 0 e 1
    //     NURBSknotVector.push(parseFloat(knotValue.toFixed(3))); //3 dígitos para não poluir
    //   }
    // }
    
    // // Termina com grau+1 uns (1)
    // for (let i = 0; i < knots; i++) {
    //   NURBSknotVector.push(1);
    // }

    const formattedKnots = NURBSknotVector.map(k => {
      const num = typeof k === 'string' ? parseFloat(k) : k;
      return num % 1 === 0 ? num.toString() : parseFloat(num.toFixed(2)).toString();
    });
    document.getElementById('NURBSknotVector').value = formattedKnots.join(', ');

    document.getElementById('applyKnots').style.display = 'none';
    draw();
  } 
}


/*** Funções para NURBS:
 * Mágica: (Implementação DS V3 -- reescrever cf. livro ou https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/de-Boor.html */
function basisFunction(i, p, u, knots) { //converter para Cox-De Boor iterativo?
    if (p === 0) {
        // Handle the end of the interval inclusively
        if (u < knots[i] || u > knots[i + 1]) return 0.0;
        // Special case for the last knot
        if (u === knots[knots.length - p - 1] && i === knots.length - p - 2) return 1.0;
        return (knots[i] <= u && u <= knots[i + 1]) ? 1.0 : 0.0;
    } else {
        const left = (knots[i + p] - knots[i]) === 0 ? 0 : 
            ((u - knots[i]) / (knots[i + p] - knots[i])) * basisFunction(i, p - 1, u, knots);
        const right = (knots[i + p + 1] - knots[i + 1]) === 0 ? 0 : 
            ((knots[i + p + 1] - u) / (knots[i + p + 1] - knots[i + 1])) * basisFunction(i + 1, p - 1, u, knots);
        return left + right;
    }
}

function evaluateNURBS(u, NURBS_DEGREE, NURBScontrolPoints, knots) {
    let x = 0, y = 0, z = 0;
    let weightSum = 0;

    for (let i = 0; i < NURBScontrolPoints.length; i++) {  //para cada ponto de controle:
        const basis = basisFunction(i, NURBS_DEGREE, u, knots);
        const weightedBasis = basis * NURBScontrolPoints[i].weight;
        x += NURBScontrolPoints[i].x * weightedBasis;
        y += NURBScontrolPoints[i].y * weightedBasis;
        z += NURBScontrolPoints[i].z * weightedBasis;
        weightSum += weightedBasis;
    }
    return {
        x: x / weightSum,
        y: y / weightSum,
        z: z / weightSum
    };
}

function calculateNURBSTangentVectors() {   /** Mágica DS v3 0324: */
    const k = NURBS_DEGREE;
    const p0 = NURBScontrolPoints[0];
    const p1 = NURBScontrolPoints[1];
    const p2 = NURBScontrolPoints[2];
    
    // 1st derivative (always valid for clamped endpoints)
    NURBS1stDerivative.x = k * (p1.x - p0.x);
    NURBS1stDerivative.y = k * (p1.y - p0.y);
    
    // 2nd derivative (valid for clamped endpoints)
    NURBS2ndDerivative.x = k * (k - 1) * (p2.x - 2 * p1.x + p0.x);
    NURBS2ndDerivative.y = k * (k - 1) * (p2.y - 2 * p1.y + p0.y);
    
    NURBS1stDerivative.mag = Math.hypot(NURBS1stDerivative.x, NURBS1stDerivative.y);
    NURBS1stDerivative.angle = Math.atan2(NURBS1stDerivative.y, NURBS1stDerivative.x) * (180 / Math.PI);
    NURBS2ndDerivative.mag = Math.hypot(NURBS2ndDerivative.x, NURBS2ndDerivative.y);
    NURBS2ndDerivative.angle = Math.atan2(NURBS2ndDerivative.y, NURBS2ndDerivative.x) * (180 / Math.PI);
}




/**Funções para bézier: 
 * Adaptadas de pseudocódigo disponível em https://pomax.github.io/bezierinfo/
*/

function deCasteljau(workingPoints, t) { 
    if (workingPoints.length === 1) {
        return workingPoints[0];
    }
    else{
        const newPoints = [];
        for (let i = 0; i < workingPoints.length - 1; i++) {
            newPoints.push({
                x: (1 - t) * workingPoints[i].x + t * workingPoints[i + 1].x,
                y: (1 - t) * workingPoints[i].y + t * workingPoints[i + 1].y,
                z: 0   //Não implementado, aplicação apenas 2D.
            });
        }
        return deCasteljau(newPoints, t);
    }
}


function calculateBezierTangentVectors(){   //Provavelmente OK
    /** Cap. 13 de https://pomax.github.io/bezierinfo/ */
    // Primeira derivada em t=1: B'(1) = degree*(P[n] - P[n-1])
    bezier1stDerivative.x = BEZIER_DEGREE * (bezierControlPoints[BEZIER_DEGREE].x - bezierControlPoints[BEZIER_DEGREE-1].x);
    bezier1stDerivative.y = BEZIER_DEGREE * (bezierControlPoints[BEZIER_DEGREE].y - bezierControlPoints[BEZIER_DEGREE-1].y);
    bezier1stDerivative.mag = Math.hypot(bezier1stDerivative.x, bezier1stDerivative.y);
    bezier1stDerivative.angle = Math.atan2(bezier1stDerivative.y, bezier1stDerivative.x) * (180 / Math.PI);
    
    // Segunda derivada em t=1: B''(1) = degree*(degree-1)*(P[degree] - 2*P[degree-1] + P[degree-2]) - verificar
    bezier2ndDerivative.x = BEZIER_DEGREE * (BEZIER_DEGREE - 1) * (bezierControlPoints[BEZIER_DEGREE].x - 2 * bezierControlPoints[BEZIER_DEGREE-1].x + bezierControlPoints[BEZIER_DEGREE-2].x);
    bezier2ndDerivative.y = BEZIER_DEGREE * (BEZIER_DEGREE - 1) * (bezierControlPoints[BEZIER_DEGREE].y - 2 * bezierControlPoints[BEZIER_DEGREE-1].y + bezierControlPoints[BEZIER_DEGREE-2].y);
    bezier2ndDerivative.mag = Math.hypot(bezier2ndDerivative.x, bezier2ndDerivative.y);
    bezier2ndDerivative.angle = Math.atan2(bezier2ndDerivative.y, bezier2ndDerivative.x) * (180 / Math.PI);
}


function checkContinuityLevel(){    // Revisar
    let continuityLevel = "C0";
    
    if (bezier1stDerivative.mag > 1e-4 && NURBS1stDerivative.mag > 1e-4) {
        const angleDiff = Math.abs(Math.abs(bezier1stDerivative.angle - NURBS1stDerivative.angle));
        
        if (angleDiff < 1) {
            if (Math.abs(bezier1stDerivative.mag - NURBS1stDerivative.mag) < 0.01) {
                continuityLevel = "C1";
                
                if (bezier2ndDerivative.mag > 1e-4 && NURBS2ndDerivative.mag > 1e-4) {
                    const angleDiff2nd = Math.abs(Math.abs(bezier2ndDerivative.angle - NURBS2ndDerivative.angle));
                    
                    if (angleDiff2nd < 1) {
                        if (Math.abs(bezier2ndDerivative.mag - NURBS2ndDerivative.mag) < 0.01) {
                            continuityLevel = "C2";
                        } else {
                            continuityLevel = "G2";
                        }
                    }
                }
            } else {
                continuityLevel = "G1";
            }
        }
    }
    return continuityLevel;
}
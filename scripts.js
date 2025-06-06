/** Variáveis Globais: */
let canvas, ctx;
let isUIMinimized = false;
const uiWrapper = document.getElementById('ui-controls-wrapper');
const minimizeToggle = document.getElementById('minimize-toggle');
const contextMenu = document.getElementById('pointContextMenu');

//Variáveis para interação com interface (contexto, arrasto, hover)
let selectedPointIndex = -1; // Ponto selecionado para configuração durante clique de botão direito.
let isDragging = false;
let dragPointIndex = -1;
let dragStartPos = { x: 0, y: 0 }; 
let hoverTimeout, debugTimeout;
let hoveredPointIndex = -1; //ponto sob o mouse durante tooltip

const POINT_HIT_THRESHOLD = 15; //proximidade máxima para clique com botão direito/arrastar
const ADD_POINT_THRESHOLD = POINT_HIT_THRESHOLD * 1.5;  //proximidade mínima para criação de novo ponto.

let selectedCurve = 'NURBS'; // or 'Bézier'
let NURBSknotVector = [];

let NURBScontrolPoints = [ //Curva inicial (pré-definida)
    { x: 390, y: 700, z: 0, weight: 1 },
    { x: 707, y: 727, z: 0, weight: 1 },
    { x: 480, y: 504, z: 0, weight: 1 },
    { x: 820, y: 450, z: 0, weight: 1 },
    { x: 410, y: 610, z: 0, weight: 1 },
    { x: 320, y: 550, z: 0, weight: 1 },
    { x: 410, y: 510, z: 0, weight: 1 },
    { x: 660, y: 680, z: 0, weight: 1 },
];

let bezierControlPoints = [ //Curva inicial (pré-definida)
    { x: 280, y: 600, z: 0 },
    { x:  60, y: 600, z: 0 },
    { x:  40, y: 490, z: 0 },
    { x: 230, y: 520, z: 0 },
    { x: 280, y: 550, z: 0 },
    { x:  60, y: 650, z: 0 },
    { x: 254, y: 688, z: 0 },
    { ...NURBScontrolPoints[0] },  //precisa ser também dinamicamente definido como igual ao primeiro ponto da NURBS ao alterar.
];

//Exercício requer grau 3, definido como variável para possibilitar generalização para segunda curva se aplicável.
//Não foi aplicável, segunda curva não é NURBS. A menos que decida reimplementar bézier como subset de NURBS.
const NURBS_DEGREE = 3; 
const BEZIER_DEGREE = bezierControlPoints.length-1; 

let zoomLevel = 1.0;
let zoomOrigin = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let isPanRelease = false;  // Tracks if we're handling a mouseup after panning

/** Usada em init e redumensionamento.
 * Configura canvas considerando resolução real
 * em qualquer nível de zoom ou em telas de alto DPI */
function setupCanvas() {  //OK
  const dpr = window.devicePixelRatio || 1; 
  const displayWidth = canvas.parentElement.clientWidth;
  const displayHeight = window.innerHeight;

  // Define tamanho do canvas (pixels "efetivos" do CSS)
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  // Define tamanho da renderização (pixels reais)
  // Arredondado para inteiro mais próximo para evitar blur em certos níveis de zoom
  canvas.width = Math.round(displayWidth * dpr);
  canvas.height = Math.round(displayHeight * dpr);

  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  draw();
}

/** Executada ao iniciar a aplicação. 
 * Configura canvas, vetor de nós e eventos de interação: */
function initCanvas() { //ok
  canvas = document.getElementById('curves-canvas');
  setupCanvas();  //usada em init e redumensionamento.

  setNURBSknotVector(); //calcula valor inicial para vetor de nós.

  // Event listeners
  minimizeToggle.addEventListener('click', toggleUIVisibility);

  window.addEventListener('resize',       setupCanvas);             //sempre reconfigura canvas após redimensionamento
  canvas.addEventListener('contextmenu',  openContextMenu);         
  canvas.addEventListener('click',        handleCanvasClick);       //cria novo ponto
  document.addEventListener('click',      handleDocumentClick);     //fecha menu de contexto
  canvas.addEventListener('mousedown',    handleMouseDown);         //inicia arrasto
  canvas.addEventListener('mousemove',    handleMouseMove);         //durante arrasto
  canvas.addEventListener('mouseup',      handleMouseUp);           //termina arrasto

  document.getElementById('showControlPolygon').addEventListener('change',  draw);
  document.getElementById('showControlPoints'). addEventListener('change',  draw);
  document.getElementById('showPointIndex').    addEventListener('change',  draw);
  document.getElementById('showKnots').         addEventListener('change',  draw);
  document.getElementById('showWeights').       addEventListener('change',  draw);
  document.getElementById('sampleCount').       addEventListener('input',   draw);

  document.getElementById("forceC1").addEventListener("change", enforceC1);   

  document.getElementById('setX').addEventListener('input', updatePointPosition);
  document.getElementById('setY').addEventListener('input', updatePointPosition);
  //setZ não necessário pois sempre é zero.

  document.getElementById('weightInput').addEventListener('input', updatePointWeight);
  document.getElementById('deletePoint').addEventListener('click', deleteSelectedPoint);

  //knot vector handling
  document.getElementById('NURBSknotVector'). addEventListener('input', validateNURBSknotVector);
  document.getElementById('resetKnots').      addEventListener('click', setNURBSknotVector);
  document.getElementById('applyKnots').      addEventListener('click', applyNURBSknotVector);

  canvas.addEventListener('wheel', handleWheel);
}


/****** Event Handlers */

function toggleUIVisibility() { //ok
    isUIMinimized = !isUIMinimized;
    
    if (isUIMinimized) {  //animação:
        uiWrapper.classList.add('minimized');
        uiWrapper.addEventListener('transitionend', () => {
            uiWrapper.style.zIndex = '-1';
        }, { once: true });
    } else {
        uiWrapper.style.zIndex = '10';
        // Force reflow to ensure the z-index change is applied before animation
        void uiWrapper.offsetHeight;
        uiWrapper.classList.remove('minimized');
    }
}

function openContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (isDragging) return;
  
  const { x, y } =      getCanvasCoords(canvas, e.clientX, e.clientY);
  selectedPointIndex =  findControlPointAtPosition(x, y);   //retorna -1 se não há ponto sob o clique

  if (selectedPointIndex >= 0) {  //se clique acertou um ponto
    const currentPoints = selectedCurve === 'NURBS' ? NURBScontrolPoints : bezierControlPoints;
    const point = currentPoints[selectedPointIndex];
    document.getElementById('contextCurveTitle').textContent = selectedCurve;
    document.getElementById('setX').value = Math.round(point.x);
    document.getElementById('setY').value = Math.round(point.y);
    document.getElementById('setZ').value = Math.round(point.z);
    
    // Habilita peso apenas para NURBS:
    const weightInput = document.getElementById('weightInput');
    weightInput.value = selectedCurve === 'NURBS' ? point.weight : 1;
    weightInput.disabled = selectedCurve !== 'NURBS';
    // Habilita remoção de pontos apenas para NURBS (e apenas em pontos específicos cf. C1)
    const deleteOption = document.getElementById('deletePoint');
    const forceC1 = document.getElementById("forceC1").checked
    if (forceC1){ 
      deleteOption.classList.toggle('hidden-option', (selectedCurve !== 'NURBS' || selectedPointIndex === 0 || selectedPointIndex === 1 || NURBScontrolPoints.length <= (NURBS_DEGREE+1)));
      if (selectedPointIndex == 0 || selectedPointIndex == 1) weightInput.disabled = true;
    } else {  //sem C1, apenas ponto 0 é obrigatório.
      deleteOption.classList.toggle('hidden-option', (selectedCurve !== 'NURBS' || selectedPointIndex === 0 || NURBScontrolPoints.length <= (NURBS_DEGREE+1)));
    }

    //Evita que o menu de contexto apareça fora do viewport se ponto está próximo das bordas direita/inferior:
    contextMenu.style.left = (e.clientX + 160 > window.innerWidth)? `${e.clientX - 155}px`:`${e.clientX + 5}px`;
    contextMenu.style.top = (e.clientY + 260 > window.innerHeight)? 
      ((selectedCurve == "NURBS")? `${e.clientY - 260}px`:`${e.clientY - 220}px`):  //NURBS pode possuir uma opção a mais.
      `${e.clientY + 2}px`;

    contextMenu.classList.add('visible');//abertura animada
  } else {  //clique direito fora da área de qualquer ponto apenas fecha menu de contexto existente.
    closeContextMenu();
  }
}

//Fechamento animado do menu de contexto. Inofensivo se chamado sem menu aberto:
function closeContextMenu() {  
  contextMenu.classList.remove('visible');
  selectedPointIndex = -1;
  hidePointInfoPopup(); 
}

/** fecha menu de contexto com clique em qualquer lugar:
 * Necessário para identificar cliques dentro do próprio menu de contexto!*/
function handleDocumentClick(e) { 
  if (isContextMenuOpen() && !contextMenu.contains(e.target)) {
    closeContextMenu();
  }
}

function handleCanvasClick(e) {
  if (isPanRelease) {
    isPanRelease = false;
    return;
  }
  
  if (!isContextMenuOpen() && e.button === 0 && !isDragging && !isPanning) {
    const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
    
    if (findControlPointAtPosition(x, y, ADD_POINT_THRESHOLD) === -1) {
      NURBScontrolPoints.push({ x, y, z: 0, weight: 1 });
      setNURBSknotVector();
      draw();
    }
  }
}
function handleWheel(e) {
  e.preventDefault();
  
  // Store current mouse position before resetting pan
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const newZoom = Math.min(Math.max(1.0, zoomLevel + delta), 4.0);

  if (newZoom !== zoomLevel) {
    zoomLevel = newZoom;
    zoomOrigin = { x, y };
    draw();
  }
}

function handleMouseDown(e) {
  if (e.button !== 0) return; //apenas botão esquerdo é utilizado.
  
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  dragStartPos = { x, y };
  dragPointIndex = findControlPointAtPosition(x, y);
  
  if (dragPointIndex >= 0) {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
    if (dragPointIndex <= 3) {
      showDebugPopup();
      draw()
    }
  } else {
      isPanning = true;
      isPanRelease = false;  // Reset on new pan start
      panStart = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
  }
}


function handleMouseUp() {
  if (isDragging) {
    isDragging = false;
    dragPointIndex = -1;
    canvas.style.cursor = '';
  } else if (isPanning) {
    isPanning = false;
    canvas.style.cursor = '';
    // No need to set anything here - isPanRelease already tracks if we panned
  }
  hidePointInfoPopup();
}

function handleMouseMove(e) {
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  
  if (isPanning) {
    const newOffsetX = panOffset.x + (e.clientX - panStart.x);
    const newOffsetY = panOffset.y + (e.clientY - panStart.y);
    
    // Calculate max pan based on zoom level (no panning at 100% zoom)
    const maxPanX = canvas.width * (zoomLevel - 1) / 2;
    const maxPanY = canvas.height * (zoomLevel - 1) / 2;
    
    // Apply bounds checking
    panOffset.x = Math.max(-maxPanX, Math.min(maxPanX, newOffsetX));
    panOffset.y = Math.max(-maxPanY, Math.min(maxPanY, newOffsetY));
    
    panStart = { x: e.clientX, y: e.clientY };
    isPanRelease = true;  // Mark that actual panning occurred
    draw();
    return;
  }
  if (isDragging) { //se estiver arrastando ponto:
    hidePointInfoPopup(); //garante que última tooltip não continue visível
    closeContextMenu();   //garante que último menu de contexto não continue visível
    handlePointMovement(dragPointIndex, x, y);
    draw();
    return;
  }  

  // verifica se há ponto sob o cursor para exibir tooltip após 0,5s:
  const pointIndex = findControlPointAtPosition(x, y);
  if (pointIndex !== hoveredPointIndex) {
    clearTimeout(hoverTimeout);
    hidePointInfoPopup();
    
    if (pointIndex >= 0 && !isContextMenuOpen()) {
      hoverTimeout = setTimeout(() => {
        showPointInfoPopup(e, pointIndex);
      }, 500);
    }
    hoveredPointIndex = pointIndex;
  }
}

function showPointInfoPopup(e, pointIndex) {
  if (isContextMenuOpen()) return;
  
  const point = selectedCurve === 'NURBS' 
    ? NURBScontrolPoints[pointIndex] 
    : bezierControlPoints[pointIndex];
  
  document.getElementById('curveType'). textContent = selectedCurve;
  document.getElementById('pointIndex').textContent = pointIndex;
  document.getElementById('pointX').    textContent = Math.round(point.x);
  document.getElementById('pointY').    textContent = Math.round(point.y);
  document.getElementById('pointZ').    textContent = Math.round(point.z);
  
  const weightElement = document.getElementById('pointWeight');
  weightElement.textContent = ((selectedCurve === 'NURBS') ? point.weight.toFixed(1) : '1.0');
  weightElement.parentElement.style.display = ((selectedCurve === 'NURBS') ? 'flex' : 'none');
  
  const popup = document.getElementById('pointInfoPopup');
  popup.style.left = `${e.clientX + 15}px`;
  popup.style.top = `${e.clientY + 15}px`;
  
  //Evita que o popup apareça fora do viewport se ponto está próximo das bordas direita/inferior:
  popup.style.left = (e.clientX + 210 > window.innerWidth)? `${e.clientX - 210}px`:`${e.clientX + 15}px`;
  popup.style.top = (e.clientY + 100 > window.innerHeight)? `${e.clientY - 100}px`:`${e.clientY + 15}px`;

  popup.classList.add('visible');
  hoveredPointIndex = pointIndex;
}

function hidePointInfoPopup() { //fechamento animado:
  const popup = document.getElementById('pointInfoPopup');
  setTimeout(() => {
    popup.classList.remove('visible');
    hoveredPointIndex = -1;
  }, 300);
}




















// let bezier1stDerivative = {x:45, y:45, mag:0, angle:0}  //global pois é usado por showDebugPopup() e drawTangentVectors()
// let NURBS1stDerivative = {x:45, y:45, mag:0, angle:0}


// function calculateTangentVectors() {
//   bezier1stDerivative.x = BEZIER_DEGREE * (bezierControlPoints[7].x - bezierControlPoints[6].x); /** Cap. 13 de https://pomax.github.io/bezierinfo/ */
//   bezier1stDerivative.y = BEZIER_DEGREE * (bezierControlPoints[7].y - bezierControlPoints[6].y);
//   bezier1stDerivative.mag = Math.hypot(bezier1stDerivative.x, bezier1stDerivative.y);
//   bezier1stDerivative.angle = Math.atan2(bezier1stDerivative.y, bezier1stDerivative.x) * (180 / Math.PI);
  
//   /**Mágica, revisar: */
//   const nurbsP0 = NURBScontrolPoints[0];
//   const nurbsP1 = NURBScontrolPoints[1];
//   const knotDiff = NURBSknotVector[NURBS_DEGREE + 1] - NURBSknotVector[1];
//   const weightRatio = nurbsP1.weight / nurbsP0.weight;
//   const nurbsFactor = NURBS_DEGREE / knotDiff;
  
//   NURBS1stDerivative.x = nurbsFactor * weightRatio * (nurbsP1.x - nurbsP0.x);
//   NURBS1stDerivative.y = nurbsFactor * weightRatio * (nurbsP1.y - nurbsP0.y);
//   NURBS1stDerivative.mag = Math.hypot(NURBS1stDerivative.x, NURBS1stDerivative.y);
//   NURBS1stDerivative.angle = Math.atan2(NURBS1stDerivative.y, NURBS1stDerivative.x) * (180 / Math.PI);
//   /** Fim dá mágica */

//   let continuityLevel = "C0";
  
//   if (bezier1stDerivative.mag > 1e-4 && NURBS1stDerivative.mag > 1e-4) {
//     const angleDiff = Math.abs(Math.abs(bezier1stDerivative.angle - NURBS1stDerivative.angle));
    
//     if (angleDiff < 1) {
//       if (Math.abs(bezier1stDerivative.mag - NURBS1stDerivative.mag) < 0.01) {
//         continuityLevel = "C1";
//       } else {
//         continuityLevel = "G1";
//       }
//     }
//   }

//   return {
//     bezierMag: bezier1stDerivative.mag,
//     bezierAngle: bezier1stDerivative.angle,
//     nurbsMag: NURBS1stDerivative.mag,
//     nurbsAngle: NURBS1stDerivative.angle,
//     continuityLevel
//   };
// }


// Global variables
let bezier1stDerivative = {x: 0, y: 0, mag: 0, angle: 0};
let bezier2ndDerivative = {x: 0, y: 0, mag: 0, angle: 0};
let NURBS1stDerivative = {x: 0, y: 0, mag: 0, angle: 0};
let NURBS2ndDerivative = {x: 0, y: 0, mag: 0, angle: 0};

function calculateNURBSTangentVectors() {

    /** Mágica DS v3 0324: */
    // NURBS first derivative:
    const nurbsP0 = NURBScontrolPoints[0];
    const nurbsP1 = NURBScontrolPoints[1];
    const knotDiff = NURBSknotVector[NURBS_DEGREE + 1] - NURBSknotVector[1];
    const weightRatio = nurbsP1.weight / nurbsP0.weight;
    const nurbsFactor = NURBS_DEGREE / knotDiff;
    
    NURBS1stDerivative.x = nurbsFactor * weightRatio * (nurbsP1.x - nurbsP0.x);
    NURBS1stDerivative.y = nurbsFactor * weightRatio * (nurbsP1.y - nurbsP0.y);
    NURBS1stDerivative.mag = Math.hypot(NURBS1stDerivative.x, NURBS1stDerivative.y);
    NURBS1stDerivative.angle = Math.atan2(NURBS1stDerivative.y, NURBS1stDerivative.x) * (180 / Math.PI);

    // NURBS second derivative
    if (NURBScontrolPoints.length >= NURBS_DEGREE + 1) {
        const k = NURBS_DEGREE;
        const span = NURBS_DEGREE; // For clamped curves, we're evaluating at end (span = degree)
        
        // Get relevant control points and weights
        const p0 = NURBScontrolPoints[0];
        const p1 = NURBScontrolPoints[1];
        const p2 = NURBScontrolPoints[2];
        const w0 = p0.weight;
        const w1 = p1.weight;
        const w2 = p2.weight;
        
        // Get knot differences - need to handle multiplicity
        const u = NURBSknotVector;
        const u0 = u[span];
        const u1 = u[span+1];
        const u2 = u[span+2];
        
        // Check if we're at a clamped endpoint with knot multiplicity
        const isClampedStart = (span < k && u[0] === u[span]);
        const isClampedEnd = (span >= u.length - k - 1 && u[span] === u[u.length-1]);
        
        if (isClampedStart || isClampedEnd) {
            // Simplified formula for clamped endpoints (knot multiplicity = degree + 1)
            // Same as Bézier but weighted
            const weightRatio = w2 / w0;
            NURBS2ndDerivative.x = k * (k - 1) * weightRatio * (p2.x - 2 * p1.x + p0.x);
            NURBS2ndDerivative.y = k * (k - 1) * weightRatio * (p2.y - 2 * p1.y + p0.y);
        } else {
            // General case formula (accounting for possible interior knot multiplicity)
            const denom1 = (u1 - u0);
            const denom2 = (u2 - u0);
            
            // First term requires u1 ≠ u0 and u2 ≠ u0
            let term1x = 0, term1y = 0;
            if (denom1 !== 0 && denom2 !== 0) {
                const temp = k * (k - 1) * (w2/w0) / (denom1 * denom2);
                term1x = temp * (p2.x - 2 * p1.x + p0.x);
                term1y = temp * (p2.y - 2 * p1.y + p0.y);
            }
            
            // Second term components
            let term2_part1x = 0, term2_part1y = 0;
            let term2_part2x = 0, term2_part2y = 0;
            
            if ((u2 - u1) !== 0) {
                const temp = (w2/w0) / (u2 - u1);
                term2_part1x = temp * (p2.x - p1.x);
                term2_part1y = temp * (p2.y - p1.y);
            }
            
            if ((u1 - u0) !== 0) {
                const temp = (w1/w0) / (u1 - u0);
                term2_part2x = temp * (p1.x - p0.x);
                term2_part2y = temp * (p1.y - p0.y);
            }
            
            const term2x = (denom2 !== 0) ? k * (term2_part1x - term2_part2x) / denom2 : 0;
            const term2y = (denom2 !== 0) ? k * (term2_part1y - term2_part2y) / denom2 : 0;
            
            NURBS2ndDerivative.x = term1x + term2x;
            NURBS2ndDerivative.y = term1y + term2y;
        }
        
        // Calculate magnitude and angle
        NURBS2ndDerivative.mag = Math.hypot(NURBS2ndDerivative.x, NURBS2ndDerivative.y);
        NURBS2ndDerivative.angle = Math.atan2(NURBS2ndDerivative.y, NURBS2ndDerivative.x) * (180 / Math.PI);
    } else {
        // Not enough control points
        NURBS2ndDerivative.x = NURBS2ndDerivative.y = 0;
        NURBS2ndDerivative.mag = 0;
        NURBS2ndDerivative.angle = 0;
    }
}

function calculateBezierTangentVectors(){
    /** Cap. 13 de https://pomax.github.io/bezierinfo/ */
    // Primeira derivada em t=1: B'(1) = degree*(P[n] - P[n-1])
    bezier1stDerivative.x = BEZIER_DEGREE * (bezierControlPoints[BEZIER_DEGREE].x - bezierControlPoints[BEZIER_DEGREE-1].x);
    bezier1stDerivative.y = BEZIER_DEGREE * (bezierControlPoints[BEZIER_DEGREE].y - bezierControlPoints[BEZIER_DEGREE-1].y);
    bezier1stDerivative.mag = Math.hypot(bezier1stDerivative.x, bezier1stDerivative.y);
    bezier1stDerivative.angle = Math.atan2(bezier1stDerivative.y, bezier1stDerivative.x) * (180 / Math.PI);
    
    // Segunda derivada em t=1: B''(1) = degree*(degree-1)*(P[degree] - 2*P[degree-1] + P[degree-2])
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
                
                // Check for C2 continuity
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

function showDebugPopup() {
    clearTimeout(debugTimeout);
    const debugPopup = document.getElementById('debugPopup');
    calculateBezierTangentVectors();
    calculateNURBSTangentVectors(); //calcula tangentes e armazena em variável global (usada também por drawTangentVectors)
    let continuityLevel= checkContinuityLevel();
    
    // Update the display
    document.getElementById('bezierMagnitude').textContent = bezier1stDerivative.mag.toFixed(3);
    document.getElementById('bezierAngle').textContent = bezier1stDerivative.angle.toFixed(2);
    document.getElementById('NURBSmagnitude').textContent = NURBS1stDerivative.mag.toFixed(3);
    document.getElementById('NURBSangle').textContent = NURBS1stDerivative.angle.toFixed(2);
    
    document.getElementById('bezierMagnitude2').textContent = bezier2ndDerivative.mag.toFixed(3);
    document.getElementById('bezierAngle2').textContent = bezier2ndDerivative.angle.toFixed(2);
    document.getElementById('NURBSmagnitude2').textContent = NURBS2ndDerivative.mag.toFixed(3);
    document.getElementById('NURBSangle2').textContent = NURBS2ndDerivative.angle.toFixed(2);

    document.getElementById('continuityLevel').textContent = continuityLevel;
    
    debugPopup.classList.add('visible');
    debugTimeout = setTimeout(() => {
        debugPopup.classList.remove('visible');
        draw();
    }, 5000);
}





/** Reajusta pontos para garantir C1 ao ativar a opção
 * Chamada por evento de checkbox:
 * Corrigido para considerar diferença de grau entre curvas:
*/
function enforceC1() {
  const forceC1 = document.getElementById("forceC1").checked;
  if (forceC1){
    const point0 = bezierControlPoints[BEZIER_DEGREE];
    const referenceVec = {
      x: (bezierControlPoints[BEZIER_DEGREE - 1].x - point0.x) / NURBS_DEGREE * BEZIER_DEGREE,    //empírico
      y: (bezierControlPoints[BEZIER_DEGREE - 1].y - point0.y) / NURBS_DEGREE * BEZIER_DEGREE,
    };
    
    NURBScontrolPoints[1].x = point0.x - referenceVec.x;
    NURBScontrolPoints[1].y = point0.y - referenceVec.y;
    NURBScontrolPoints[1].weight = 1 //fixa peso em 1 para ponto
  }
  showDebugPopup()
  draw();
}




/*** Gerenciamento geral de movimentação de pontos: 
 * usado tanto por arrasto quanto por entradas numéricas x,y do menu de contexto.
 * Inclui casos especiais.
*/
function handlePointMovement(pointIndex, newX, newY) { 
  // const forceC0 = document.getElementById("forceC0").checked   //não implementado
  const forceC1 = document.getElementById("forceC1").checked
  // const forceC2 = document.getElementById("forceC2").checked   //a implementar

  if (selectedCurve === 'NURBS') {
      if (pointIndex <= NURBS_DEGREE ) showDebugPopup();  //Sempre exibe popup para movimento de pontos próximos de 0
      if (pointIndex === 0) { //casos especiais para ponto 0
          //obtém valores anteriores antes de atualizar (caso necessário para forceC1)
          const prevX = bezierControlPoints[BEZIER_DEGREE].x;
          const prevY = bezierControlPoints[BEZIER_DEGREE].y;
          //Sempre garante C0:
          bezierControlPoints[BEZIER_DEGREE].x = newX;
          bezierControlPoints[BEZIER_DEGREE].y = newY;
          NURBScontrolPoints[0].x = newX;
          NURBScontrolPoints[0].y = newY;
          if (forceC1){ //ao manipular ponto inicial da NURBS, ajusta automaticamente os pontos adjacentes
              const deltaX = newX - prevX;
              const deltaY = newY - prevY;
            
              bezierControlPoints[BEZIER_DEGREE-1].x += deltaX;
              bezierControlPoints[BEZIER_DEGREE-1].y += deltaY;

              NURBScontrolPoints[1].x += deltaX;
              NURBScontrolPoints[1].y += deltaY;
          }
      } else if (pointIndex === 1 && forceC1) { 
          const point0 = NURBScontrolPoints[0];
          const newVec = { x: newX - point0.x, y: newY - point0.y };
          NURBScontrolPoints[1].x = newX;
          NURBScontrolPoints[1].y = newY;
          bezierControlPoints[BEZIER_DEGREE-1].x = point0.x - (newVec.x / BEZIER_DEGREE * NURBS_DEGREE);
          bezierControlPoints[BEZIER_DEGREE-1].y = point0.y - (newVec.y / BEZIER_DEGREE * NURBS_DEGREE);
      } else {  //caso geral
          NURBScontrolPoints[pointIndex].x = newX;
          NURBScontrolPoints[pointIndex].y = newY;
      }
  } else {  //bézier:
      if (pointIndex >= NURBS_DEGREE ) showDebugPopup();  //Sempre exibe popup para movimento de pontos próximos de NURBS inicial (bézier final)
      if (pointIndex === BEZIER_DEGREE) { //casos especiais para último ponto de bézier
          //obtém valores anteriores antes de atualizar (caso necessário para forceC1)
          const prevX = bezierControlPoints[BEZIER_DEGREE].x;
          const prevY = bezierControlPoints[BEZIER_DEGREE].y;
          //Sempre garante C0:
          bezierControlPoints[BEZIER_DEGREE].x = newX;
          bezierControlPoints[BEZIER_DEGREE].y = newY;
          NURBScontrolPoints[0].x = newX;
          NURBScontrolPoints[0].y = newY;
          if (forceC1){ //ao manipular ponto final da bézier, ajusta automaticamente os pontos adjacentes
              const deltaX = newX - prevX;
              const deltaY = newY - prevY;
        
              bezierControlPoints[BEZIER_DEGREE-1].x += deltaX;
              bezierControlPoints[BEZIER_DEGREE-1].y += deltaY;

              NURBScontrolPoints[1].x += deltaX;
              NURBScontrolPoints[1].y += deltaY;
          }
      } else if (pointIndex === BEZIER_DEGREE-1 && forceC1) { //ponto adjacente ao ponto final.
        const point0 = bezierControlPoints[BEZIER_DEGREE];
        const newVec = { x: newX - point0.x, y: newY - point0.y };

        bezierControlPoints[BEZIER_DEGREE-1].x = newX;
        bezierControlPoints[BEZIER_DEGREE-1].y = newY;
        NURBScontrolPoints[1].x = point0.x - (newVec.x /  NURBS_DEGREE * BEZIER_DEGREE);
        NURBScontrolPoints[1].y = point0.y - (newVec.y /  NURBS_DEGREE * BEZIER_DEGREE);
      } else {  //caso geral
          bezierControlPoints[pointIndex].x = newX;
          bezierControlPoints[pointIndex].y = newY;
      }
  }

}





















/*** Gerenciamento de pontos: */
function updatePointPosition() {
  if (selectedPointIndex >= 0) {  //usado por eventos de alteração no menu de contexto
    const x = parseFloat(document.getElementById('setX').value);
    const y = parseFloat(document.getElementById('setY').value);
    handlePointMovement(selectedPointIndex, x, y, true);
    draw();
  }
}

function updatePointWeight() {
  if (selectedPointIndex >= 0 && selectedCurve === 'NURBS') {
    const weight = parseFloat(document.getElementById('weightInput').value);
    if (!isNaN(weight)) { //garante valor válido proveniente do campo antes de atualizar variável:
      NURBScontrolPoints[selectedPointIndex].weight = weight;
      draw();
      if (selectedPointIndex === 0 || selectedPointIndex === 1) {
        showDebugPopup();
      }
    }
  }
}

function deleteSelectedPoint() {  //usada por clique em remover ponto (apenas NURBS). Remove o ponto atualmente selecionado cf. selectedPointIndex 
  if (selectedPointIndex >= 0 && NURBScontrolPoints.length > 4) { // não dev acontecer, de qualquer forma pois o botão é oculto com <4 pontos, mas não custa.
    NURBScontrolPoints.splice(selectedPointIndex, 1);
    selectedPointIndex = -1;
    setNURBSknotVector(); //redefine vetor de nós para nova quantidade de pontos;
    draw();
    closeContextMenu(); //após draw() para não atrasar renderização durante animação do menu.
  }
}


/*** Gerenciamento de vetor de nós: */
function validateNURBSknotVector() {  //OK
  const knotInput = document.getElementById('NURBSknotVector');
  const applyButton = document.getElementById('applyKnots');
  const resetButton = document.getElementById('resetKnots');
  const inputText = knotInput.value.trim();
  
  // Validação básica:
  if (!/^([-+]?\d*\.?\d+\s*,\s*)*[-+]?\d*\.?\d+$/.test(inputText)) {
    knotInput.setCustomValidity('Insira uma lista de números separados por vírgula. O separador decimal é o ponto.');
    knotInput.reportValidity();
    applyButton.style.display = 'none';
    resetButton.style.display = 'inline-block';
    return false;
  }
  
  const newKnots = inputText.split(',').map(str => parseFloat(str.trim()));
  
  // Verifica comprimento (grau + pontos de controle + 1)
  const minLength = NURBS_DEGREE + NURBScontrolPoints.length + 1;
  if (newKnots.length < minLength) {
    knotInput.setCustomValidity(`Vetor de nós precisa ter pelo menos ${minLength} valores para grau ${NURBS_DEGREE} com ${NURBScontrolPoints.length} pontos de controle`);
    knotInput.reportValidity();

    applyButton.style.display = 'none';
    resetButton.style.display = 'inline-block';
    
    return false;
  }
  
  // Verifica se sequência é crescente
  for (let i = 1; i < newKnots.length; i++) {
    if (newKnots[i] < newKnots[i-1]) {
      knotInput.setCustomValidity('Valores precisam ser crescentes.');
      knotInput.reportValidity();

      applyButton.style.display = 'none';
      resetButton.style.display = 'inline-block';

      return false;
    }
  }
  
  // Validação OK
  knotInput.setCustomValidity('');
  knotInput.reportValidity();
  applyButton.style.display = 'inline-block';
  resetButton.style.display = 'none';
  return true;
}

function applyNURBSknotVector() { // usada por evento de botão de aplicar:
    const inputText = document.getElementById('NURBSknotVector').value.trim();
    NURBSknotVector = inputText.split(',').map(parseFloat);

    document.getElementById('applyKnots').style.display = 'none';
    document.getElementById('resetKnots').style.display = 'inline-block';

    draw(); 
}

/**Define vetor de nós como valores padrão para o grau e número de pontos.
 * usado por initCanvas(), adição/remoção de ponto e evento de botão de reset.
 * Difere do padrão 0~1 porque a representação do vetor de nós fica mais legível
 * (apenas valores inteiros) e não ocorre diferença na curva pois NURBS 
 * considera apenas a distância relativa entre nós: */
function setNURBSknotVector() { //OK  //referenciar
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
    // Termina com 'grau+1' uns (1)
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
        drawTangentVector(bezier1stDerivative, '#F006');  //vetores calculados previamente por showDebugPopup();
        drawTangentVector(NURBS1stDerivative, '#0F04');
        drawTangentVector(bezier2ndDerivative, '#F806'); 
        drawTangentVector(NURBS2ndDerivative, '#08F4');
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
          ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
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
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#208030';
          ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#050'; 
            ctx.stroke();
        });
        bezierControlPoints.forEach((point) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
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





/*** Mágica: (Implementação DS V3 -- reescrever cf. livro. */
function basisFunction(i, p, u, knots) { //converter para De Boor
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


function deCasteljau(workingPoints, t) { //adaptado de pseudocódigo em https://pomax.github.io/bezierinfo/
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


/****** Helpers */
function getCanvasCoords(canvas, clientX, clientY) {  //OK
  const rect = canvas.getBoundingClientRect();
  const rawX = (clientX - rect.left);
  const rawY = (clientY - rect.top);
  
  return {
    x: (rawX - panOffset.x) / zoomLevel + zoomOrigin.x * (1 - 1/zoomLevel),
    y: (rawY - panOffset.y) / zoomLevel + zoomOrigin.y * (1 - 1/zoomLevel)
  };
}

function findControlPointAtPosition(x, y, threshold = POINT_HIT_THRESHOLD) {  //OK
  // Pré-calcula limites quadrados para evitar Math.sqrt():
  const zoomAdjustedThreshold = threshold / zoomLevel;
  const thresholdSquared = zoomAdjustedThreshold * zoomAdjustedThreshold;
    
  // Procura por pontos da NURBS na área sob o cursor/clique
  for (let i = NURBScontrolPoints.length - 1; i >= 0; i--) {
    const point = NURBScontrolPoints[i];
    const dx = x - point.x;
    const dy = y - point.y;
    if (dx * dx + dy * dy <= thresholdSquared) {
      selectedCurve = 'NURBS';
      return i;
    }
  }

  // Em seguida procura por pontos de bézier:
  for (let i = bezierControlPoints.length - 1; i >= 0; i--) {
    const point = bezierControlPoints[i];
    const dx = x - point.x;
    const dy = y - point.y;
    if (dx * dx + dy * dy <= thresholdSquared) {
      selectedCurve = 'Bézier';
      return i;
    }
  }

  return -1;
}

function isContextMenuOpen() {  return contextMenu.classList.contains('visible'); }  //OK
window.onload = initCanvas;
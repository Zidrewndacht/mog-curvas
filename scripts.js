let canvas, ctx;
let isUIMinimized = false;
const uiWrapper = document.getElementById('ui-controls-wrapper');
const minimizeToggle = document.getElementById('minimize-toggle');

let selectedCurve = 'NURBS'; // or 'Bézier'
const degree = 3; //Exercício requer grau 3, definido como variável para possibilitar generalização para segunda curva.
let NURBSknotVector = [];

let NURBScontrolPoints = [ //Curva inicial (pré-definida)
    { x: 590, y: 600, z: 0, weight: 1 },
    { x: 620, y: 700, z: 0, weight: 1 },
    { x: 700, y: 720, z: 0, weight: 1 },
    { x: 800, y: 200, z: 0, weight: 1 },
    { x: 790, y: 750, z: 0, weight: 0.5 },
    { x: 900, y: 600, z: 0, weight: 1 },
    { x: 700, y: 490, z: 0, weight: 1.25 },
    { x: 660, y: 550, z: 0, weight: 1 },
];

let bezierControlPoints = [ //Curva inicial (pré-definida)
    { ...NURBScontrolPoints[0] },  //precisa ser também dinamicamente definido como igual ao primeiro ponto da NURBS ao alterar.
    { x: 560, y: 500, z: 0 },
    { x: 450, y: 750, z: 0 },
    { x: 400, y: 500, z: 0 },
    { x: 350, y: 800, z: 0 },
    { x: 300, y: 550, z: 0 },
    { x: 250, y: 575, z: 0 },
    { x: 530, y: 650, z: 0 },
];

const contextMenu = document.getElementById('pointContextMenu');

//Variáveis para interação com interface (contexto, dragging, hover)
let selectedPointIndex = -1; // Ponto selecionado para configuração durante clique de botão direito.
let isDragging = false;
let dragPointIndex = -1;
let dragStartPos = { x: 0, y: 0 }; 
let hoverTimeout;
let hoveredPointIndex = -1;

const POINT_HIT_THRESHOLD = 15; //proximidade máxima para clique com botão direito/arrastar
const ADD_POINT_THRESHOLD = POINT_HIT_THRESHOLD * 1.5;  //proximidade mínima para criação de novo ponto.

function setupCanvas() { //usada em init e redumensionamento.
  const dpr = window.devicePixelRatio || 1;
  const container = canvas.parentElement || document.body;

  const displayWidth = container.clientWidth;
  const displayHeight = window.innerHeight;

  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;

  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  draw(); //renderiza novamente a cada alteração.
}

function initCanvas() {
  canvas = document.getElementById('curves-canvas');
  setupCanvas();  //usada em init e redumensionamento.

  updateNURBSknotVector(); //calcula valor inicial para vetor de nós.

  // Event listeners
  minimizeToggle.addEventListener('click', toggleUIVisibility);

  window.addEventListener('resize', setupCanvas); //sempre reconfigura canvas após redimensionamento
  canvas.addEventListener('contextmenu', handleRightClick);
  canvas.addEventListener('click', handleCanvasClick);
  document.addEventListener('click', handleDocumentClick);
  
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);

  document.getElementById('showControlPolygon').addEventListener('change', draw);
  document.getElementById('showControlPoints').addEventListener('change', draw);
  document.getElementById('showPointIndex').addEventListener('change', draw);
  document.getElementById('showKnots').addEventListener('change', draw);
  document.getElementById('showWeights').addEventListener('change', draw);
  document.getElementById('showKnots').addEventListener('change', draw);

  document.getElementById("forceC1").addEventListener("change", function() {
    if (this.checked) {
      enforceColinearity();
    }
  });

  document.getElementById('sampleCount').addEventListener('input', draw);

  document.getElementById('setX').addEventListener('input', updatePosition);
  document.getElementById('setY').addEventListener('input', updatePosition);

  //setZ não necessário pois sempre é zero.
  document.getElementById('weightInput').addEventListener('input', updatePointWeight);
  document.getElementById('deletePoint').addEventListener('click', deleteSelectedPoint);

  //knot vector handling
  document.getElementById('NURBSknotVector').addEventListener('input', validateNURBSknotVector);
  document.getElementById('resetKnots').addEventListener('click', resetNURBSknotVector);
  document.getElementById('applyKnots').addEventListener('click', applyNURBSknotVector);

}


/****** Event Handlers */

function toggleUIVisibility() {
    isUIMinimized = !isUIMinimized;
    
    if (isUIMinimized) {
        uiWrapper.classList.add('minimized');
        uiWrapper.addEventListener('transitionend', () => {
            uiWrapper.style.zIndex = '-1';
        }, { once: true });
        minimizeToggle.textContent = '⛭';
    } else {
        uiWrapper.style.zIndex = '10';
        // Force reflow to ensure the z-index change is applied before animation
        void uiWrapper.offsetHeight;
        uiWrapper.classList.remove('minimized');
        minimizeToggle.textContent = '⛭';
    }
}

function handleRightClick(e) {  // abre menu de contexto
  e.preventDefault();
  e.stopPropagation();
  
  if (isDragging) return;
  
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  selectedPointIndex = findControlPointAtPosition(x, y);

  if (selectedPointIndex >= 0) {
    const currentPoints = selectedCurve === 'NURBS' ? NURBScontrolPoints : bezierControlPoints;
    const point = currentPoints[selectedPointIndex];
    document.getElementById('contextCurveTitle').textContent = selectedCurve;
    document.getElementById('setX').value = Math.round(point.x);
    document.getElementById('setY').value = Math.round(point.y);
    document.getElementById('setZ').value = Math.round(point.z);
    
    // Only show weight for NURBS points
    const weightInput = document.getElementById('weightInput');
    weightInput.value = selectedCurve === 'NURBS' ? point.weight : 1;
    weightInput.disabled = selectedCurve !== 'NURBS';

    const deleteOption = document.getElementById('deletePoint');
    const forceC1 = document.getElementById("forceC1").checked
    if (forceC1){
      deleteOption.classList.toggle('hidden-option', 
        selectedCurve !== 'NURBS' || selectedPointIndex === 0 || selectedPointIndex === 1 || NURBScontrolPoints.length <= 4);
      if (selectedPointIndex == 0 || selectedPointIndex == 1) weightInput.disabled = true;
    } else {
    deleteOption.classList.toggle('hidden-option', 
      selectedCurve !== 'NURBS' || selectedPointIndex === 0 || NURBScontrolPoints.length <= 4);
    }
    // Impede de remover pontos de bézier, pontos comuns e pontos colineares.
    
    
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.remove('hidden');
    contextMenu.classList.add('visible');
  } else {
    closeContextMenu();
  }
}

function handleDocumentClick(e) {   //fecha menu de contexto:
  if (isContextMenuOpen() && !contextMenu.contains(e.target)) {
    closeContextMenu();
  }
}

//Fechamento animado do menu de contexto
function closeContextMenu() {  
  contextMenu.classList.remove('visible');
  setTimeout(() => {
    contextMenu.classList.add('hidden');
    selectedPointIndex = -1;
  }, 200);
  hidePointInfoPopup(); 
}

function handleCanvasClick(e) {
  if (!isContextMenuOpen() && e.button === 0 && !isDragging) {
    const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
    
    // Only allow adding to NURBS curve
    if (findControlPointAtPosition(x, y, ADD_POINT_THRESHOLD) === -1) {
      NURBScontrolPoints.push({ x, y, z: 0, weight: 1 });
      updateNURBSknotVector();
      draw();
    }
  }
}
function handleMouseDown(e) {
  if (e.button !== 0) return;
  
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  dragStartPos = { x, y };
  dragPointIndex = findControlPointAtPosition(x, y);
  
  if (dragPointIndex >= 0) {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
  }
}


function handleMouseUp() {
  if (isDragging) {
    isDragging = false;
    dragPointIndex = -1;
    canvas.style.cursor = '';
  }
  hidePointInfoPopup();
}

function showPointInfoPopup(e, pointIndex) {
  if (isContextMenuOpen()) return;
  
  const point = selectedCurve === 'NURBS' 
    ? NURBScontrolPoints[pointIndex] 
    : bezierControlPoints[pointIndex];
  
  document.getElementById('curveType').textContent = selectedCurve;
  document.getElementById('pointIndex').textContent = pointIndex;
  document.getElementById('pointX').textContent = Math.round(point.x);
  document.getElementById('pointY').textContent = Math.round(point.y);
  document.getElementById('pointZ').textContent = Math.round(point.z);
  
  const weightElement = document.getElementById('pointWeight');
  weightElement.textContent = selectedCurve === 'NURBS' 
    ? point.weight.toFixed(1) 
    : '1.0';
  weightElement.parentElement.style.display = selectedCurve === 'NURBS' 
    ? 'flex' 
    : 'none';
  
  const popup = document.getElementById('pointInfoPopup');
  popup.style.left = `${e.clientX + 15}px`;
  popup.style.top = `${e.clientY + 15}px`;
  popup.classList.remove('hidden');
  popup.classList.add('visible');
  hoveredPointIndex = pointIndex;
}

function hidePointInfoPopup() {
  const popup = document.getElementById('pointInfoPopup');
  popup.classList.remove('visible');
  setTimeout(() => {
    popup.classList.add('hidden');
    hoveredPointIndex = -1;
  }, 200);
}

function enforceColinearity() {
  const forceC1 = document.getElementById("forceC1").checked;
  if (!forceC1 ) return;

  const point0 = bezierControlPoints[0];
  const referenceVec = {
    x: bezierControlPoints[1].x - point0.x,
    y: bezierControlPoints[1].y - point0.y
  };
  
  NURBScontrolPoints[1].x = point0.x - referenceVec.x;
  NURBScontrolPoints[1].y = point0.y - referenceVec.y;
  NURBScontrolPoints[1].weight = 1 //force weight (also disabled by context menu when forceC1 enabled)
  draw();
}

/*** General point movement handler */
function handlePointMovement(pointIndex, newX, newY) {  //usado por dragging e entradas numéricas x,y do menu de contexto.
  // const forceC0 = document.getElementById("forceC0").checked
  const forceC1 = document.getElementById("forceC1").checked
  // const forceC2 = document.getElementById("forceC2").checked

  if (pointIndex === 0) {
    const prevX = bezierControlPoints[0].x;
    const prevY = bezierControlPoints[0].y;
    
    bezierControlPoints[0].x = newX;
    bezierControlPoints[0].y = newY;
    NURBScontrolPoints[0].x = newX;
    NURBScontrolPoints[0].y = newY;
    if (forceC1){
      const deltaX = newX - prevX;
      const deltaY = newY - prevY;
    
      bezierControlPoints[1].x += deltaX;
      bezierControlPoints[1].y += deltaY;

      NURBScontrolPoints[1].x += deltaX;
      NURBScontrolPoints[1].y += deltaY;
    }
  } else if (pointIndex === 1 && forceC1) { //caso colinearidade seja obrigatória:
    const point0 = bezierControlPoints[0];
    const newVec = { x: newX - point0.x, y: newY - point0.y };
    
    if (selectedCurve === 'NURBS') {
      NURBScontrolPoints[1].x = newX;
      NURBScontrolPoints[1].y = newY;
      bezierControlPoints[1].x = point0.x - newVec.x;
      bezierControlPoints[1].y = point0.y - newVec.y;
    } else {
      bezierControlPoints[1].x = newX;
      bezierControlPoints[1].y = newY;
      NURBScontrolPoints[1].x = point0.x - newVec.x;
      NURBScontrolPoints[1].y = point0.y - newVec.y;
    }
  } else {
    if (selectedCurve === 'NURBS') {
      NURBScontrolPoints[pointIndex].x = newX;
      NURBScontrolPoints[pointIndex].y = newY;
    } else {
      bezierControlPoints[pointIndex].x = newX;
      bezierControlPoints[pointIndex].y = newY;
    }
  }
}

function handleMouseMove(e) {
  if (isDragging) {
    hidePointInfoPopup();
    closeContextMenu();
    requestAnimationFrame(() => {
      const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
      handlePointMovement(dragPointIndex, x, y);
      draw();
    });
    return;
  }
  
  // Handle hover 
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
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

/*** Point management: */
function updatePosition() {
  if (selectedPointIndex >= 0) {
    const x = parseFloat(document.getElementById('setX').value);
    const y = parseFloat(document.getElementById('setY').value);
    handlePointMovement(selectedPointIndex, x, y, true);
    draw();
  }
}

function updatePointWeight() {
  if (selectedPointIndex >= 0 && selectedCurve === 'NURBS') {
    const weight = parseFloat(document.getElementById('weightInput').value);
    if (!isNaN(weight)) {
      NURBScontrolPoints[selectedPointIndex].weight = weight;
      draw();
    }
  }
}

function deleteSelectedPoint() {  //usada por clique em remover ponto. Remove o ponto da NURBS atualmente selecionado cf. selectedPointIndex
  if (selectedPointIndex >= 0 && NURBScontrolPoints.length > 4) { // não deve acontecer, de qualquer forma pois o botão é oculto com <4 pontos, mas não custa.
    NURBScontrolPoints.splice(selectedPointIndex, 1);
    selectedPointIndex = -1;
    updateNURBSknotVector(); 
    draw();
    closeContextMenu(); //após draw() para não atrasar renderização durante animação do menu.
  }
}



/*** Gerenciamento de vetor de nós: */

function validateNURBSknotVector() {
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
  const minLength = degree + NURBScontrolPoints.length + 1;
  if (newKnots.length < minLength) {
    knotInput.setCustomValidity(`Vetor de nós precisa ter pelo menos ${minLength} valores para grau ${degree} com ${NURBScontrolPoints.length} pontos de controle`);
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

function applyNURBSknotVector() {
    const inputText = document.getElementById('NURBSknotVector').value.trim();
    NURBSknotVector = inputText.split(',').map(parseFloat);

    document.getElementById('applyKnots').style.display = 'none';
    document.getElementById('resetKnots').style.display = 'inline-block';

    draw(); 
}

function updateNURBSknotVectorDisplay() {  //usado por updateNURBSknotVector e resetNURBSknotVector
  // Limita exibição a 3 casas decimais:
  const formattedKnots = NURBSknotVector.map(k => {
    const num = typeof k === 'string' ? parseFloat(k) : k;
    return num % 1 === 0 ? num.toString() : parseFloat(num.toFixed(3)).toString();
  });
  document.getElementById('NURBSknotVector').value = formattedKnots.join(', ');
}

function updateNURBSknotVector() {
  const requiredLength = degree + NURBScontrolPoints.length + 1;
  if (NURBSknotVector.length !== requiredLength) {
    resetNURBSknotVector(); // Automatically adjust knot vector to match new point count
  } else {
    updateNURBSknotVectorDisplay();
  }
}

function resetNURBSknotVector() {  //usado por updateNURBSknotVector() e evento de botão de reset. Revisar
  // Reset to default for current degree and control points
  const n = NURBScontrolPoints.length;
  const k = degree + 1;
  NURBSknotVector = [];
  
  // Start with degree+1 zeros
  for (let i = 0; i < k; i++) {
    NURBSknotVector.push(0);
  }
  
  // Add internal knots if needed (for n > k)
  if (n > k) {
    const internalKnots = n - k;
    for (let i = 1; i <= internalKnots; i++) {
      // Format to max 3 decimal places
      const knotValue = i / (internalKnots + 1);
      NURBSknotVector.push(parseFloat(knotValue.toFixed(3)));
    }
  }
  
  // End with degree+1 ones
  for (let i = 0; i < k; i++) {
    NURBSknotVector.push(1);
  }
  
  updateNURBSknotVectorDisplay();
  document.getElementById('applyKnots').style.display = 'none';
  draw();
}




function draw() { //precisa ser atualizado para renderizar também bézier.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  //Polígono de controle:
  const showControlPolygon = document.getElementById('showControlPolygon').checked;
  const showWeights = document.getElementById('showWeights').checked;
  const showControlPoints = document.getElementById('showControlPoints').checked;
  const showPointIndex = document.getElementById('showPointIndex').checked;

  if (showControlPolygon) {
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

  if (showWeights) {
    NURBScontrolPoints.forEach((point, index) => {
        ctx.fillStyle = '#000';
        ctx.fillText(`w:${point.weight.toFixed(1)}`, point.x + 10, point.y - 10);
    });
  }

  if (showPointIndex){
    NURBScontrolPoints.forEach((point, index) => {
      ctx.fillStyle = '#208030e0';
      ctx.fillText(index.toString(), point.x - 5, point.y - 15);
    });
    bezierControlPoints.forEach((point, index) => {
        ctx.fillStyle = '#802030e0';
        ctx.fillText(index.toString(), point.x - 5, point.y - 15);
    });
  }  

  drawNURBScurve();
  drawBezierCurve();
  //pontos de controle aparece 'por cima' da curva, todo o resto 'por baixo'.
  const showKnots = document.getElementById('showKnots').checked;
  if (showKnots && selectedCurve === 'NURBS') {
    drawKnotMarkers();
  }

  if (showControlPoints){
    NURBScontrolPoints.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#208030';
      ctx.fill();

    });
    bezierControlPoints.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#802030'; // Red for Bézier
        ctx.fill();
    });
  }
}

function drawKnotMarkers() {
  const u_min = NURBSknotVector[degree];
  const u_max = NURBSknotVector[NURBSknotVector.length - degree - 1];
  
  const uniqueKnots = [...new Set(NURBSknotVector)].filter(u => u >= u_min && u <= u_max);
  
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  uniqueKnots.forEach(u => {
    const point = evaluateNURBS(u, degree, NURBScontrolPoints, NURBSknotVector);
    
    // Draw a smaller circle at the knot position
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#208030';
    ctx.fill();
    
    // Display the knot value above the marker
    ctx.fillStyle = '#208030';
    ctx.fillText(u.toFixed(2), point.x, point.y - 20);
  });
}







/*** Mágica: (Implementaçã de Cox-De Boor segundo DS V3 -- reescrever cf. livro. */
function basisFunction(i, p, u, knots) {
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

function evaluateNURBS(u, degree, NURBScontrolPoints, knots) {
    let x = 0, y = 0, z = 0;
    let weightSum = 0;

    for (let i = 0; i < NURBScontrolPoints.length; i++) {  //para cada ponto de controle:
        const basis = basisFunction(i, degree, u, knots);
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

function evaluateBezier(t, points) {
    // De Casteljau's algorithm
    const n = points.length - 1;
    let workingPoints = [...points];
    
    for (let level = 1; level <= n; level++) {
        for (let i = 0; i <= n - level; i++) {
            workingPoints[i] = {
                x: (1 - t) * workingPoints[i].x + t * workingPoints[i + 1].x,
                y: (1 - t) * workingPoints[i].y + t * workingPoints[i + 1].y,
                z: 0
            };
        }
    }
    
    return workingPoints[0];
}

function drawBezierCurve() {
    const sampleCount = parseInt(document.getElementById('sampleCount').value) || 100;
    ctx.beginPath();
    
    // First point
    const startPoint = bezierControlPoints[0];
    ctx.moveTo(startPoint.x, startPoint.y);
    
    // Sample the curve
    for (let i = 1; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const point = evaluateBezier(t, bezierControlPoints);
        ctx.lineTo(point.x, point.y);
    }
    
    ctx.strokeStyle = '#800'; // Dark red for Bézier curve
    ctx.lineWidth = 2;
    ctx.stroke();
}


function drawNURBScurve() {
    const sampleCount = parseInt(document.getElementById('sampleCount').value) || 100;
    ctx.beginPath();

    // Get the valid parameter range [u_min, u_max]
    const u_min = NURBSknotVector[degree];
    const u_max = NURBSknotVector[NURBSknotVector.length - degree - 1];
    const delta = (u_max - u_min) / sampleCount;

    // Evaluate first point
    const startPoint = evaluateNURBS(u_min, degree, NURBScontrolPoints, NURBSknotVector);
    ctx.moveTo(startPoint.x, startPoint.y);

    // Sample the curve within the valid range
    for (let i = 1; i <= sampleCount; i++) {
        const u = u_min + i * delta * (1 - 1e-30);
        const point = evaluateNURBS(u, degree, NURBScontrolPoints, NURBSknotVector);
        ctx.lineTo(point.x, point.y);
    }

    ctx.strokeStyle = '#083';
    ctx.lineWidth = 2;
    ctx.stroke();
}

/*** Fim da mágica. */






/****** Helpers */
function getCanvasCoords(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width * (window.devicePixelRatio || 1));
  const scaleY = canvas.height / (rect.height * (window.devicePixelRatio || 1));
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}


function findControlPointAtPosition(x, y, threshold = POINT_HIT_THRESHOLD) {
  // Check NURBS points first
  for (let i = 0; i < NURBScontrolPoints.length; i++) {
    const dot = NURBScontrolPoints[i];
    const distance = Math.sqrt((x - dot.x) ** 2 + (y - dot.y) ** 2);
    if (distance <= threshold) {
      selectedCurve = 'NURBS';
      return i;
    }
  }
  
  // Then check Bézier points
  for (let i = 0; i < bezierControlPoints.length; i++) {
    const dot = bezierControlPoints[i];
    const distance = Math.sqrt((x - dot.x) ** 2 + (y - dot.y) ** 2);
    if (distance <= threshold) {
      selectedCurve = 'Bézier';
      return i;
    }
  }
  
  return -1;
}

function isContextMenuOpen() {  
  //if (selectedPointIndex >= 0) pode ser suficiente em vez disso, mas, na prática, tanto faz.
  return contextMenu.classList.contains('visible'); 
}

window.onload = initCanvas;
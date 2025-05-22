let canvas, ctx;

const degree = 3; //Exercício requer grau 3, definido como variável para possibilitar generalização para segunda curva.
let knotVector = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1];
let controlPoints = [ //Curva inicial (pré-definida)
    { x: 100, y: 450, z: 0, weight: 1 },
    { x: 240, y: 600, z: 0, weight: 1 },
    { x: 500, y: 620, z: 0, weight: 1 },
    { x: 770, y: 350, z: 0, weight: 1 },
    { x: 590, y: 650, z: 0, weight: 1 },
    { x: 800, y: 500, z: 0, weight: 1 },
    { x: 400, y: 450, z: 0, weight: 1 }
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
  updateKnotVector(); //calcula valor inicial para vetor de nós.
  setupCanvas();

  // Event listeners
  window.addEventListener('resize', setupCanvas); //reconfigura canvas após redimensionamento
  canvas.addEventListener('contextmenu', handleRightClick);
  canvas.addEventListener('click', handleCanvasClick);
  document.addEventListener('click', handleDocumentClick);
  
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  // canvas.addEventListener('mouseleave', handleMouseUp);  //removido para permitir dragging sobre página de configuração.

  document.getElementById('showControlPolygon').addEventListener('change', draw);
  document.getElementById('showControlPoints').addEventListener('change', draw);
  document.getElementById('showKnots').addEventListener('change', draw);
  document.getElementById('showWeights').addEventListener('change', draw);

  document.getElementById('sampleCount').addEventListener('input', draw);

  document.getElementById('deletePoint').addEventListener('click', deleteSelectedPoint);
  document.getElementById('weightInput').addEventListener('input', updatePointWeight);
  
  document.getElementById('setX').addEventListener('input', updatePosition);
  document.getElementById('setY').addEventListener('input', updatePosition);
  //setZ não necessário pois sempre é zero.

  //knot vector handling
  document.getElementById('knotVector').addEventListener('input', validateKnotVector);
  document.getElementById('resetKnots').addEventListener('click', resetKnotVector);
  document.getElementById('applyKnots').addEventListener('click', applyKnotVector);

}


/****** Event Handlers */

function handleRightClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (isDragging) return;
  
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  selectedPointIndex = findControlPointAtPosition(x, y);

  if (selectedPointIndex >= 0) {
    document.getElementById('setX').value = controlPoints[selectedPointIndex].x;
    document.getElementById('setY').value = controlPoints[selectedPointIndex].y;
    document.getElementById('setZ').value = controlPoints[selectedPointIndex].z;
    document.getElementById('weightInput').value = controlPoints[selectedPointIndex].weight;
    const deleteOption = document.getElementById('deletePoint');
    deleteOption.classList.toggle('hidden-option', controlPoints.length <= 4);
    
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.remove('hidden');
    contextMenu.classList.add('visible');
  } else {
    closeContextMenu();
  }
}

function handleCanvasClick(e) {
  if (!isContextMenuOpen() && e.button === 0 && !isDragging) {
    const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
    
    // Only add point if not near existing point (using larger threshold)
    if (findControlPointAtPosition(x, y, ADD_POINT_THRESHOLD) === -1) {
      controlPoints.push({ x, y, z:0, weight: 1 });
      updateKnotVector();
      draw();
    }
  }
}

function handleDocumentClick(e) {   //para fechar menu de contexto:
  if (isContextMenuOpen() && !contextMenu.contains(e.target)) {
    closeContextMenu();
  }
}


/****** Dragging Event Handlers */
function handleMouseDown(e) {
  if (e.button !== 0) return; // Only left mouse button
  
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  dragStartPos = { x, y };
  dragPointIndex = findControlPointAtPosition(x, y);
  
  if (dragPointIndex >= 0) {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
  }
}

function handleMouseMove(e) {
  if (!isDragging) {
    // Handle point hover
    const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
    const pointIndex = findControlPointAtPosition(x, y);
    
    if (pointIndex !== hoveredPointIndex) {
      clearTimeout(hoverTimeout);
      hidePointInfoPopup();
      
      if (pointIndex >= 0 && !isContextMenuOpen()) {
        hoverTimeout = setTimeout(() => {
          showPointInfoPopup(e, pointIndex);
        }, 500); // Slight delay before showing
      }
    }
    return;
  }
  if (isDragging) {
    hidePointInfoPopup();
    closeContextMenu();
    requestAnimationFrame(() => {
      const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
      controlPoints[dragPointIndex].x = x;
      controlPoints[dragPointIndex].y = y;
      controlPoints[dragPointIndex].z = 0; // Ensure z remains 0
      draw();
    });
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

/**** Hover event handlers */


// Add this function to show the point info popup
function showPointInfoPopup(e, pointIndex) {
  // if (selectedPointIndex >= 0) return; //alternativa - previne/esconde popup se menu de contexto foi aberto.
  if (isContextMenuOpen()) return;      // previne/esconde popup se menu de contexto foi aberto.
  const point = controlPoints[pointIndex];
  document.getElementById('pointIndex').textContent = pointIndex;
  document.getElementById('pointX').textContent = Math.round(point.x);
  document.getElementById('pointY').textContent = Math.round(point.y);
  document.getElementById('pointZ').textContent = Math.round(point.z); 
  document.getElementById('pointWeight').textContent = point.weight.toFixed(1);

  const popup = document.getElementById('pointInfoPopup');
  popup.style.left = `${e.clientX + 15}px`;
  popup.style.top = `${e.clientY + 15}px`;
  popup.classList.remove('hidden');
  popup.classList.add('visible');
  hoveredPointIndex = pointIndex;
}
// Add this function to hide the popup
function hidePointInfoPopup() {
  const popup = document.getElementById('pointInfoPopup');
  popup.classList.remove('visible');
  setTimeout(() => {
    popup.classList.add('hidden');
    hoveredPointIndex = -1;
  }, 200);
}









//Fechamento animado do menu de contexto
function closeContextMenu() {  
  contextMenu.classList.remove('visible');
  setTimeout(() => {
    contextMenu.classList.add('hidden');
    selectedPointIndex = -1;
  }, 200);
  hidePointInfoPopup(); // Also hide popup when context menu closes
}



/*** Gerenciamento de pontos: */

function updatePointWeight() {  //usada por evento de alteração em peso.
  if (selectedPointIndex >= 0) {
    const weight = parseFloat(document.getElementById('weightInput').value);
    if (!isNaN(weight)) {
      controlPoints[selectedPointIndex].weight = weight;
      draw();
    }
    // Não fechar o menu de contexto aqui para possibilitar ajustes.
  }
}

function deleteSelectedPoint() {  //usada por clique em remover ponto. Remove o último ponto definido na variável global.
  if (selectedPointIndex >= 0 && controlPoints.length > 4) { // não deve acontecer, de qualquer forma pois o botão é oculto com <4 pontos, mas não custa.
    controlPoints.splice(selectedPointIndex, 1);
    selectedPointIndex = -1;
    updateKnotVector(); 
    draw();
    closeContextMenu(); //após draw() para não atrasar renderização durante animação do menu.
  }
}

function updatePosition(){
  if (selectedPointIndex >= 0) {
    const x = parseFloat(document.getElementById('setX').value);
    const y = parseFloat(document.getElementById('setY').value);
    controlPoints[selectedPointIndex].x = x;
    controlPoints[selectedPointIndex].y = y;
    draw();
  }
}


/*** Gerenciamento de vetor de nós: */

function validateKnotVector() {
  const knotInput = document.getElementById('knotVector');
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
  const minLength = degree + controlPoints.length + 1;
  if (newKnots.length < minLength) {
    knotInput.setCustomValidity(`Vetor de nós precisa ter pelo menos ${minLength} valores para grau ${degree} com ${controlPoints.length} pontos de controle`);
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

function applyKnotVector() {
    const inputText = document.getElementById('knotVector').value.trim();
    knotVector = inputText.split(',').map(parseFloat);

    document.getElementById('applyKnots').style.display = 'none';
    document.getElementById('resetKnots').style.display = 'inline-block';

    draw(); 
}

function updateKnotVector() {
  const requiredLength = degree + controlPoints.length + 1;
  if (knotVector.length !== requiredLength) {
    resetKnotVector(); // Automatically adjust knot vector to match new point count
  } else {
    updateKnotVectorDisplay();
  }
}

function resetKnotVector() {  //usado por updateKnotVector() e evento de botão de reset. Revisar
  // Reset to default for current degree and control points
  const n = controlPoints.length;
  const k = degree + 1;
  knotVector = [];
  
  // Start with degree+1 zeros
  for (let i = 0; i < k; i++) {
    knotVector.push(0);
  }
  
  // Add internal knots if needed (for n > k)
  if (n > k) {
    const internalKnots = n - k;
    for (let i = 1; i <= internalKnots; i++) {
      // Format to max 3 decimal places
      const knotValue = i / (internalKnots + 1);
      knotVector.push(parseFloat(knotValue.toFixed(3)));
    }
  }
  
  // End with degree+1 ones
  for (let i = 0; i < k; i++) {
    knotVector.push(1);
  }
  
  updateKnotVectorDisplay();
  document.getElementById('applyKnots').style.display = 'none';
  draw();
}

function updateKnotVectorDisplay() {  //usado por updateKnotVector e resetKnotVector
  // Limita exibição a 3 casas decimais:
  const formattedKnots = knotVector.map(k => {
    const num = typeof k === 'string' ? parseFloat(k) : k;
    return num % 1 === 0 ? num.toString() : parseFloat(num.toFixed(3)).toString();
  });
  document.getElementById('knotVector').value = formattedKnots.join(', ');
}







function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  //Polígono de controle:
  const showControlPolygon = document.getElementById('showControlPolygon').checked;
  if (controlPoints.length > 1 && showControlPolygon) {
    // Draw main control polygon
    ctx.beginPath();
    ctx.moveTo(controlPoints[0].x, controlPoints[0].y);
    for (let i = 1; i < controlPoints.length; i++) {
      ctx.lineTo(controlPoints[i].x, controlPoints[i].y);
    }
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    //linha mais sutil do último ponto ao primeiro:
    ctx.beginPath();
    ctx.moveTo(controlPoints[controlPoints.length-1].x, controlPoints[controlPoints.length-1].y);
    ctx.lineTo(controlPoints[0].x, controlPoints[0].y);
    ctx.strokeStyle = '#bbb4'; 
    ctx.stroke();
  }
  
  //Pontos de controle, índices e pesos:
  const showWeights = document.getElementById('showWeights').checked;
  const showControlPoints = document.getElementById('showControlPoints').checked;
  controlPoints.forEach((point, index) => {
    if (showControlPoints){
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#203080';
      ctx.fill();

      ctx.fillStyle = '#203080e0';
      ctx.fillText(index.toString(), point.x - 5, point.y - 15);
    }
    if (showWeights) {
      ctx.fillStyle = '#000';
      ctx.fillText(`w:${point.weight.toFixed(1)}`, point.x + 10, point.y - 10);
    }
  });

  drawCurve();
}















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
  for (let i = 0; i < controlPoints.length; i++) {
    const dot = controlPoints[i];
    const distance = Math.sqrt((x - dot.x) ** 2 + (y - dot.y) ** 2);
    if (distance <= threshold) {
      return i; // Return index of found point
    }
  }
  return -1; // Return -1 if no point found
}

function isContextMenuOpen() {  
  //if (selectedPointIndex >= 0) pode ser suficiente em vez disso, mas, na prática, tanto faz.
  return contextMenu.classList.contains('visible'); 
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

function evaluateNURBS(u, degree, controlPoints, knots) {
    let x = 0, y = 0, z = 0;
    let weightSum = 0;

    for (let i = 0; i < controlPoints.length; i++) {  //para cada ponto de controle:
        const basis = basisFunction(i, degree, u, knots);
        const weightedBasis = basis * controlPoints[i].weight;
        x += controlPoints[i].x * weightedBasis;
        y += controlPoints[i].y * weightedBasis;
        z += controlPoints[i].z * weightedBasis;
        weightSum += weightedBasis;
    }
    return {
        x: x / weightSum,
        y: y / weightSum,
        z: z / weightSum
    };
}

function drawCurve() {
    const sampleCount = parseInt(document.getElementById('sampleCount').value) || 100;
    ctx.beginPath();

    // Get the valid parameter range [u_min, u_max]
    const u_min = knotVector[degree];
    const u_max = knotVector[knotVector.length - degree - 1];
    const delta = (u_max - u_min) / sampleCount;

    // Evaluate first point
    const startPoint = evaluateNURBS(u_min, degree, controlPoints, knotVector);
    ctx.moveTo(startPoint.x, startPoint.y);

    // Sample the curve within the valid range
    for (let i = 1; i <= sampleCount; i++) {
        const u = u_min + i * delta * (1 - 1e-30);
        const point = evaluateNURBS(u, degree, controlPoints, knotVector);
        ctx.lineTo(point.x, point.y);
    }

    ctx.strokeStyle = '#083';
    ctx.lineWidth = 2;
    ctx.stroke();
}

/*** Fim da mágica. */





// Add these variables at the top of scripts.js
let isUIMinimized = false;
const uiWrapper = document.getElementById('ui-controls-wrapper');
const minimizeToggle = document.getElementById('minimize-toggle');

// Toggle UI Visibility Function
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

// Add event listener for the minimize button
minimizeToggle.addEventListener('click', toggleUIVisibility);


window.onload = initCanvas;

//Variáveis para interação com interface (contexto, arrasto, hover)
const contextMenu = document.getElementById('pointContextMenu');

let selectedPointIndex = -1; // Ponto selecionado para configuração durante clique de botão direito.
let isDragging = false;
let dragPointIndex = -1;
let dragStartPos = { x: 0, y: 0 }; 
let hoverTimeout, debugTimeout;
let hoveredPointIndex = -1; //ponto sob o mouse durante tooltip
let isUIMinimized = false;

const POINT_HIT_THRESHOLD = 15; //proximidade máxima para clique com botão direito/arrastar
const ADD_POINT_THRESHOLD = POINT_HIT_THRESHOLD * 1.5;  //proximidade mínima para criação de novo ponto.

// Suporte a toque:
let touchStartDistance = 0;
let longPressTimeout;
const LONG_PRESS_DURATION = 500; // ms
const PINCH_THRESHOLD = 5; // pixels

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

/****** Event Handlers para interface de usuário: configuração, menu de contexto, popup de status e debug (C1/G2): */

/** abre/fecha janela de configurações.*/
function toggleUIVisibility() { //OK 
    const uiWrapper = document.getElementById('ui-controls-wrapper');
    isUIMinimized = !isUIMinimized;
    
    if (isUIMinimized) {  //animação:
        uiWrapper.classList.add('minimized');
        uiWrapper.addEventListener('transitionend', () => {
            uiWrapper.style.zIndex = '-1';
        }, { once: true });
    } else {
        uiWrapper.style.zIndex = '10';
        void uiWrapper.offsetHeight;    // Força reflow para forçar atualização de z-index antes da aanimação
        uiWrapper.classList.remove('minimized');
    }
}

function openContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (isDragging) return;
    
    const { x, y } =      getCanvasCoords(canvas, e.clientX, e.clientY);
    selectedPointIndex =  findControlPointAtPosition(x, y);   //retorna -1 se não há ponto sob o clique

    const forceC1 = document.getElementById("forceC1").checked
    const forceC2 = document.getElementById("forceC2").checked
    // const forceC2 = document.getElementById("forceC2").checked
    if (selectedPointIndex >= 0) {  //se clique acertou um ponto
        const currentPoints = selectedCurve === 'NURBS' ? NURBScontrolPoints : bezierControlPoints;
        const point = currentPoints[selectedPointIndex];
        document.getElementById('contextCurveTitle').textContent = selectedCurve;
        document.getElementById('setX').value = point.x;
        document.getElementById('setY').value = point.y;
        document.getElementById('setZ').value = point.z;
        
        // Habilita peso apenas para NURBS:
        const weightInput = document.getElementById('weightInput');
        weightInput.value = selectedCurve === 'NURBS' ? point.weight : 1;
        weightInput.disabled = selectedCurve !== 'NURBS';
        // Habilita remoção de pontos apenas para NURBS (e apenas em pontos específicos cf. C1)
        const deleteOption = document.getElementById('deletePoint');

        if (forceC2 || forceC2){ 
            deleteOption.classList.toggle('hidden-option', (selectedCurve !== 'NURBS' || selectedPointIndex === 0 || selectedPointIndex === 1 || selectedPointIndex === 2 || selectedPointIndex === 3 || NURBScontrolPoints.length <= (NURBS_DEGREE+1)));
            if (selectedPointIndex == 0 || selectedPointIndex == 1 || selectedPointIndex == 2 || selectedPointIndex == 3) weightInput.disabled = true;
        } else if (forceC1){ 
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

/** Fecha menu de contexto com clique em qualquer lugar fora do menu:
 * Necessário para filtrar cliques dentro do próprio menu de contexto!*/
function handleDocumentClick(e) { 
  if (isContextMenuOpen() && !contextMenu.contains(e.target)) {
    closeContextMenu();
  }
}

/** Fechamento animado do menu de contexto. Inofensivo se chamado sem menu aberto:*/
function closeContextMenu() {  
  contextMenu.classList.remove('visible');
  selectedPointIndex = -1;
  hidePointInfoPopup(); 
}

function showPointInfoPopup(e, pointIndex) {
  if (isContextMenuOpen()) return;
  
  const point = selectedCurve === 'NURBS' 
    ? NURBScontrolPoints[pointIndex] 
    : bezierControlPoints[pointIndex];
  
  document.getElementById('curveType'). textContent = selectedCurve;
  document.getElementById('pointIndex').textContent = pointIndex;
  document.getElementById('pointX').    textContent = (point.x).toFixed(5);
  document.getElementById('pointY').    textContent = (point.y).toFixed(5);
  document.getElementById('pointZ').    textContent = (point.z).toFixed(5);
  
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

function showDebugPopup() {
    const debugPopup = document.getElementById('debugPopup');

    clearTimeout(debugTimeout);
    
    calculateBezierTangentVectors();
    calculateNURBSTangentVectors();
    let continuityLevel = checkContinuityLevel();

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
    draw();
    if (!document.getElementById('showDebugPopup').checked) {
        debugTimeout = setTimeout(() => {
            debugPopup.classList.remove('visible');
            draw(); //redesennha para garantir remoção também dos vetores após timeout
        }, 3000);
    } 
}




/** Eventos do canvas: cliques, pan, zoom: */

/** Zoom (apenas com scroll do mouse), simples e limitado mas é o que tem pra hoje: */
function handleWheel(e) {
  e.preventDefault();
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const newZoom = Math.min(Math.max(1.0, zoomLevel + delta), 4.0);

  if (newZoom !== zoomLevel) {
    zoomLevel = newZoom;
    zoomOrigin = { x, y };
    draw();
  }
}

/** Gerencia cliques no canvas: pan, novo ponto, drag: */
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

/** início de arrasto ou panning: */
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

/** fim de arrasto ou panning */
function handleMouseUp() {
  if (isDragging) {
    isDragging = false;
    dragPointIndex = -1;
    canvas.style.cursor = '';
  } else if (isPanning) {
    isPanning = false;
    canvas.style.cursor = '';
  }
  hidePointInfoPopup();
}

function handleMouseMove(e) {
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
  
  if (isPanning) {
    const newOffsetX = panOffset.x + (e.clientX - panStart.x);
    const newOffsetY = panOffset.y + (e.clientY - panStart.y);
    
    // Restringe limites de panning ao tamanho do canvas original:
    const maxPanX = canvas.width * (zoomLevel - 1) / 2;
    const maxPanY = canvas.height * (zoomLevel - 1) / 2;
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





/*** Gerenciamento geral de movimentação de pontos: 
 * usado tanto por arrasto quanto por entradas numéricas x,y do menu de contexto.
 * Inclui casos especiais.
*/
function handlePointMovement(pointIndex, newX, newY) { 
  // const forceC0 = document.getElementById("forceC0").checked   //não implementado
  const forceC1 = document.getElementById("forceC1").checked
  const forceC2 = document.getElementById("forceC2").checked
  // const forceC2 = document.getElementById("forceC2").checked   //não implementado

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
  
  if (forceC2) {
    const m = BEZIER_DEGREE;
    const k = NURBS_DEGREE;
    
    // Points that affect curvature at junction
    const pointsOfInterest = {
      'Bézier': [m, m-1, m-2],
      'NURBS': [0, 1, 2]
    };

    if (pointsOfInterest[selectedCurve]?.includes(pointIndex)) {
      // Determine which point to adjust
      let adjustPoint;
      if (selectedCurve === 'NURBS' && pointIndex === 2) {
        adjustPoint = { curve: 'Bézier', index: m-2 };
      } else {
        adjustPoint = { curve: 'NURBS', index: 2 };
      }

      // Get current positions
      const Pm = bezierControlPoints[m];
      const Pm1 = bezierControlPoints[m-1];
      const Pm2 = bezierControlPoints[m-2];
      const Q0 = NURBScontrolPoints[0];
      const Q1 = NURBScontrolPoints[1];
      const Q2 = NURBScontrolPoints[2];

      // Adjust point to maintain C2 continuity
      if (adjustPoint.curve === 'NURBS' && adjustPoint.index === 2) {
        // Adjust NURBS Q2 based on Bézier curvature
        const B2x = m*(m-1) * (Pm.x - 2*Pm1.x + Pm2.x);
        const B2y = m*(m-1) * (Pm.y - 2*Pm1.y + Pm2.y);
        const factor = 1/(k*(k-1));
        NURBScontrolPoints[2].x = factor * B2x - Pm.x + 2 * Q1.x;
        NURBScontrolPoints[2].y = factor * B2y - Pm.y + 2 * Q1.y;
      } else if (adjustPoint.curve === 'Bézier' && adjustPoint.index === m-2) {
        // Adjust Bézier Pm-2 based on NURBS curvature
        const N2x = k*(k-1) * (Q0.x - 2*Q1.x + Q2.x);
        const N2y = k*(k-1) * (Q0.y - 2*Q1.y + Q2.y);
        const factor = 1/(m*(m-1));
        bezierControlPoints[m-2].x = factor * N2x - Pm.x + 2 * Pm1.x;
        bezierControlPoints[m-2].y = factor * N2y - Pm.y + 2 * Pm1.y;
      }
    }
  }
}







/** Reajusta pontos para garantir C1 ao ativar a opção
 * Chamada por evento de checkbox:
 * Corrigido para considerar diferença de grau entre curvas:
*/
function enforceC1() {
  if (document.getElementById("forceC1").checked){
    const point0 = bezierControlPoints[BEZIER_DEGREE];
    const referenceVec = {
      x: (bezierControlPoints[BEZIER_DEGREE - 1].x - point0.x) / NURBS_DEGREE * BEZIER_DEGREE,    //regra de 3, empírico
      y: (bezierControlPoints[BEZIER_DEGREE - 1].y - point0.y) / NURBS_DEGREE * BEZIER_DEGREE,
    };
    
    NURBScontrolPoints[1].x = point0.x - referenceVec.x;
    NURBScontrolPoints[1].y = point0.y - referenceVec.y;

    NURBScontrolPoints[0].weight = 1
    NURBScontrolPoints[1].weight = 1 
  } else {  //desmarca G2 e C2 ao desmarcar C1:
    //   document.getElementById("forceG2").checked = false;
      document.getElementById("forceC2").checked = false;
  }
  showDebugPopup()
  draw();
}


function enforceC2() {
    //Garante que C1 também está ativo antes de ativar G2:
    if (!document.getElementById("forceC1").checked) {
        document.getElementById("forceC1").checked = true;
        enforceC1();
    } 
    //desativa ajuste de vetor de nós e garante que vetor de nós é padrão:
    if (document.getElementById("forceC2").checked){
        document.getElementById("NURBSknotVector").disabled = true
        document.getElementById("resetKnots").disabled = true
    } else {
        document.getElementById("NURBSknotVector").disabled = false;
        document.getElementById("resetKnots").disabled = true
    }
    setNURBSknotVector();

    //Garante que peso dos 4 primeiros pontos é 1 
    //(ajuste também é desativado no menu de contexto enquanto G2 está ativo)
    NURBScontrolPoints[0].weight = 1;
    NURBScontrolPoints[1].weight = 1;
    NURBScontrolPoints[2].weight = 1;
    NURBScontrolPoints[3].weight = 1;

    /** Mágica DS R1: */
    // Set initial C2 continuity by adjusting NURBS Q2
    const m = BEZIER_DEGREE;
    const k = NURBS_DEGREE;
    
    const Pm = bezierControlPoints[m];
    const Pm1 = bezierControlPoints[m-1];
    const Pm2 = bezierControlPoints[m-2];
    const Q1 = NURBScontrolPoints[1];

    // Calculate adjustment for NURBS Q2
    const B2x = m*(m-1) * (Pm.x - 2*Pm1.x + Pm2.x);
    const B2y = m*(m-1) * (Pm.y - 2*Pm1.y + Pm2.y);
    const factor = 1/(k*(k-1));
    
    // Apply adjustment
    NURBScontrolPoints[2].x = factor * B2x - Pm.x + 2 * Q1.x;
    NURBScontrolPoints[2].y = factor * B2y - Pm.y + 2 * Q1.y;
    /** Fim da mágica. */

    showDebugPopup()
    draw();
}







/*** Gerenciamento de vetor de nós: */
function validateNURBSknotVector() {  //OK //usado apenas por evento de alteração no campo de texto do vetor de nós
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


function openLicensePopup(){
    const popup = document.getElementById('about-wrapper');
    popup.classList.add('visible');
    closeContextMenu();
    hidePointInfoPopup();
  
}
function closeLicensePopup(){
    const popup = document.getElementById('about-wrapper');
    popup.classList.remove('visible');
}

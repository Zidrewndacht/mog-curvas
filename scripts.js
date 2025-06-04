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
let NURBSknotVector = [];   //preenchido por 

//Exercício requer grau 3, definido como variável para possibilitar generalização para segunda curva se aplicável.
//Não foi aplicável, segunda curva não é NURBS. A menos que decida reimplementar bézier como subset de NURBS.
const NURBS_DEGREE = 3; 
const BEZIER_DEGREE = 7; 

let NURBScontrolPoints = [ //Curva inicial (pré-definida)
    { x: 590, y: 600, z: 0, weight: 1 },
    { x: 660, y: 833, z: 0, weight: 1 },
    { x: 700, y: 720, z: 0, weight: 1 },
    { x: 800, y: 200, z: 0, weight: 1 },
    { x: 790, y: 750, z: 0, weight: 1 },
    { x: 900, y: 600, z: 0, weight: 1 },
    { x: 700, y: 490, z: 0, weight: 1 },
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

let bezierTangent = {x:45, y:45, mag:0, angle:0}
let NURBStangent = {x:-45, y:-45, mag:0, angle:0}


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
  if (!isContextMenuOpen() && e.button === 0 && !isDragging) {
    const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
    
    //Se não existe ponto aqui, adiciona novo ponto à NURBS:
    if (findControlPointAtPosition(x, y, ADD_POINT_THRESHOLD) === -1) {
      NURBScontrolPoints.push({ x, y, z: 0, weight: 1 });
      setNURBSknotVector();
      draw();
    }
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
  clearTimeout(debugTimeout);
  const debugPopup = document.getElementById('debugPopup');
  
  const bezP0 = bezierControlPoints[0];
  const bezP1 = bezierControlPoints[1];
  const bezierDegree = bezierControlPoints.length - 1;
  bezierTangent.x = bezierDegree * (bezP1.x - bezP0.x);    /** referenciar fórmula */
  bezierTangent.y = bezierDegree * (bezP1.y - bezP0.y);
  
  /** Mágica: */
  const nurbsP0 = NURBScontrolPoints[0];
  const nurbsP1 = NURBScontrolPoints[1];
  const knotDiff = NURBSknotVector[NURBS_DEGREE + 1] - NURBSknotVector[1];
  const weightRatio = nurbsP1.weight / nurbsP0.weight;
  const nurbsFactor = NURBS_DEGREE / knotDiff;
  
  NURBStangent.x = nurbsFactor * weightRatio * (nurbsP1.x - nurbsP0.x);
  NURBStangent.y = nurbsFactor * weightRatio * (nurbsP1.y - nurbsP0.y);
  /** Fim da mágica */

  bezierTangent.mag = Math.sqrt(bezierTangent.x ** 2 + bezierTangent.y ** 2);
  bezierTangent.angle = Math.atan2(bezierTangent.y, bezierTangent.x) * (180 / Math.PI);
  
  NURBStangent.mag = Math.sqrt(NURBStangent.x ** 2 + NURBStangent.y ** 2);
  NURBStangent.angle = Math.atan2(NURBStangent.y, NURBStangent.x) * (180 / Math.PI);
  
  document.getElementById('bezierMagnitude').textContent = bezierTangent.mag.toFixed(3);
  document.getElementById('bezierAngle').textContent = bezierTangent.angle.toFixed(2);
  document.getElementById('NURBSmagnitude').textContent = NURBStangent.mag.toFixed(3);
  document.getElementById('NURBSangle').textContent = NURBStangent.angle.toFixed(2);
  
  let continuityLevel = "C0"; // Assume continuidade C0 por padrão (obrigatória)
  
  if (bezierTangent.mag > 1e-4 && NURBStangent.mag > 1e-4) {
    const angleDiff = Math.abs(Math.abs(bezierTangent.angle - NURBStangent.angle) - 180);
    
    if (angleDiff < 1) { //verifica se vetores são opostos, tolerância de 1°
      if (Math.abs(bezierTangent.mag - NURBStangent.mag) < 1) {
        continuityLevel = "C1"; //se magnitude e ângulo são iguais, C1.
      } else {
        continuityLevel = "G1"; //se apenas ângulo é igual, G1.
      }
    }
  }

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
    const point0 = bezierControlPoints[0];
    const referenceVec = {
      x: (bezierControlPoints[1].x - point0.x) / NURBS_DEGREE * BEZIER_DEGREE,
      y: (bezierControlPoints[1].y - point0.y) / NURBS_DEGREE * BEZIER_DEGREE,
    };
    
    NURBScontrolPoints[1].x = point0.x - referenceVec.x;
    NURBScontrolPoints[1].y = point0.y - referenceVec.y;
    NURBScontrolPoints[1].weight = 1 //fixa peso em 1 para ponto
  }
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
  if (pointIndex <= 3 ) showDebugPopup();  //exibe popup para pontos próximos de 0
  if (pointIndex === 0) { //casos especiais para ponto 0
    // showDebugPopup();
    const prevX = bezierControlPoints[0].x;
    const prevY = bezierControlPoints[0].y;
    //Sempre garante C0: pontos 0 das duas curvas são unidos:
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
  } else if (pointIndex === 1 && forceC1) { 
    // showDebugPopup();
    const point0 = bezierControlPoints[0];
    const newVec = { x: newX - point0.x, y: newY - point0.y };
    
    if (selectedCurve === 'NURBS') {
      NURBScontrolPoints[1].x = newX;
      NURBScontrolPoints[1].y = newY;
      bezierControlPoints[1].x = point0.x - (newVec.x / BEZIER_DEGREE * NURBS_DEGREE);
      bezierControlPoints[1].y = point0.y - (newVec.y / BEZIER_DEGREE * NURBS_DEGREE);
    } else {
      bezierControlPoints[1].x = newX;
      bezierControlPoints[1].y = newY;
      NURBScontrolPoints[1].x = point0.x - (newVec.x /  NURBS_DEGREE * BEZIER_DEGREE);
      NURBScontrolPoints[1].y = point0.y - (newVec.y /  NURBS_DEGREE * BEZIER_DEGREE);
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
  const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
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
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Identifica opções de visualização em uso:
    const showControlPolygon =  document.getElementById('showControlPolygon').checked;
    const showWeights =         document.getElementById('showWeights').checked;
    const showControlPoints =   document.getElementById('showControlPoints').checked;
    const showPointIndex =      document.getElementById('showPointIndex').checked;
    const showKnots =           document.getElementById('showKnots').checked;

    if (showControlPolygon) { //OK: "Exibir polígono de controle"
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

    if (showPointIndex){ //OK: "Exibir índices"
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
    
    //Nós e pontos de controle precisam aparecer 'por cima' das curvas, todo o resto 'por baixo':
    
    if (document.getElementById('debugPopup').classList.contains('visible')){ //OK  //exibe vetor tangente enquanto popu está ativo
      drawTangentVector(bezierTangent, '#9006');
      drawTangentVector(NURBStangent, '#0906');
    }

    if (showWeights) { //OK: "Exibir pesos"
      NURBScontrolPoints.forEach((point) => {
          ctx.font = '10px system-ui';
          ctx.fillStyle = '#010';
          ctx.fillText(`w:${point.weight.toFixed(1)}`, point.x + 10, point.y - 10);
      });
    }
    //pontos de controle aparece 'por cima' da curva, todo o resto 'por baixo'.
    if (showKnots) {  //"Exibir nós"
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

    if (showControlPoints){ //OK: "Exibir pontos de controle"
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
  })
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

function evaluateBezier(t, points) { // De Casteljau's algorithm
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

function drawBezierCurve() {  /** reescrever */
    const sampleCount = parseInt(document.getElementById('sampleCount').value) * bezierControlPoints.length;
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

function drawNURBScurve() { /** reescrever */
    // Get the valid parameter range [u_min, u_max]
    const u_min = NURBSknotVector[NURBS_DEGREE];
    const u_max = NURBSknotVector[NURBSknotVector.length - NURBS_DEGREE - 1];
    const sampleCount = ( parseInt(document.getElementById('sampleCount').value) * NURBScontrolPoints.length);
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

function drawTangentVector(vector, color) { //usado para desenhar ambos os vetores.   //OK
  const start = NURBScontrolPoints[0];
  const scale=0.1
  const end = {
    x: start.x + vector.x*scale,
    y: start.y + vector.y*scale
  };
  
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw arrowhead
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - 10 * Math.cos(angle - Math.PI/6),
    end.y - 10 * Math.sin(angle - Math.PI/6)
  );
  ctx.lineTo(
    end.x - 10 * Math.cos(angle + Math.PI/6),
    end.y - 10 * Math.sin(angle + Math.PI/6)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}


/****** Helpers */
function getCanvasCoords(canvas, clientX, clientY) {  //Identifica coordenadas considerando DPR/zoom: //OK
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width * (window.devicePixelRatio || 1));
  const scaleY = canvas.height / (rect.height * (window.devicePixelRatio || 1));
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function findControlPointAtPosition(x, y, threshold = POINT_HIT_THRESHOLD) {  //OK
  // Pré-calcula limites quadrados para evitar Math.sqrt():
  const thresholdSquared = threshold * threshold;
  
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
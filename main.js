/** Variáveis Globais: */
let canvas, ctx;
/** Usados por main, draw, events: */
let zoomLevel = 1.0;
let zoomOrigin = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let isPanRelease = false;  //para evitar criação de novo ponto ao soltar após panning.

let selectedCurve = 'NURBS';
let NURBSknotVector = [];   //será calculado no primeiro uso.

let NURBScontrolPoints = [ //Curva inicial (pré-definida)
    { x: 390, y: 700, z: 0, weight: 1 },
    { x: 707, y: 727, z: 0, weight: 1 },
    { x: 480, y: 504, z: 0, weight: 1 },
    { x: 820, y: 450, z: 0, weight: 1 },
    { x: 410, y: 610, z: 0, weight: 1 },
    { x: 320, y: 550, z: 0, weight: 2 },
    { x: 410, y: 510, z: 0, weight: 3 },
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

let bezier1stDerivative =   {x: 0, y: 0, mag: 0, angle: 0};
let bezier2ndDerivative =   {x: 0, y: 0, mag: 0, angle: 0};
let NURBS1stDerivative =    {x: 0, y: 0, mag: 0, angle: 0};
let NURBS2ndDerivative =    {x: 0, y: 0, mag: 0, angle: 0};

//Exercício requer grau 3, definido como variável para possibilitar generalização para segunda curva se aplicável.
//Não foi aplicável, segunda curva não é NURBS. A menos que decida reimplementar bézier como subset de NURBS.
const NURBS_DEGREE = 3; 
const BEZIER_DEGREE = bezierControlPoints.length-1; 

/** Usada em init e redumensionamento.
 * Configura canvas considerando resolução real
 * em qualquer nível de zoom e/ou em telas de alto DPI */
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
function init() { //ok
    canvas = document.getElementById('curves-canvas');
    setupCanvas();  //usada em init e redumensionamento.

    setNURBSknotVector(); //calcula valor inicial para vetor de nós.

    // Event listeners
    document.getElementById('minimize-toggle').addEventListener('click', toggleUIVisibility);

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
    document.getElementById('showDebugPopup').    addEventListener('change',  showDebugPopup);

    document.getElementById("forceC1").addEventListener("change", enforceC1);   
    //   document.getElementById("forceG2").addEventListener("change", enforceG2);   
    document.getElementById("forceC2").addEventListener("change", enforceC2);   

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
    document.getElementById("license-link").  addEventListener("click", openLicensePopup);
    document.getElementById("about-wrapper"). addEventListener("click", closeLicensePopup);

    // //Suporte a toque:
    // canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    // canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    // canvas.addEventListener('touchend', handleTouchEnd);
    // canvas.addEventListener('touchcancel', handleTouchEnd);
}

window.onload = init;
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Fixtures exist only in this browser test. Every API request is intercepted.
async function setup(page, { role = 'admin', failList = false, emptyUsers = false, failCreate = false, failUpload = false, workspaceFor } = {}) {
  const calls = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const datasets = Array.from({ length: 7 }, (_, i) => ({ id:i+1, name:`Base de prueba ${i+1}`, period:'2026-T4', version:1, fileName:`base-${i+1}.csv`, records:2, synthetic:true, status:i ? 'archived' : 'active', active:!i, importedAt:'2026-11-01T15:00:00Z', importedBy:'Cuenta de prueba' }));
  let activeId = 1;
  let users = emptyUsers ? [] : [
    { id:1, name:'Administrador de prueba', username:'admin.test', role:'admin', active:true, createdAt:'2026-11-01T15:00:00Z' },
    { id:2, name:'María Pérez', username:'mperez', role:'analista', active:true, createdAt:'2026-11-02T15:00:00Z' },
    { id:3, name:'Luis Torres', username:'ltorres', role:'operador', active:false, createdAt:'2026-11-03T15:00:00Z' },
  ];
  const caseFor = id => ({ id:id*10, dataset_id:id, id_registro:'PRUEBA-001', p309:`Venta de alimentos, base ${id}`, p308:'Vendedor', p308a:'Atiende al público', confianza_ml:.82, estado:'pendiente', candidatos:[{codigo:'4711',descripcion:'Venta al por menor',prob:.82,rank:1}], qwen:{codigo:'4711',justificacion:'Qwen coincide con R2.',latencia_s:2}, evidencia_r2:{casos_similares:[{codigo:'4711',p309:'Venta de verduras',similitud:.8}],calidad_entrada:{nivel:'media',motivos:['sin_contexto_p308']}} });
  const eventsFor = id => [{ id:id*100, datasetId:id, caseId:'PRUEBA-001', action:'consulta de IA', code:'4711', user:'Asistente de IA', at:'2026-11-01T15:00:00Z' }];
  const workspace = id => ({ cases: [caseFor(id)], events: eventsFor(id), ...workspaceFor?.(id) });
  const jobs = ['running','completed','qwen_running','queued','failed','cancelled'].map((status,i)=>({id:i+1,datasetId:1,datasetName:'Proceso de prueba',period:'2026-T4',modelVersion:'r2-baseline',qwenMode:'automatic',status,total:2,processed:status==='completed'?2:1,automatic:1,qwenPending:1,manual:0,qwenProcessed:0,qwenResolved:0,qwenReview:0,cancelRequested:false,estimatedSecondsRemaining:60,error:status==='failed'?'Error de prueba':null}));
  await page.context().addCookies([{name:'epen_ui_test',value:'fixture',url:'http://127.0.0.1:5178'}]);
  await page.route('**/api/**', async route => {
    const req=route.request(), url=new URL(req.url()), method=req.method(), pathname=url.pathname;
    // Vite tambien sirve modulos desde /src/shared/api/: no son llamadas al backend.
    if (!pathname.startsWith('/api/')) return route.fallback();
    calls.push({path:pathname, method, body:req.postData(), query:Object.fromEntries(url.searchParams), headers:req.headers()});
    const json = data => route.fulfill({json:data});
    if(pathname==='/api/auth/me')return json({user:{id:1,name:'Administrador de prueba',username:'admin.test',role,active:true},csrfToken:'csrf-test'});
    if(pathname==='/api/auth/logout')return route.fulfill({status:204});
    if(pathname==='/api/data/bootstrap')return json({datasets,activeDataset:datasets.find(d=>d.id===activeId),...workspace(activeId)});
    if(pathname.endsWith('/workspace')) {const id=Number(pathname.split('/')[3]);return json({dataset:datasets.find(d=>d.id===id),...workspace(id)});}
    if(pathname.match(/^\/api\/datasets\/\d+\/history$/)) {const id=Number(pathname.split('/')[3]);const all=eventsFor(id);const q=url.searchParams.get('q')||'';const rows=q&&!all.some(row=>`${row.caseId} ${row.code} ${row.user}`.toLowerCase().includes(q.toLowerCase()))?[]:all;return json({dataset:datasets.find(d=>d.id===id),rows,total:rows.length,summary:{events:all.length,cases:1,human:0}});}
    if(pathname.match(/^\/api\/analytics\/datasets\/\d+\/summary$/)) {const id=Number(pathname.split('/')[4]);return json({dataset:datasets.find(d=>d.id===id),totals:{total:2,resolved:1,review:1,pending:0,automatic:1,ai:0,human:0,averageConfidence:.82,missingP309:0,missingContext:0,uniqueCodes:1,confidenceBands:{high:0,medium:0,low:2}},rates:{resolved:.5,review:.5,automatic:.5,topFiveConcentration:1,completeness:1},topCodes:[{code:'4711',description:'Venta al por menor',count:1,share:1}],indicators:{r2:{evaluated:1,accuracy:1,macroF1:1},r3:{evaluated:0,accuracy:null,macroF1:null}}});}
    if(pathname==='/api/assistant/chat') {const input=req.postDataJSON();return json({answer:'Comparación calculada con las bases seleccionadas.',intent:'compare_datasets',calculatedAt:new Date().toISOString(),data:{left:{dataset:datasets.find(d=>d.id===Number(input.datasetId))},right:{dataset:datasets.find(d=>d.id===Number(input.compareDatasetId))},codeChanges:[{code:'4711',description:'Venta al por menor',leftShare:.4,rightShare:.5,change:.1}]}});}
    if(pathname==='/api/admin/users' && method==='GET')return failList ? route.fulfill({status:503,json:{error:'Lista no disponible'}}) : json({users});
    if(pathname==='/api/admin/users' && method==='POST') {
      if(failCreate){failCreate=false;return route.fulfill({status:409,json:{error:'Ese nombre de usuario ya existe.'}});}
      await new Promise(resolve=>setTimeout(resolve,100));
      const {password,...input}=req.postDataJSON();
      const user={...input,id:4,active:true,createdAt:'2026-11-12T12:00:00Z'};users.push(user);return json({user});
    }
    if(pathname.match(/\/api\/admin\/users\/\d+\/status/)) {
      const target=users.find(u=>u.id===Number(pathname.split('/')[4]));target.active=req.postDataJSON().active;return json({user:target});
    }
    if(pathname.match(/\/api\/admin\/users\/\d+$/) && method==='DELETE') {users=users.filter(u=>u.id!==Number(pathname.split('/')[4]));return route.fulfill({status:204});}
    if(pathname==='/api/r2/jobs' && method==='GET')return json({jobs});
    if(pathname==='/api/r2/jobs' && method==='POST') {
      if(failUpload){failUpload=false;return route.fulfill({status:503,json:{error:'Servicio temporalmente no disponible'}});}
      await new Promise(resolve=>setTimeout(resolve,100));return json({jobId:100,records:2});
    }
    if(pathname.endsWith('/cancel')) {jobs[0].cancelRequested=true;return json({outcome:'requested'});}
    if(pathname.endsWith('/export'))return route.fulfill({contentType:'text/csv',body:'id_registro,estado\nPRUEBA-001,pendiente\n'});
    if(pathname.endsWith('/activate')) {activeId=Number(pathname.split('/')[4]);return json({ok:true});}
    if(pathname.endsWith('/simulate-r2'))return json({automatic:1,pending:1});
    if(pathname==='/api/admin/datasets')return json({ok:true});
    if(pathname==='/api/catalog')return json({rows:[{codigo:'4711',descripcion:'Venta al por menor'}]});
    if(pathname==='/api/coding-rules' && method==='GET')return json({rules:[{id:1,code:'4711',title:'Venta minorista',pattern:'Venta directa al consumidor',guidance:'Confirmar que la venta sea al por menor.',codeDescription:'Venta al por menor',status:'active',createdBy:'Supervisor de prueba',createdById:1,approvedBy:'Administrador de prueba'}]});
    if(pathname==='/api/catalog-change-requests' && method==='GET')return json({requests:[{id:1,type:'add',code:'0123',description:'Cultivo de prueba',justification:'Nueva actividad aprobada para evaluación.',sourceReference:'Documento metodológico',status:'pending',createdBy:'Supervisor de prueba'}]});
    if(pathname.endsWith('/decision'))return json({ok:true});
    if(pathname.endsWith('/qwen'))return json({result:{codigo:'4711',justificacion:'Sugerencia de prueba'}});
    return route.fulfill({status:404,json:{error:'Solicitud no preparada en la prueba'}});
  });
  return {calls,errors};
}

test('casos: indicadores por base, independientes de la tabla y adaptados a móvil', async ({ page }, testInfo) => {
  const { errors } = await setup(page, {
    workspaceFor: id => ({
      cases: Array.from({ length: 26 }, (_, index) => ({
        dataset_id: id, id_registro: `REG-${index + 1}`, p309: 'Venta de alimentos', estado: 'pendiente',
      })),
      indicators: id === 1 ? {
        global: { accuracy: .85, macroF1: .73, evaluated: 20, withReference: 25, withoutPrediction: 5, withoutReference: 1, coverage: .8 },
        r2: { accuracy: .8, automaticApproval: .6, macroF1: .7, evaluated: 10, threshold: .9 },
        r3: { accuracy: .75, automaticApproval: .5, macroF1: .65, evaluated: 4 },
      } : {
        global: { accuracy: .4, macroF1: .3, evaluated: 5, withReference: 10, withoutPrediction: 5, withoutReference: 16, coverage: .5 },
        r2: { accuracy: null, automaticApproval: 0, macroF1: null, evaluated: 0 },
        r3: { accuracy: .4, automaticApproval: null, macroF1: .3, evaluated: 5 },
      },
    }),
  });
  await page.route('**/api/datasets/*/coding-dashboard', route => route.fulfill({ json: { referenceVisible: true, coderSectionVisible: true } }));
  await page.goto('/casos');
  const chart = page.getByRole('region', { name: 'Comparación del clasificador y la IA' });
  const bar = (metric, series) => chart.getByRole('img', { name: new RegExp(`^${metric}, ${series}:`) });
  await expect(chart.getByRole('img')).toHaveCount(5);
  await expect(bar('Accuracy', 'Clasificador automático')).toHaveAttribute('aria-label', /80/);
  await expect(bar('Accuracy', 'Asistencia de IA')).toHaveAttribute('aria-label', /75/);
  await expect(bar('Macro F1-score', 'Clasificador automático')).toHaveAttribute('aria-label', /70/);
  await expect(bar('Macro F1-score', 'Asistencia de IA')).toHaveAttribute('aria-label', /65/);
  await expect(bar('Aprobación automática', 'Clasificador automático')).toHaveAttribute('aria-label', /60/);
  await expect(bar('Aprobación automática', 'Asistencia de IA')).toHaveCount(0);
  await expect(page.getByText('Resumen de codificación con referencia', { exact: true })).toHaveCount(0);
  const classifier = await bar('Accuracy', 'Clasificador automático').boundingBox();
  const ai = await bar('Accuracy', 'Asistencia de IA').boundingBox();
  expect(ai.x).toBeGreaterThan(classifier.x);
  expect(Math.abs(ai.y + ai.height - classifier.y - classifier.height)).toBeLessThan(1);
  expect(classifier.height).toBeGreaterThan(classifier.width);
  const globalChart = page.getByRole('region', { name: 'Resultado global de la base seleccionada' });
  await expect(globalChart.getByRole('img')).toHaveCount(2);
  await expect(globalChart.getByRole('img', { name: /^Accuracy global:/ })).toHaveAttribute('aria-label', /85/);
  await expect(globalChart.getByRole('img', { name: /^Macro F1-score global:/ })).toHaveAttribute('aria-label', /73/);
  await expect(globalChart).toContainText('20 registros evaluados de 25');
  const left = await chart.boundingBox();
  const right = await globalChart.boundingBox();
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
  expect(right.y).toBe(left.y);
  await chart.locator('..').screenshot({ path: testInfo.outputPath('comparacion-desktop.png'), animations: 'disabled', timeout: 5000 });
  await page.getByRole('button', { name: 'Siguiente' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('tbody')).toContainText('REG-26');
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('sin coincidencias');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(bar('Accuracy', 'Clasificador automático')).toHaveAttribute('aria-label', /80/);
  await page.getByRole('button', { name: /Base de prueba 1 ·/ }).click();
  await page.getByRole('option').filter({ hasText: 'Base de prueba 2' }).click();
  await expect(bar('Accuracy', 'Clasificador automático')).toHaveAttribute('aria-label', /Sin muestra/);
  await expect(bar('Aprobación automática', 'Clasificador automático')).toHaveAttribute('aria-label', /0/);
  await expect(bar('Accuracy', 'Asistencia de IA')).toHaveAttribute('aria-label', /40/);
  await expect(chart.getByLabel('Leyenda del gráfico')).toContainText('5 casos evaluados');
  await expect(globalChart.getByRole('img', { name: /^Accuracy global:/ })).toHaveAttribute('aria-label', /40/);
  await expect(globalChart).toContainText('5 registros evaluados de 10');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(chart).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await chart.locator('..').screenshot({ path: testInfo.outputPath('comparacion-mobile.png'), animations: 'disabled', timeout: 5000 });
  expect(errors).toEqual([]);
});

test('usuarios: tabla única, filtros combinados, teclado y creación con datos del servidor',async({page})=>{
  const {calls,errors}=await setup(page,{failCreate:true});await page.goto('/usuarios');
  await expect(page.getByRole('tab',{name:'Lista de usuarios'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Buscar usuario').fill('maria');
  await page.getByRole('combobox',{name:'Tipo de usuario',exact:true}).selectOption('operador');
  await expect(page.getByText('No encontramos usuarios con los filtros seleccionados.')).toBeVisible();
  await page.getByRole('combobox',{name:'Tipo de usuario',exact:true}).selectOption('analista');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Restablecer filtros'}).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Desactivar a admin.test'})).toBeDisabled();
  await page.getByRole('tab',{name:'Lista de usuarios'}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Crear usuario'})).toBeFocused();
  const form=page.locator('.user-create-form');
  await form.getByLabel('Nombre completo',{exact:true}).fill('Nueva Cuenta');
  await form.getByLabel('Nombre de usuario',{exact:true}).fill('nueva.cuenta');
  await form.getByRole('combobox',{name:'Tipo de usuario',exact:true}).selectOption('auditor');
  await form.getByLabel('Clave temporal',{exact:true}).fill('SoloPrueba123456');
  await form.getByRole('button',{name:'Crear usuario',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('ya existe');
  await expect(form.getByLabel('Nombre completo',{exact:true})).toHaveValue('Nueva Cuenta');
  await form.evaluate(el=>{el.requestSubmit();el.requestSubmit();});
  await expect(page.getByRole('tab',{name:'Lista de usuarios'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('tbody')).toContainText('Nueva Cuenta');
  const posts=calls.filter(c=>c.path==='/api/admin/users'&&c.method==='POST');expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[1].body)).toMatchObject({name:'Nueva Cuenta',username:'nueva.cuenta',role:'auditor'});
  expect(posts[1].headers['x-csrf-token']).toBe('csrf-test');expect(posts[1].headers.cookie).toContain('epen_ui_test');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('SoloPrueba');expect(errors).toEqual([]);
});

test('usuarios: confirmaciones, cancelación de acciones y estados reales',async({page})=>{
  const {calls}=await setup(page);await page.goto('/usuarios');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Desactivar a mperez'}).click();
  expect(calls.filter(c=>c.method==='PATCH')).toHaveLength(0);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Desactivar a mperez'}).click();
  await expect(page.getByRole('button',{name:'Activar a mperez',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Activar a mperez',exact:true}).click();
  await expect(page.getByRole('button',{name:'Desactivar a mperez'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Retirar a ltorres'}).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
});

for(const fail of [false,true]) test(`usuarios distingue lista vacía de error: ${fail}`,async({page})=>{
 await setup(page,{emptyUsers:true,failList:fail});await page.goto('/usuarios');
 if(fail) {await expect(page.getByRole('alert')).toContainText('Lista no disponible');await expect(page.getByText('Todavía no hay usuarios registrados.')).toHaveCount(0);}
 else await expect(page.getByText('Todavía no hay usuarios registrados.')).toBeVisible();
});

test('bases: ayuda accesible, validación CSV y solicitud original sin duplicados',async({page})=>{
 const {calls,errors}=await setup(page,{role:'operador',failUpload:true});await page.goto('/bases');
 await expect(page.getByText('Flujo del proceso',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Ver cómo funciona el procesamiento completo')).toHaveCount(0);
 const help=page.locator('summary').filter({hasText:'¿Qué archivo debo cargar?'});await help.focus();await page.keyboard.press('Enter');
 await expect(page.getByText('Columnas obligatorias:',{exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(help).toBeFocused();
 await expect(help.locator('..')).not.toHaveAttribute('open','');
 const form=page.locator('.r2-upload-form');await form.getByLabel('Nombre de la encuesta',{exact:true}).fill('Carga de prueba');await form.getByLabel('Periodo',{exact:true}).fill('2026-T4');
 await form.getByLabel('Nivel mínimo de confianza',{exact:true}).fill('0.82');await form.getByRole('combobox',{name:'Asistencia de IA',exact:true}).selectOption('manual');
 await form.getByLabel('CSV original',{exact:true}).setInputFiles({name:'mal.csv',mimeType:'text/csv',buffer:Buffer.from('a,b\nx,y')});
 await expect(form.getByRole('button',{name:'Iniciar clasificación'})).toBeDisabled();await expect(page.locator('.validation-list')).toContainText('Faltan columnas');
 const csv='id_registro,p309\nPRUEBA-1,Venta de fruta\nPRUEBA-2,\n';
 const transfer=await page.evaluateHandle(text=>{const data=new DataTransfer();data.items.add(new File([text],'original.csv',{type:'text/csv'}));return data;},csv);
 await page.getByLabel('Soltar CSV original').dispatchEvent('drop',{dataTransfer:transfer});
 await form.getByRole('button',{name:'Iniciar clasificación'}).click();await expect(page.getByRole('alert')).toContainText('temporalmente');await expect(page.locator('.epen-selected-file')).toBeVisible();
 await form.getByLabel('Datos sintéticos de prueba').check();
 await form.evaluate(el=>{el.requestSubmit();el.requestSubmit();});await expect(page.locator('.epen-selected-file')).toHaveCount(0);
 const posts=calls.filter(c=>c.path==='/api/r2/jobs'&&c.method==='POST');expect(posts).toHaveLength(2);expect(posts[1].body).toBe(csv);
 expect(posts[1].query).toMatchObject({threshold:'0.82',qwenMode:'manual',synthetic:'true',period:'2026-T4'});expect(posts[1].headers['x-csrf-token']).toBe('csrf-test');expect(errors).toEqual([]);
});

test('bases conserva seguimiento, cancelación, versiones, exportación y herramientas',async({page})=>{
 const {calls}=await setup(page);await page.goto('/bases');
 await expect(page.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow','33');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cancelar trabajo'}).first().click();await expect(page.getByText('Cancelando…',{exact:true})).toBeVisible();
 await expect(page.locator('.job-card')).toHaveCount(2);
 await page.getByRole('button',{name:'Ver los 6 trabajos'}).click();await expect(page.locator('.job-card')).toHaveCount(4);
 await page.locator('.jobs-pager').getByRole('button',{name:'Siguiente'}).click();await expect(page.locator('.job-card')).toHaveCount(2);await expect(page.locator('.jobs-pager')).toContainText('Página 2 de 2');
 const versions=page.locator('.versions-panel');await versions.getByRole('button',{name:'Siguiente'}).click();await expect(versions.getByRole('listitem')).toHaveCount(2);
 await versions.getByLabel('Buscar',{exact:true}).fill('base-2.csv');await expect(versions.getByRole('listitem')).toHaveCount(1);
 const download=page.waitForEvent('download');await versions.getByRole('button',{name:/Exportar .* en CSV/}).click();expect((await download).suggestedFilename()).toContain('resultados');
 await versions.getByRole('button',{name:/Usar la base/}).click();await expect(page.getByRole('status')).toContainText('Base activa actualizada');
 await page.getByText('Importar un resultado procesado fuera del sistema',{exact:true}).click();
 const advanced=page.locator('.advanced-disclosure').filter({hasText:'Importar un resultado procesado fuera del sistema'});
 const processed=readFileSync('frontend/public/plantilla_importacion.csv');await advanced.getByLabel('Archivos CSV procesados').setInputFiles([{name:'procesado-a.csv',mimeType:'text/csv',buffer:processed},{name:'procesado-b.csv',mimeType:'text/csv',buffer:processed}]);
 await advanced.getByLabel('Nombre de la base').nth(0).fill('Importación A');await advanced.getByLabel('Nombre de la base').nth(1).fill('Importación B');
 await advanced.getByLabel('Periodo',{exact:true}).nth(0).fill('2026-T3');await advanced.getByLabel('Periodo',{exact:true}).nth(1).fill('2026-T4');
 await advanced.getByRole('button',{name:'Importar 2 archivos'}).click();
 await expect.poll(()=>calls.filter(c=>c.path==='/api/admin/datasets'&&c.method==='POST').length).toBe(2);
 await expect(page.getByText('Simular el nivel mínimo de confianza',{exact:false})).toHaveCount(0);
});

test('navegación conserva detalle, versiones, historial y revisión',async({page})=>{
 const {calls,errors}=await setup(page);await page.goto('/');
 await expect(page.getByRole('link',{name:'Continuar codificando'})).toHaveAttribute('href','/casos');await expect(page.getByRole('link',{name:'Ver todos'})).toHaveAttribute('href','/casos');
 await page.getByRole('link',{name:'Abrir',exact:true}).click();await expect(page.locator('.response-grid')).toContainText('base 1');
 await expect(page.locator('.qwen-result')).not.toContainText('Qwen');await expect(page.locator('.qwen-result')).not.toContainText('R2');
 await page.getByRole('button',{name:'Volver a codificación',exact:false}).click();
 await page.locator('.workspace-picker__trigger').click();await page.getByRole('option').filter({hasText:'Base de prueba 2'}).click();
 await expect(page).toHaveURL(/dataset=2/);await page.getByRole('link',{name:'Ver detalle'}).click();await expect(page.locator('.response-grid')).toContainText('base 2');
 await page.getByRole('button',{name:'Revisión',exact:true}).click();await expect.poll(()=>calls.some(c=>c.path==='/api/datasets/2/cases/PRUEBA-001/decision'&&JSON.parse(c.body).action==='derivación')).toBe(true);
 await page.goto('/historial?dataset=2');await expect(page.locator('.audit-table')).toContainText('PRUEBA-001');await page.getByLabel('Buscar',{exact:true}).fill('no existe');await expect(page.getByText('No hay decisiones con estos filtros.')).toBeVisible();
 expect(errors).toEqual([]);
});

test('asistente flotante conserva el pie y permite comparar sin configuración manual',async({page})=>{
 const {calls,errors}=await setup(page);await page.setViewportSize({width:1366,height:768});await page.goto('/');
 await page.getByRole('button',{name:'Abrir asistente EPEN'}).click();
 const drawer=page.getByRole('dialog',{name:'Asistente EPEN'});await expect(drawer).toBeVisible();
 const compare=drawer.getByRole('button',{name:'Comparar periodos'});await expect(compare).toBeEnabled();await compare.click();
 await expect(drawer.getByText('Comparación calculada con las bases seleccionadas.')).toBeVisible();
 const bounds=await drawer.boundingBox();expect(bounds.y+bounds.height).toBeLessThanOrEqual(768);await expect(drawer.getByText('Abrir análisis completo')).toBeVisible();
 expect(calls.some(call=>call.path==='/api/assistant/chat'&&JSON.parse(call.body).compareDatasetId)).toBe(true);expect(errors).toEqual([]);
});

test('métricas informa si el servicio está desactualizado sin dejar la pantalla en blanco', async ({ page }) => {
 const { errors } = await setup(page);
 await page.route('**/api/analytics/datasets/*/summary', route => route.fulfill({json:{dataset:{period:'2026-T4'},totals:{total:2},topCodes:[]}}));
 await page.goto('/metricas');
 await expect(page.getByRole('heading',{name:'Métricas y calidad'})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'indicadores incompletos'})).toBeVisible();
 expect(errors).toEqual([]);
});

test('antecedentes permanecen alineados al abrirse en escritorio y móvil', async ({ page }) => {
 await setup(page);
 for (const width of [1366, 390]) {
  await page.setViewportSize({width,height:900}); await page.goto('/casos/PRUEBA-001?dataset=1');
  const history = page.locator('.detail-history .history-disclosure');
  const support = page.locator('.support-stack .support-disclosure').first();
  await expect(history).toBeVisible(); await history.locator('summary').click(); await support.locator('summary').click();
  const a = await history.boundingBox(), b = await support.boundingBox();
  expect(Math.abs(a.width-b.width)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
});

for(const role of ['operador','analista','supervisor','auditor']) test(`permisos de administración: ${role}`,async({page})=>{
 const {calls}=await setup(page,{role});await page.goto('/usuarios');await expect(page).not.toHaveURL(/\/usuarios$/);await expect(page.locator('.sidebar').getByRole('link',{name:'Usuarios',exact:true})).toHaveCount(0);expect(calls.some(c=>c.path==='/api/admin/users')).toBe(false);
});

for(const width of [1366,768,390]) test(`revisión visual y desbordamientos ${width}`,async({page},testInfo)=>{
 const {errors}=await setup(page);await page.setViewportSize({width,height:900});
 for(const [name,url] of [['inicio','/'],['bases','/bases'],['usuarios','/usuarios'],['casos','/casos'],['historial','/historial'],['detalle','/casos/PRUEBA-001?dataset=1'],['metricas','/metricas'],['criterios','/criterios'],['asistente','/asistente']]) {
   await page.goto(url);await expect(page.locator('.main-content h1')).toBeVisible();
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(name==='detalle') {
     expect(await page.evaluate(()=>[...document.querySelectorAll('.support-disclosure')].every(item=>!item.open))).toBe(true);
     expect(await page.evaluate(()=>{const box=document.querySelector('.decision-bar').getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight+1;})).toBe(true);
   }
   await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true});
   if(name==='usuarios') {await page.getByRole('tab',{name:'Crear usuario'}).click();await page.screenshot({path:testInfo.outputPath('crear.png'),fullPage:true});}
   if(name==='criterios') {await page.getByRole('tab',{name:'Cambios al catálogo'}).click();await page.screenshot({path:testInfo.outputPath('catalogo.png'),fullPage:true});}
 }
 expect(errors).toEqual([]);
});


test('bases: umbral sugerido 0.92, advertencia y asistencia sin cierre de IA', async ({ page }) => {
  const { calls, errors } = await setup(page);
  await page.goto('/bases');
  const threshold = page.getByLabel('Nivel mínimo de confianza (τ)', { exact: true });
  await expect(threshold).toHaveValue('0.92');
  await expect(page.getByText('Cambiaste el umbral sugerido', { exact: false })).toHaveCount(0);
  await threshold.fill('0.90');
  await expect(page.getByRole('alert')).toContainText('Cambiaste el umbral sugerido de 0.92');
  await threshold.fill('0.92');
  await expect(page.getByText('Cambiaste el umbral sugerido', { exact: false })).toHaveCount(0);
  for (const text of ['Umbral de cierre por IA', 'Marcar como datos sintéticos de prueba', 'Corregir el tipo de datos de una versión', 'Importar salida del clasificador automático']) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Importar un resultado procesado fuera del sistema', { exact: true })).toBeVisible();
  await page.getByLabel('Nombre de la encuesta', { exact: true }).fill('Prueba de configuración');
  await page.locator('form').filter({ has: threshold }).getByLabel('Periodo', { exact: true }).fill('2026-11');
  await page.getByLabel('CSV original', { exact: true }).setInputFiles({ name: 'prueba.csv', mimeType: 'text/csv', buffer: Buffer.from('id_registro,p309\nPRUEBA-1,Venta de fruta\n') });
  await page.getByRole('button', { name: 'Iniciar clasificación automática', exact: true }).click();
  await expect.poll(() => calls.filter(c => c.path === '/api/r2/jobs' && c.method === 'POST').length).toBe(1);
  const request = calls.find(c => c.path === '/api/r2/jobs' && c.method === 'POST');
  expect(request.query).toMatchObject({ threshold: '0.92', synthetic: 'false', qwenMode: 'automatic' });
  expect(request.query).not.toHaveProperty('aiThreshold');
  expect(errors).toEqual([]);
});


test('casos: prioridades por confianza combinadas con vista, búsqueda y paginación', async ({ page }) => {
  const scores = [0, .2, .21, .4, .41, .6, .61, .8, .81, 1, null, ...Array(26).fill(.1)];
  const { errors } = await setup(page, { workspaceFor: id => ({ cases: scores.map((score, index) => ({
    id_registro: `CONF-${index}`, dataset_id: id, p309: 'Venta de alimentos', p308: 'Vendedor',
    confianza_ml: score, estado: 'revision', origen_decision: index === 3 ? 'humano' : 'qwen',
  })) }) });
  await page.route('**/api/datasets/*/coding-dashboard', route => route.fulfill({ json: { referenceVisible: false } }));
  await page.goto('/casos');
  const priority = page.getByRole('combobox', { name: 'Prioridad de revisión' });
  const table = page.getByRole('region', { name: 'Tabla de registros' });
  await expect(priority).toHaveValue('todas');
  await priority.selectOption('urgente');
  await expect(page.getByText('28 resultados', { exact: true })).toBeVisible();
  await expect(table.getByText('0 %', { exact: true })).toBeVisible();
  await expect(table.getByText('20 %', { exact: true })).toBeVisible();
  await expect(table.getByText('Revisión urgente', { exact: true })).toHaveCount(25);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await priority.selectOption('prioritaria');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('navigation', { name: 'Páginas de registros' })).toContainText('Página 1 de 1');
  await page.getByRole('combobox', { name: 'Vista', exact: true }).selectOption('qwen');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('CONF-2');
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('no coincide');
  await expect(table.locator('tbody tr')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Vista', exact: true }).selectOption('todos');
  for (const key of ['detallada', 'regular', 'final']) {
    await priority.selectOption(key);
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table.getByText('Revisión humana', { exact: true })).toHaveCount(2);
  }
  await priority.selectOption('sin_confianza');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('CONF-10');
  await expect(table.getByText('Sin confianza disponible', { exact: true })).toBeVisible();
  await expect(table.getByText('0 %', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(priority).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
async function setup(page, role = 'admin', mode = 'normal') {
  const calls = [],
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const datasets = [1, 2].map(id => ({
    id,
    name: 'Base sintética ' + id,
    period: '2026',
    version: 1,
    records: 100,
    fileName: 'prueba.csv',
    importedAt: '2026-11-01T15:00:00Z', importedBy: 'Prueba', status: id === 1 ? 'active' : 'archived',
    active: id === 1
  }));
  const score = {
    reviewed: 90,
    verified: 90,
    correct: 36,
    incorrect: 54,
    uncertain: 0,
    accuracy: 36 / 90,
    interval: {
      low: .304,
      high: .503
    }
  };
  const coding = {
    coderSectionVisible: mode !== 'empty',
    referenceVisible: mode !== 'empty',
    reference: {
      id: 3,
      name: 'Referencia de prueba',
      period: '2026',
      records: 100
    },
    kpis: {
      records: 100,
      compared: 90,
      pending: 10,
      accuracy: 36 / 90,
      interval: score.interval,
      incorrect: 54,
      coders: 0,
      humanDecisions: 0,
      matchedWithReference: 100
    },
    coders: [],
    analystsReference: [{
      analyst: 'ANALISTA001',
      ...score
    }],
    byBand: [{
      band: '>=0.99',
      ...score
    }],
    byOrigin: [{
      origin: 'ml',
      ...score
    }],
    byDivision: Array.from({
      length: 16
    }, (_, i) => ({
      division: String(i + 10),
      ...score
    })),
    confusions: [{
      systemCode: '1071',
      referenceCode: '5610',
      count: 10
    }],
    daily: []
  };
  await page.route('**/api/**', async route => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    if (!p.startsWith('/api/')) return route.fallback();
    calls.push({
      p,
      method: req.method(),
      body: req.postData(),
      query: url.search
    });
    const json = data => route.fulfill({
      json: data
    });
    if (p === '/api/auth/me') return json({
      user: {
        id: 1,
        name: 'Usuario de prueba',
        username: 'prueba',
        role,
        active: true
      },
      csrfToken: 'test'
    });
    if (p === '/api/data/bootstrap') return json({
      datasets,
      activeDataset: datasets[0],
      cases: [],
      events: []
    });
    if (p.endsWith('/summary')) return json({
      dataset: datasets[0],
      totals: {
        total: 100,
        resolved: 90,
        review: 10,
        pending: 0,
        automatic: 80,
        ai: 10,
        human: 0,
        missingP309: 0,
        missingContext: 2,
        uniqueCodes: 8,
        confidenceBands: {
          high: 90,
          medium: 5,
          low: 5,
          missing: 0
        }
      },
      rates: {
        resolved: .9,
        automatic: .9,
        review: .1,
        completeness: 1,
        topFiveConcentration: .6
      },
      topCodes: Array.from({
        length: 7
      }, (_, i) => ({
        code: String(1000 + i),
        description: 'Actividad económica con descripción completa ' + i,
        count: 10
      })),
      indicators: {
        r2: {
          evaluated: 100,
          accuracy: .92,
          macroF1: .68
        },
        r3: {
          evaluated: 10,
          accuracy: .6
        }
      }
    });
    if (p.endsWith('/coding-dashboard')) return mode === 'error' ? route.fulfill({
      status: 503,
      json: {
        error: 'Servicio no disponible'
      }
    }) : json(coding);
    if (p.endsWith('/quality')) return json({
      coders: []
    });
    if (p.endsWith('/quality-metrics')) return json({
      overall: {
        reviewed: 0,
        verified: 0,
        uncertain: 0,
        incorrect: 0,
        accuracy: null,
        interval: null
      },
      groups: [],
      note: 'Intervalo de Wilson al 95 %.'
    });
    if (p === '/api/reference-datasets') return json({
      references: mode === 'empty' ? [] : [{
        id: 3,
        name: 'Referencia de prueba',
        period: '2026',
        records: 100,
        active: true
      }]
    });
    if (p.endsWith('/reference-comparison')) return json({
      matched: 100,
      onlySystem: 0,
      compared: 90,
      pending: 10,
      overall: score,
      byAnalyst: {
        ANALISTA001: score
      },
      byBand: {
        '>=0.99': score
      },
      byOrigin: {
        ml: score
      },
      discrepancies: Array.from({
        length: 54
      }, (_, i) => ({
        externalId: 'REG-' + i,
        p309: 'Actividad de prueba ' + i,
        systemCode: '1071',
        referenceCode: '5610',
        analyst: 'ANALISTA001',
        origin: 'ml'
      }))
    });
    if (p.endsWith('/quality-sample')) return json({
      items: [{
        decisionId: 123,
        p309: 'Actividad ciega',
        p308: 'Ocupación de prueba',
        p308a: 'Tarea de prueba'
      }]
    });
    if (p.endsWith('/verdict')) return json({
      ok: true
    });
    if (p === '/api/analytics/compare') return json({
      left: {
        dataset: datasets[0],
        totals: {
          resolved: 90
        }
      },
      right: {
        dataset: datasets[1],
        totals: {
          resolved: 80
        }
      },
      codeChanges: [{
        code: '1071',
        description: 'Actividad',
        leftShare: .1,
        rightShare: .2,
        change: .1
      }]
    });
    return route.fulfill({
      status: 404,
      json: {
        error: 'Ruta no preparada'
      }
    });
  });
  return {
    calls,
    errors
  };
}
for (const width of [360, 390, 768, 1024, 1366]) test('métricas y calidad responsive ' + width, async ({
  page
}, info) => {
  const {
    calls,
    errors
  } = await setup(page);
  await page.setViewportSize({
    width,
    height: 900
  });
  await page.goto('/metricas');
  await expect(page.getByRole('heading', {
    name: 'Métricas y calidad'
  })).toBeVisible();
  await expect(page.getByText('Calculando indicadores…')).toHaveCount(0);
  await expect.poll(() => calls.filter(call => call.p.endsWith('/reference-comparison')).length).toBe(1);
  const count = calls.length;
  for (const name of ['Resumen', 'Desempeño', 'Comparaciones', 'Análisis complementario']) {
    await page.getByRole('tab', {
      name,
      exact: true
    }).click();
    await expect(page.getByRole('tab', {
      name,
      exact: true
    })).toHaveAttribute('aria-selected', 'true');
    if (name === 'Comparaciones') {
      await page.getByText('Ver desgloses por confianza y origen').click();
      await expect(page.getByText('Clasificador automático', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Buscar en diferencias recibidas')).toHaveCount(0);
      const table = page.getByRole('region', {
        name: 'Confusiones entre sistema y referencia'
      });
      expect(await table.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    }
    if (name === 'Desempeño') { await expect(page.getByText('Calidad evaluada', { exact: true })).toBeVisible(); await expect(page.getByText('Coincidencia por división CIIU')).toHaveCount(0); await expect(page.getByText('Coincidencia por analista', { exact: true })).toHaveCount(0); }
    if (name === 'Análisis complementario') await expect(page.getByText('1004 · Actividad económica con descripción completa 4')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(name + '.png'),
      fullPage: true
    });
  }
  expect(calls.filter(c => c.method !== 'GET')).toHaveLength(0);
  expect(calls.length).toBe(count);
  expect(errors).toEqual([]);
});
test.skip('verificación conserva muestra, valida y registra solo al confirmar', async ({
  page
}) => {
  const {
    calls,
    errors
  } = await setup(page);
  await page.goto('/calidad?datasetId=2&otro=si');
  await expect(page).toHaveURL(/metricas\?datasetId=2&otro=si&vista=verificacion/);
  await page.getByRole('button', {
    name: 'Cargar muestra',
    exact: true
  }).click();
  await expect(page.getByText('Actividad ciega')).toBeVisible();
  await expect(page.getByRole('article', {
    name: 'Caso a verificar'
  })).not.toContainText('1071');
  await page.getByRole('tab', {
    name: 'Resumen',
    exact: true
  }).click();
  await page.getByRole('tab', {
    name: 'Verificación',
    exact: true
  }).click();
  await expect(page.getByText('Actividad ciega')).toBeVisible();
  const submit = page.getByRole('button', {
    name: 'Registrar verificación',
    exact: true
  });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Código CIIU que asignas', {
    exact: true
  }).fill('5610');
  await submit.click();
  await expect(page.getByText('Verificación registrada. Pasa al siguiente caso.')).toBeVisible();
  expect(calls.filter(c => c.method === 'POST')).toEqual([expect.objectContaining({
    p: '/api/datasets/2/quality-sample/123/verdict',
    body: '{"code":"5610"}'
  })]);
  expect(errors).toEqual([]);
});
test.skip('auditor consulta sin controles de escritura y navega con teclado', async ({
  page
}) => {
  const {
    calls
  } = await setup(page, 'auditor');
  await page.goto('/metricas');
  const first = page.getByRole('tab', {
    name: 'Resumen',
    exact: true
  });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', {
    name: 'Desempeño',
    exact: true
  })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', {
    name: 'Análisis complementario',
    exact: true
  })).toBeFocused();
  await page.getByRole('tab', {
    name: 'Verificación',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: 'Cargar muestra'
  })).toHaveCount(0);
  await expect(page.getByText('Precisión verificada', {
    exact: true
  })).toBeVisible();
  expect(calls.filter(c => c.method !== 'GET')).toHaveLength(0);
});
for (const role of ['operador', 'analista']) test('sin acceso al módulo ' + role, async ({
  page
}) => {
  const {
    calls
  } = await setup(page, role);
  await page.goto('/calidad');
  await expect(page).not.toHaveURL(/calidad|metricas/);
  expect(calls.some(c => c.p.endsWith('/quality-metrics'))).toBe(false);
});
for (const mode of ['empty', 'error']) test.skip('estado ' + mode, async ({
  page
}) => {
  const {
    errors
  } = await setup(page, 'admin', mode);
  await page.goto('/metricas');
  if (mode === 'error') await expect(page.getByText('Servicio no disponible')).toBeVisible();
  await page.getByRole('tab', {
    name: 'Verificación',
    exact: true
  }).click();
  await expect(page.getByText('Sin muestra').first()).toBeVisible();
  expect(errors).toEqual([]);
});
test.skip('cambiar base elimina la muestra anterior y compara la selección actual', async ({
  page
}) => {
  const {
    calls
  } = await setup(page);
  await page.goto('/metricas?vista=verificacion');
  await page.getByRole('button', {
    name: 'Cargar muestra',
    exact: true
  }).click();
  await expect(page.getByText('Actividad ciega')).toBeVisible();
  await page.getByRole('button', {
    name: /Base sintética 1 ·/
  }).click();
  await page.getByRole('option').filter({
    hasText: 'Base sintética 2'
  }).click();
  await expect(page.getByText('Actividad ciega')).toHaveCount(0);
  await expect(page).toHaveURL(/datasetId=2/);
  await page.getByRole('tab', {
    name: 'Análisis complementario',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: 'Comparar bases',
    exact: true
  }).click();
  await expect(page.getByText('+10.0 pp')).toBeVisible();
  expect(calls.find(c => c.p === '/api/analytics/compare').query).toBe('?left=2&right=1');
  expect(calls.filter(c => c.method !== 'GET')).toHaveLength(0);
});

test.skip('muestra: error recuperable y decisión no clasificable',async({page})=>{const {calls,errors}=await setup(page);let fail=true;await page.route('**/api/datasets/*/quality-sample?*',route=>{if(fail){fail=false;return route.fulfill({status:503,json:{error:'Muestra temporalmente no disponible'}});}return route.fallback();});await page.goto('/metricas?vista=verificacion');await page.getByRole('button',{name:'Cargar muestra',exact:true}).click();await expect(page.getByText('Muestra temporalmente no disponible')).toBeVisible();await page.getByRole('button',{name:'Cargar muestra',exact:true}).click();await page.getByRole('button',{name:'No clasificable',exact:true}).click();await expect(page.getByText('Verificación registrada. Pasa al siguiente caso.')).toBeVisible();expect(calls.find(c=>c.method==='POST').body).toBe('{"code":"no_clasificable"}');expect(errors).toEqual([]);});

test('navegación retirada y orden de desempeño',async({page})=>{const {calls}=await setup(page);await page.goto('/calidad?datasetId=2&otro=si');await expect(page).toHaveURL(/vista=resumen/);await expect(page.getByRole('tab')).toHaveCount(4);await expect(page.getByRole('tab',{name:'Verificación'})).toHaveCount(0);await page.getByRole('tab',{name:'Desempeño'}).click();const headings=await page.locator('[role=tabpanel] h3').allTextContents();expect(headings.indexOf('Calidad evaluada')).toBeLessThan(headings.indexOf('Avance por analista'));await expect(page.getByText('No coinciden',{exact:true}).first()).toBeVisible();expect(calls.some(c=>c.p.endsWith('/quality-metrics'))).toBe(false);});

test('resumen integra indicadores secundarios sin franjas',async({page})=>{await setup(page);await page.goto('/metricas');const region=page.getByRole('region',{name:'Indicadores principales'});await expect(region.locator(':scope > div > section')).toHaveCount(4);await expect(region).toContainText('100 con referencia');await expect(region).toContainText('Cobertura resuelta: 90.0 %');await expect(region).toContainText('36 coinciden · 54 no coinciden');await expect(region).toContainText('Cobertura automática: 90.0 %');await expect(region).toContainText('Codificadores: 0 · 0 decisiones humanas');await expect(page.getByRole('figure',{name:'Estado del procesamiento'})).toBeVisible();});

test('encabezados compactos de módulos principales',async({page})=>{const {errors}=await setup(page);await page.route('**/api/r2/jobs',route=>route.fulfill({json:{jobs:[]}}));await page.route('**/api/admin/users',route=>route.fulfill({json:{users:[]}}));for(const url of ['/','/casos','/bases','/historial','/criterios','/usuarios','/sistema','/asistente']){await page.goto(url);const heading=page.locator('main h1').first();await expect(heading, url).toBeVisible();const header=heading.locator('xpath=ancestor::header[1]');await expect(header).toBeVisible();expect(await header.evaluate(el=>getComputedStyle(el).marginBottom)).toBe('0px');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}expect(errors).toEqual([]);});

test('confusiones sin registros muestra estado vacío',async({page})=>{const {errors}=await setup(page);await page.route('**/api/datasets/*/coding-dashboard',async(route,request)=>{const data={coderSectionVisible:true,referenceVisible:true,reference:{name:'Referencia',period:'2026',records:10},kpis:{records:10,compared:10,pending:0,accuracy:1,incorrect:0,coders:0,humanDecisions:0,matchedWithReference:10},coders:[],analystsReference:[],byBand:[],byOrigin:[],byDivision:[],confusions:[],daily:[]};await route.fulfill({json:data});});await page.goto('/metricas?vista=comparaciones');await expect(page.getByText('No hay confusiones disponibles para esta base.')).toBeVisible();expect(errors).toEqual([]);});

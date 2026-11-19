// Gráfica ECharts con carga modular: solo se incluyen los tipos que usa esta página.
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export default function EChart({ option, label, height = 260 }) {
  const container = useRef(null);
  const instance = useRef(null);

  useEffect(() => {
    const chart = echarts.init(container.current, null, { renderer: 'canvas' });
    instance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setOption(option, true);
  }, [option]);

  return <div ref={container} role="img" aria-label={label} style={{ height }} className="w-full min-w-0" />;
}

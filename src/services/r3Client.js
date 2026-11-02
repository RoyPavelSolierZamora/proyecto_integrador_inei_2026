function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function consultarQwen(caso) {
  await wait(850);
  return caso.qwen_demo;
}

export const runtimeConfig = Object.freeze({
  dataMode: import.meta.env.VITE_DATA_MODE || 'demo',
});

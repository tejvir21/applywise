import { createApp } from './src/app.js';

const app = createApp();

app._router.stack.forEach((layer) => {
  if (layer.route) {
    console.log(layer.route.path, layer.route.stack.map(s => s.method).join(','));
  } else if (layer.name === 'router') {
    layer.handle.stack.forEach((layer) => {
      if (layer.route) {
        console.log(layer.route.path, layer.route.stack.map(s => s.method).join(','));
      }
    });
  });
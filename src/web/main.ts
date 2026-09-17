import { mount } from 'svelte';
import App from './App.svelte';
import { readThemePreference, resolveTheme } from './theme';
import './app.css';

// Apply the saved preference before mounting any UI.
document.documentElement.dataset.theme = resolveTheme(
  readThemePreference(), matchMedia('(prefers-color-scheme: dark)').matches,
);
const target = document.getElementById('app');
if (!target) throw new Error('Application mount target not found');
mount(App, { target });

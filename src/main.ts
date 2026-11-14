import { mount } from 'svelte';
import App from './ui/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');
// The static intro of index.html is for visitors and crawlers without JavaScript (#135).
target.replaceChildren();

export default mount(App, { target });

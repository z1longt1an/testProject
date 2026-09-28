import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// cTrader passes the host's theme as ?theme=light|dark
if (new URLSearchParams(location.search).get('theme') === 'dark') {
  document.documentElement.dataset.theme = 'dark'
}

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app

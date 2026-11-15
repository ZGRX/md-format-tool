import { createRoot } from 'react-dom/client'
import App from './app.tsx'
import 'katex/dist/katex.min.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initAppearance } from './theme';

initAppearance(); // vor dem ersten Zeichnen, damit nichts aufblitzt

createRoot(document.getElementById('root')).render(<App />);

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import contentCss from './editor-content.css?raw';

// 편집 영역 서식(HTML 내보내기에도 같은 CSS 사용)
const style = document.createElement('style');
style.id = 'editor-content-css';
style.textContent = contentCss;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(<App />);

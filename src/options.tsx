import '../styles/options.scss';
import React from 'react';
import ReactDOM from 'react-dom';

import Options from './component/Options';

const container = document.getElementById('codeium-options');
if (container !== null) {
  ReactDOM.render(<Options />, container);
}

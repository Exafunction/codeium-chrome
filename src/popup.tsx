import '../styles/popup.scss';

import React from 'react';
import ReactDOM from 'react-dom';

import { PopupPage } from './component/Popup';

const container = document.getElementById('codeium-popup');

if (container !== null) {
  ReactDOM.render(<PopupPage />, container);
}

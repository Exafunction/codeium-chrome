import React, { createRef, useEffect, useRef, useState } from 'react';

import { PROFILE_URL } from '../auth';
import { getStorageItem, setStorageItem } from '../storage';
import Box from '@mui/material/Box';
import { TextField, Button, Link, Typography, Snackbar, Alert } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LoginIcon from '@mui/icons-material/Login';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import CloseIcon from '@mui/icons-material/Close';
import ChecklistRtlIcon from '@mui/icons-material/ChecklistRtl';
import { v4 as uuidv4 } from 'uuid';

const EditableList = () => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<'success' | 'error'>('success');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const whitelist = await getStorageItem('whitelist');
      setText(whitelist.join('\n'));
    })();
  }, []);

  return (
    <>
      <Typography variant="h6">
        Whitelist{' '}
        <ChecklistRtlIcon
          sx={{
            verticalAlign: 'bottom',
          }}
          fontSize="large"
        />
      </Typography>
      <Typography variant="body2">
        Domains to allow auto-completion, double-click to edit, use regex format
      </Typography>

      <TextField
        label="Domain Regexes"
        variant="standard"
        fullWidth
        value={text}
        multiline
        rows={10}
        sx={{
          '& .MuiInputBase-root': {
            fontSize: '0.8rem',
            fontFamily: 'monospace',
          },
        }}
        onChange={(e) => setText(e.target.value)}
      ></TextField>

      <Button
        variant="text"
        onClick={() => {
          const lst = text.split('\n').map((x) => x.trim());
          for (const rule of lst) {
            try {
              new RegExp(rule);
            } catch (e) {
              setSeverity('error');
              setMessage(`Invalid regex: ${rule}`);
              setOpen(true);
              return;
            }
          }
          setStorageItem('whitelist', lst);
          setSeverity('success');
          setMessage('Saved successfully');
          setOpen(true);
        }}
        sx={{
          float: 'right',
          textTransform: 'none',
        }}
      >
        Save <SaveAltIcon />
      </Button>

      <Button
        variant="text"
        sx={{
          float: 'right',
          textTransform: 'none',
        }}
        onClick={window.close}
      >
        Exit <CloseIcon />
      </Button>

      <Snackbar
        open={open}
        autoHideDuration={3000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={severity} sx={{ width: '100%' }} onClose={() => setOpen(false)}>
          {message}
        </Alert>
      </Snackbar>
    </>
  );
};

const openTokenPage = async () => {
  const params = new URLSearchParams({
    response_type: 'token',
    redirect_uri: 'chrome-show-auth-token',
    scope: 'openid profile email',
    prompt: 'login',
    redirect_parameters_type: 'query',
    state: uuidv4(),
  });
  await chrome.tabs.create({ url: `${PROFILE_URL}?${params}` });
};

const Options = () => {
  const ref = createRef<HTMLInputElement>();
  return (
    <Box sx={{ width: '100%', maxWidth: 400, bgcolor: 'background.paper' }}>
      <Typography variant="body2">
        <SettingsIcon
          fontSize="small"
          sx={{
            verticalAlign: 'bottom',
            marginRight: '0.2em',
            marginLeft: '0.4em',
            bottom: '-0.1em',
          }}
        />{' '}
        Edit telemetry settings at the{' '}
        <Link href="https://codeium.com/profile" target="_blank">
          Codeium website
          <OpenInNewIcon
            fontSize="small"
            sx={{
              verticalAlign: 'bottom',
            }}
          />
        </Link>
      </Typography>
      <Box sx={{ my: 2, mx: 2 }}>
        <Typography variant="h6"> Alternative ways to log in </Typography>
        <TextField
          id="token"
          label="Token"
          variant="standard"
          fullWidth
          type="password"
          inputRef={ref}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="text" onClick={openTokenPage} sx={{ textTransform: 'none' }}>
            Get Token <OpenInNewIcon />
          </Button>

          <Button
            variant="text"
            onClick={async () => {
              // get token from input
              const token = ref.current?.value;
              await chrome.runtime.sendMessage({ type: 'manual', token: token });
            }}
            sx={{ textTransform: 'none' }}
          >
            Enter Token <LoginIcon />
          </Button>
        </Box>
      </Box>
      <Box sx={{ my: 2, mx: 2 }}>
        <EditableList />
      </Box>
    </Box>
  );
};

export default Options;
